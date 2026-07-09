"""
Search Router — Hybrid RAG Query API
=========================================
Handles student questions by running the full RAG pipeline:
Query → Hybrid Search → RRF Fusion → FlashRank Reranking → Groq LLM → Response
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth.jwt_handler import get_current_user
from app.auth.middleware import limiter
from app.models.schemas import SearchQuery, SearchResponse
from app.services.hybrid_search import get_hybrid_search_service
from app.services.reranker import get_reranker_service
from app.services.llm_client import get_llm_client
from app.utils.prompt_guard import validate_user_query
from app.models.database import get_supabase_admin_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["Search"])


@router.post("/", response_model=SearchResponse)
@limiter.limit("30/minute")
async def search_course_materials(
    request: Request,
    query: SearchQuery,
    user: dict = Depends(get_current_user)
):
    """
    Ask a question about your course materials.
    
    THE FULL RAG PIPELINE:
    1. Validate query (prompt injection check)
    2. Hybrid search: vector (semantic) + keyword (exact) → 30 candidates
    3. RRF fusion: merge both result sets by rank
    4. FlashRank reranking: cross-encoder narrows 30 → top_k (default 5)
    5. Groq LLM: generates structured answer from top chunks
    6. Return answer + source chunks + confidence score
    """
    # Verify user owns this course
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", query.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    # Step 1: Validate the query for prompt injection
    injection_error = validate_user_query(query.query)
    if injection_error:
        raise HTTPException(status_code=400, detail=injection_error)

    # Step 2 & 3: Hybrid search with RRF fusion
    search_service = get_hybrid_search_service()
    search_results = await search_service.search(
        query=query.query,
        course_id=query.course_id,
        top_k=30  # Get 30 candidates for reranking
    )

    if not search_results:
        return SearchResponse(
            query=query.query,
            mode=query.mode,
            answer="I couldn't find any relevant content in your uploaded materials. "
                   "Make sure you've uploaded the relevant syllabus and PYQ papers.",
            source_chunks=[],
            confidence_score=0.0
        )

    # Step 4: FlashRank reranking (30 → top_k)
    reranker = get_reranker_service()
    reranked = await reranker.rerank(
        query=query.query,
        results=search_results,
        top_k=query.top_k
    )

    # Step 5: Generate LLM response from top chunks
    llm = get_llm_client()
    llm_response = await llm.generate_study_content(
        query=query.query,
        context_chunks=reranked,
        mode=query.mode.value,
        detailed=query.detailed
    )

    # Step 6: Build response
    confidence = llm_response.get("confidence", 0.5)
    answer = llm_response.get("answer", "Unable to generate a response.")

    # Clean source chunks for frontend display (remove embeddings, internal fields)
    clean_sources = []
    for chunk in reranked:
        clean_sources.append({
            "content": chunk.get("content", "")[:500],  # Truncate for display
            "metadata": chunk.get("metadata", {}),
            "rerank_score": chunk.get("rerank_score", 0),
            "rank": chunk.get("rank", 0)
        })

    # Build llm_extras from the full LLM response (mode-specific fields)
    llm_extras = {k: v for k, v in llm_response.items() if k not in ("answer", "confidence", "error")}

    return SearchResponse(
        query=query.query,
        mode=query.mode,
        answer=answer,
        source_chunks=clean_sources,
        confidence_score=confidence,
        llm_extras=llm_extras if llm_extras else None
    )


@router.post("/flashcards")
@limiter.limit("10/minute")
async def generate_flashcards(
    request: Request,
    query: SearchQuery,
    user: dict = Depends(get_current_user)
):
    """
    Generate flashcards from course materials related to a topic query.
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", query.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    # Search for relevant content
    search_service = get_hybrid_search_service()
    search_results = await search_service.search(
        query=query.query,
        course_id=query.course_id,
        top_k=30
    )

    reranker = get_reranker_service()
    reranked = await reranker.rerank(
        query=query.query,
        results=search_results,
        top_k=10  # More context for flashcard generation
    )

    llm = get_llm_client()
    flashcards = await llm.generate_flashcards(reranked, avoid_questions=query.avoid_questions)
    
    return flashcards


@router.post("/quiz")
@limiter.limit("10/minute")
async def generate_quiz(
    request: Request,
    query: SearchQuery,
    user: dict = Depends(get_current_user)
):
    """
    Generate a quiz from course materials related to a topic query.
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", query.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    search_service = get_hybrid_search_service()
    search_results = await search_service.search(
        query=query.query,
        course_id=query.course_id,
        top_k=30
    )

    reranker = get_reranker_service()
    reranked = await reranker.rerank(
        query=query.query,
        results=search_results,
        top_k=10
    )

    llm = get_llm_client()
    quiz = await llm.generate_quiz(reranked, avoid_questions=query.avoid_questions)
    
    return quiz


@router.post("/cheatsheet")
@limiter.limit("10/minute")
async def generate_cheatsheet(
    request: Request,
    query: SearchQuery,
    user: dict = Depends(get_current_user)
):
    """
    Generate a Panic Mode ultra-compact cheat sheet from course materials.
    Contains only the most critical formulas, definitions, and key facts.
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", query.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    search_service = get_hybrid_search_service()
    search_results = await search_service.search(
        query=query.query or "important formulas definitions key concepts",
        course_id=query.course_id,
        top_k=30
    )

    reranker = get_reranker_service()
    reranked = await reranker.rerank(
        query=query.query or "important formulas definitions key concepts",
        results=search_results,
        top_k=15  # More context for cheat sheet
    )

    llm = get_llm_client()
    # Force panic mode for cheatsheet
    cheatsheet = await llm.generate_study_content(
        query=query.query or "Generate a comprehensive cheat sheet with all key formulas, definitions, and must-know facts",
        context_chunks=reranked,
        mode="panic"
    )
    
    return {
        "topic": query.query,
        "cheatsheet": cheatsheet.get("answer", ""),
        "essential_definitions": cheatsheet.get("essential_definitions", []),
        "essential_formulas": cheatsheet.get("essential_formulas", []),
        "quick_tips": cheatsheet.get("quick_tips", []),
        "confidence": cheatsheet.get("confidence", 0.5)
    }
