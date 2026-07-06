"""
Upload Router — PDF Ingestion API
=====================================
Handles file uploads and triggers the document processing pipeline.

ENDPOINT FLOW:
  1. Student uploads a PDF via the frontend dropzone
  2. This router receives the file + metadata (course, type, year)
  3. File is saved to disk temporarily
  4. Background task triggers:  Docling → Chunking → Embedding → Storage
  5. Student gets an immediate response with document_id + status
  6. Frontend polls for status updates until processing completes
"""

import os
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks, Request
from app.auth.jwt_handler import get_current_user
from app.auth.middleware import limiter
from app.config import get_settings
from app.models.database import get_supabase_admin_client
from app.models.schemas import FileType, UploadResponse, ProcessingStatus
from app.services.pdf_processor import get_pdf_processor
from app.services.chunker import get_chunker
from app.services.embeddings import get_embedding_service
from app.services.llm_client import get_llm_client
from app.utils.prompt_guard import sanitize_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/upload", tags=["Upload"])


@router.post("/", response_model=UploadResponse)
@limiter.limit("20/hour")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PDF file to process"),
    course_name: str = Form(...),
    course_code: str = Form(default=""),
    university: str = Form(default=""),
    file_type: FileType = Form(...),
    exam_year: int = Form(default=None),
    user: dict = Depends(get_current_user)
):
    """
    Upload a PDF document for processing.
    
    The file is validated, saved temporarily, and a background task handles
    the heavy processing (Docling extraction → chunking → embedding).
    
    This endpoint returns IMMEDIATELY with a document_id. The frontend
    should poll GET /api/upload/status/{document_id} for progress.
    """
    settings = get_settings()
    user_id = user["sub"]

    # --- Validate the uploaded file ---
    allowed_extensions = ('.pdf', '.doc', '.docx', '.ppt', '.pptx')
    if not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(status_code=400, detail="Only PDF, Word, and PowerPoint files are accepted")
    
    # Check file size
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB"
        )
    await file.seek(0)  # Reset file pointer

    # --- Create or get the course ---
    supabase = get_supabase_admin_client()
    
    try:
        # Check if course already exists for this user
        existing = supabase.table("courses").select("id").eq(
            "user_id", user_id
        ).eq("name", course_name).execute()

        if existing.data:
            course_id = existing.data[0]["id"]
        else:
            course_result = supabase.table("courses").insert({
                "user_id": user_id,
                "name": course_name,
                "code": course_code or None,
                "university": university or None,
            }).execute()
            course_id = course_result.data[0]["id"]
    except Exception as e:
        error_msg = str(e)
        if "schema cache" in error_msg or "404" in error_msg or "does not exist" in error_msg:
            logger.error(f"Database tables not found: {e}")
            raise HTTPException(
                status_code=503,
                detail="Database tables have not been created yet. Please run the migration SQL in your Supabase SQL Editor."
            )
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")

    # --- Save the file temporarily ---
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_id = str(uuid.uuid4())
    file_ext = Path(file.filename).suffix.lower()
    file_path = upload_dir / f"{file_id}{file_ext}"
    
    with open(file_path, "wb") as f:
        f.write(content)

    # --- Create document record in database ---
    doc_result = supabase.table("documents").insert({
        "user_id": user_id,
        "course_id": course_id,
        "file_name": file.filename,
        "file_type": file_type.value,
        "exam_year": exam_year,
        "processing_status": "pending"
    }).execute()

    document_id = doc_result.data[0]["id"]

    # --- Trigger background processing ---
    background_tasks.add_task(
        process_document_pipeline,
        document_id=document_id,
        course_id=course_id,
        user_id=user_id,
        file_path=str(file_path),
        file_type=file_type.value,
        exam_year=exam_year,
        file_name=file.filename
    )

    logger.info(f"Document {document_id} uploaded by user {user_id}, processing started")

    return UploadResponse(
        document_id=document_id,
        course_id=course_id,
        file_name=file.filename,
        file_type=file_type,
        status=ProcessingStatus.PENDING,
        message="File uploaded successfully. Processing will begin shortly."
    )


@router.get("/status/{document_id}")
async def get_processing_status(
    document_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Check the processing status of an uploaded document.
    
    The frontend polls this endpoint every few seconds after upload.
    """
    supabase = get_supabase_admin_client()
    
    result = supabase.table("documents").select(
        "id, file_name, file_type, processing_status, page_count"
    ).eq("id", document_id).eq("user_id", user["sub"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")

    return result.data[0]


@router.get("/courses")
async def list_user_courses(user: dict = Depends(get_current_user)):
    """List all courses for the authenticated user."""
    supabase = get_supabase_admin_client()
    
    try:
        # Fetch courses along with their documents
        result = supabase.table("courses").select(
            "*, documents(id, processing_status)"
        ).eq("user_id", user["sub"]).order("created_at", desc=True).execute()

        courses = []
        if result.data:
            for course in result.data:
                # Count only successfully completed documents
                docs = course.pop("documents", [])
                completed_count = sum(1 for d in docs if d.get("processing_status") == "completed")
                course["documents"] = [{"count": completed_count}]
                courses.append(course)

        return courses
    except Exception as e:
        error_msg = str(e)
        if "schema cache" in error_msg or "404" in error_msg or "does not exist" in error_msg:
            logger.error(f"Database tables not found: {e}")
            raise HTTPException(
                status_code=503,
                detail="Database tables have not been created yet. Please run the migration SQL in your Supabase SQL Editor."
            )
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")


@router.get("/courses/{course_id}/documents")
async def get_course_documents(
    course_id: str,
    user: dict = Depends(get_current_user)
):
    """List all documents for a specific course."""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("documents").select(
        "id, file_name, file_type, processing_status, page_count, created_at, exam_year"
    ).eq("course_id", course_id).eq("user_id", user["sub"]).order("created_at", desc=True).execute()
    
    return result.data or []


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete a document and all its chunks."""
    supabase = get_supabase_admin_client()
    
    # Ensure document belongs to user
    result = supabase.table("documents").select("id").eq("id", document_id).eq("user_id", user["sub"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Delete document (cascade deletes chunks due to foreign key)
    supabase.table("documents").delete().eq("id", document_id).execute()
    
    return {"message": "Document deleted successfully"}

def get_true_paradigm_metadata(function_name, marks, course_name=""):
    """
    Overrides unstable keyword-based text parsing with a deterministic 
    computer science paradigm classification engine.
    This override is scoped ONLY to DAA/Algorithm courses.
    """
    course_lower = course_name.lower() if course_name else ""
    is_algo_course = "daa" in course_lower or "algorithm" in course_lower or "code" in course_lower or "coding" in course_lower
    
    if not is_algo_course:
        return {"topic": None, "marks": int(marks) if marks else 0}

    # Define an absolute, ironclad mapping of coding problem functions to paradigms
    TRUE_PARADIGM_MAP = {
        "min_coin": "Unbounded Coin Change",
        "mincoin": "Unbounded Coin Change",
        "coin_change": "Unbounded Coin Change",
        "knapsack": "0/1 Knapsack",
        "select_club": "Interval Scheduling",
        "selectclub": "Interval Scheduling",
        "select_reservation": "Interval Scheduling",
        "selectreservation": "Interval Scheduling",
        "transmission_value": "Fractional Knapsack",
        "transmissionvalue": "Fractional Knapsack"
    }
    
    # Normalize function string lookup (remove all spaces, underscores, and special chars)
    import re
    cleaned_name = re.sub(r'[^a-z0-9]', '', function_name.lower())
    
    # Resolve the paradigm safely
    resolved_paradigm = None
    for key, paradigm in TRUE_PARADIGM_MAP.items():
        # Clean the key the same way
        clean_key = re.sub(r'[^a-z0-9]', '', key)
        if clean_key in cleaned_name:
            resolved_paradigm = paradigm
            break
            
    return {
        "topic": resolved_paradigm,
        "marks": int(marks) if marks else 0
    }

@router.post("/documents/{document_id}/reanalyze")
async def reanalyze_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    """Re-run the LLM extraction stage for a document using its raw markdown."""
    supabase = get_supabase_admin_client()
    
    # Fetch the document to ensure ownership and get metadata
    result = supabase.table("documents").select(
        "id, course_id, file_type, exam_year, raw_markdown"
    ).eq("id", document_id).eq("user_id", user["sub"]).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = result.data[0]
    if not doc.get("raw_markdown"):
        raise HTTPException(status_code=400, detail="Cannot re-analyze: Document has no extracted markdown.")

    # Mark as processing
    supabase.table("documents").update({"processing_status": "processing"}).eq("id", document_id).execute()
    
    # Trigger background task
    background_tasks.add_task(
        reanalyze_document_pipeline,
        document_id=doc["id"],
        course_id=doc["course_id"],
        user_id=user["sub"],
        file_type=doc["file_type"],
        exam_year=doc["exam_year"],
        raw_markdown=doc["raw_markdown"]
    )
    
    return {"message": "Re-analysis started", "status": "processing"}

async def reanalyze_document_pipeline(
    document_id: str,
    course_id: str,
    user_id: str,
    file_type: str,
    exam_year: int,
    raw_markdown: str
):
    """Background task to re-run only the LLM extraction step without re-chunking/embedding."""
    supabase = get_supabase_admin_client()
    
    try:
        logger.info(f"Re-analyzing structured data from {file_type} for document {document_id}...")
        llm = get_llm_client()
        
        if file_type == "syllabus":
            # Delete old topics
            supabase.table("syllabus_topics").delete().eq("course_id", course_id).execute()
            
            structured_data = await llm.extract_syllabus_topics(raw_markdown)
            modules = structured_data.get("modules", [])
            if modules:
                syllabus_records = []
                for mod in modules:
                    for top in mod.get("topics", []):
                        syllabus_records.append({
                            "course_id": course_id,
                            "user_id": user_id,
                            "module_number": mod.get("module_number"),
                            "module_name": mod.get("module_name", "Unknown"),
                            "topic_name": top.get("topic_name", "Unknown"),
                            "subtopics": top.get("subtopics", [])
                        })
                if syllabus_records:
                    supabase.table("syllabus_topics").insert(syllabus_records).execute()
                    
        elif file_type == "pyq":
            # Delete old pyq questions for this document
            supabase.table("pyq_questions").delete().eq("document_id", document_id).execute()
            
            # Fetch existing syllabus topics to guide extraction
            syllabus_res = supabase.table("syllabus_topics").select("module_name").eq("course_id", course_id).execute()
            known_topics = None
            if syllabus_res.data:
                # Extract unique module names to use as broad categories
                known_topics = list(set([row["module_name"] for row in syllabus_res.data if row.get("module_name")]))
            
            # Fetch course name for scoped mapping
            course_res = supabase.table("courses").select("name").eq("id", course_id).execute()
            course_name = course_res.data[0]["name"] if course_res.data else ""
            
            structured_data = await llm.extract_pyq_questions(raw_markdown, known_topics=known_topics)
            questions = structured_data.get("questions", [])
            if questions:
                pyq_records = []
                for q in questions:
                    question_text = q.get("question_text", "")
                    original_topic = q.get("topic_name", "Unknown")
                    marks = q.get("marks", 0)
                    
                    # Apply deterministic override based on question text (scoped to course)
                    paradigm_meta = get_true_paradigm_metadata(question_text, marks, course_name=course_name)
                    if paradigm_meta["topic"]:
                        original_topic = paradigm_meta["topic"]
                        
                    pyq_records.append({
                        "document_id": document_id,
                        "course_id": course_id,
                        "user_id": user_id,
                        "question_number": str(q.get("question_number", "")),
                        "question_text": question_text,
                        "topic_name": original_topic,
                        "marks": marks,
                        "exam_year": exam_year
                    })
                if pyq_records:
                    supabase.table("pyq_questions").insert(pyq_records).execute()

        # Success!
        supabase.table("documents").update(
            {"processing_status": "completed"}
        ).eq("id", document_id).execute()

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Re-analysis failed for document {document_id}: {e}\n{error_details}")
        
        supabase.table("documents").update({
            "processing_status": "failed",
        }).eq("id", document_id).execute()




async def process_document_pipeline(
    document_id: str,
    course_id: str,
    user_id: str,
    file_path: str,
    file_type: str,
    exam_year: int,
    file_name: str
):
    """
    Background task: Full document processing pipeline.
    
    PIPELINE STAGES:
    1. Update status → "processing"
    2. Docling PDF extraction → Markdown
    3. Text sanitization (prompt injection guard)
    4. Chunking with metadata tagging
    5. Batch embedding generation
    6. Store chunks + embeddings in Supabase
    7. Update status → "completed"
    
    If any stage fails, status → "failed" with error details.
    """
    supabase = get_supabase_admin_client()
    
    try:
        # Stage 1: Mark as processing
        supabase.table("documents").update(
            {"processing_status": "processing"}
        ).eq("id", document_id).execute()

        # Stage 2: Extract PDF content
        processor = get_pdf_processor()
        extraction = await processor.process_file(file_path)
        
        markdown = extraction["markdown"]
        page_count = extraction.get("page_count", 0)

        if not markdown or len(markdown.strip()) < 10:
            raise ValueError("Document extraction returned insufficient text content")

        # Stage 3: Sanitize text (remove prompt injection attempts)
        sanitized_markdown = sanitize_text(markdown)

        # Save raw markdown to the document record
        supabase.table("documents").update({
            "raw_markdown": sanitized_markdown,
            "page_count": page_count,
        }).eq("id", document_id).execute()

        # Stage 4: Chunk the document
        chunker = get_chunker()
        chunks = chunker.chunk_document(
            markdown=sanitized_markdown,
            course_id=course_id,
            document_id=document_id,
            source_type=file_type,
            file_name=file_name,
            exam_year=exam_year
        )

        if not chunks:
            raise ValueError("Chunking produced no valid chunks")

        # Stage 5: Generate embeddings in batch
        embedding_service = get_embedding_service()
        texts = [chunk["content"] for chunk in chunks]
        embeddings = embedding_service.embed_batch(texts)

        # Stage 6: Store chunks with embeddings
        chunk_records = []
        for chunk, embedding in zip(chunks, embeddings):
            chunk_records.append({
                "document_id": document_id,
                "course_id": course_id,
                "user_id": user_id,
                "chunk_index": chunk["chunk_index"],
                "content": chunk["content"],
                "metadata": chunk["metadata"],
                "embedding": embedding,
            })

        # Insert in batches of 50 to avoid request size limits
        batch_size = 50
        for i in range(0, len(chunk_records), batch_size):
            batch = chunk_records[i:i + batch_size]
            supabase.table("document_chunks").insert(batch).execute()

        # Stage 6.5: Extract structured data using LLM
        logger.info(f"Extracting structured data from {file_type}...")
        llm = get_llm_client()
        
        if file_type == "syllabus":
            structured_data = await llm.extract_syllabus_topics(sanitized_markdown)
            modules = structured_data.get("modules", [])
            if modules:
                syllabus_records = []
                for mod in modules:
                    for top in mod.get("topics", []):
                        syllabus_records.append({
                            "course_id": course_id,
                            "user_id": user_id,
                            "module_number": mod.get("module_number"),
                            "module_name": mod.get("module_name", "Unknown"),
                            "topic_name": top.get("topic_name", "Unknown"),
                            "subtopics": top.get("subtopics", [])
                        })
                if syllabus_records:
                    supabase.table("syllabus_topics").insert(syllabus_records).execute()
                    
        elif file_type == "pyq":
            # Fetch existing syllabus topics to guide extraction
            syllabus_res = supabase.table("syllabus_topics").select("module_name").eq("course_id", course_id).execute()
            known_topics = None
            if syllabus_res.data:
                # Extract unique module names to use as broad categories
                known_topics = list(set([row["module_name"] for row in syllabus_res.data if row.get("module_name")]))
            
            # Fetch course name for scoped mapping
            course_res = supabase.table("courses").select("name").eq("id", course_id).execute()
            course_name = course_res.data[0]["name"] if course_res.data else ""
            
            structured_data = await llm.extract_pyq_questions(sanitized_markdown, known_topics=known_topics)
            questions = structured_data.get("questions", [])
            if questions:
                pyq_records = []
                for q in questions:
                    question_text = q.get("question_text", "")
                    original_topic = q.get("topic_name", "Unknown")
                    marks = q.get("marks", 0)
                    
                    # Apply deterministic override based on question text (scoped to course)
                    paradigm_meta = get_true_paradigm_metadata(question_text, marks, course_name=course_name)
                    if paradigm_meta["topic"]:
                        original_topic = paradigm_meta["topic"]
                        
                    pyq_records.append({
                        "document_id": document_id,
                        "course_id": course_id,
                        "user_id": user_id,
                        "question_number": str(q.get("question_number", "")),
                        "question_text": question_text,
                        "topic_name": original_topic,
                        "marks": marks,
                        "exam_year": exam_year
                    })
                if pyq_records:
                    supabase.table("pyq_questions").insert(pyq_records).execute()

        # Stage 7: Success!
        supabase.table("documents").update(
            {"processing_status": "completed"}
        ).eq("id", document_id).execute()

        logger.info(
            f"Pipeline complete for document {document_id}: "
            f"{page_count} pages → {len(chunks)} chunks → embedded & stored"
        )

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Pipeline failed for document {document_id}: {e}\n{error_details}")
        try:
            with open(f"pipeline_error_{document_id}.log", "w") as f:
                f.write(error_details)
        except Exception:
            pass
            
        supabase.table("documents").update({
            "processing_status": "failed",
        }).eq("id", document_id).execute()

    finally:
        # Clean up temporary file
        try:
            os.remove(file_path)
        except OSError:
            pass
