"""
Pydantic Schemas (Request/Response Models)
==========================================
These define the EXACT shape of data flowing in and out of every API endpoint.

WHY PYDANTIC SCHEMAS MATTER:
- FastAPI uses these to auto-generate OpenAPI docs (Swagger UI at /docs)
- Invalid requests are rejected with clear error messages BEFORE hitting your code
- Response models strip out any fields you don't want exposed (e.g., internal IDs)
- TypeScript types on the frontend can be generated from these schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ============================================================
# Enums — Constrained choices that prevent invalid data
# ============================================================

class FileType(str, Enum):
    """A document is either a syllabus outline or a past year paper."""
    SYLLABUS = "syllabus"
    PYQ = "pyq"


class ProcessingStatus(str, Enum):
    """Tracks where a document is in the ingestion pipeline."""
    PENDING = "pending"        # Uploaded, waiting in queue
    PROCESSING = "processing"  # Docling is extracting text right now
    COMPLETED = "completed"    # Successfully chunked and embedded
    FAILED = "failed"          # Something went wrong (error stored)


class StudyMode(str, Enum):
    """
    The three adaptive study modes that control content filtering.
    
    - DEEP_DIVE: Show everything — full study guides, all topics
    - EFFICIENCY: 80/20 filter — only high-probability exam topics
    - PANIC: Emergency mode — just formulas, definitions, key templates
    """
    DEEP_DIVE = "deep_dive"
    EFFICIENCY = "efficiency"
    PANIC = "panic"


# ============================================================
# Request Schemas — What the frontend sends TO the backend
# ============================================================

class UploadRequest(BaseModel):
    """Metadata sent alongside a PDF file upload."""
    course_name: str = Field(..., min_length=1, max_length=200,
                             description="Name of the academic course")
    course_code: Optional[str] = Field(None, max_length=20,
                                       description="e.g., CS402, MA201")
    university: Optional[str] = Field(None, max_length=200)
    file_type: FileType
    exam_year: Optional[int] = Field(None, ge=2000, le=2030,
                                     description="Only required for PYQ files")


class SearchQuery(BaseModel):
    """A question the student asks about their course material."""
    course_id: str = Field(..., description="UUID of the course to search within")
    query: str = Field(..., min_length=3, max_length=2000,
                       description="The student's question")
    mode: StudyMode = Field(default=StudyMode.EFFICIENCY,
                            description="Controls response depth and filtering")
    detailed: bool = Field(default=False, description="Generate highly detailed, multi-paragraph explanations")
    top_k: int = Field(default=5, ge=1, le=20,
                       description="Number of final context chunks to use")


class SchedulerRequest(BaseModel):
    """Input for generating an adaptive study schedule."""
    course_id: str
    exam_date: datetime = Field(..., description="When is the exam?")
    hours_per_day: float = Field(..., ge=0.5, le=16,
                                 description="Available study hours per day")
    mode: StudyMode = Field(default=StudyMode.EFFICIENCY)


class ShareRequest(BaseModel):
    """Request to generate a shareable link for a course profile."""
    course_id: str
    expires_in_hours: Optional[int] = Field(default=168,  # 1 week
                                            ge=1, le=720,
                                            description="Link expiry in hours")


# ============================================================
# Response Schemas — What the backend sends TO the frontend
# ============================================================

class CourseResponse(BaseModel):
    """A course with its processing status."""
    id: str
    name: str
    code: Optional[str] = None
    university: Optional[str] = None
    document_count: int = 0
    processing_status: str = "pending"
    created_at: datetime


class UploadResponse(BaseModel):
    """Confirmation after a successful file upload."""
    document_id: str
    course_id: str
    file_name: str
    file_type: FileType
    page_count: Optional[int] = None
    status: ProcessingStatus = ProcessingStatus.PENDING
    message: str = "File uploaded successfully. Processing will begin shortly."


class TopicFrequency(BaseModel):
    """How often a topic appears across exam years, with mark totals."""
    topic_name: str
    total_marks: int
    times_appeared: int
    years_appeared: list[int]
    weightage_percent: float = Field(..., description="% of total marks")
    trend: str = Field(..., description="'increasing', 'decreasing', or 'stable'")


class AnalysisResponse(BaseModel):
    """Complete analytics output for a course."""
    course_id: str
    course_name: str
    mode: StudyMode
    total_questions_analyzed: int
    total_marks_analyzed: int
    topic_frequencies: list[TopicFrequency]
    study_guide: Optional[str] = None  # Markdown-formatted guide from LLM
    key_formulas: Optional[list[str]] = None  # For panic mode
    key_definitions: Optional[list[str]] = None  # For panic mode


class SearchResponse(BaseModel):
    """Result of a hybrid RAG search query."""
    query: str
    mode: StudyMode
    answer: str  # LLM-generated answer
    source_chunks: list[dict]  # The context chunks used
    confidence_score: float = Field(..., ge=0, le=1)
    llm_extras: Optional[dict] = None  # Mode-specific structured data (key_concepts, must_know, etc.)


class ScheduleDay(BaseModel):
    """A single day in the generated study schedule."""
    date: str
    day_number: Optional[int] = None
    topics: list[str]
    hours_allocated: float
    priority: str  # "high", "medium", "low"
    is_review: bool = False
    mode_tips: Optional[str] = None       # Mode-specific study tip for the day
    session_strategy: Optional[str] = None  # e.g. "Pomodoro 25/5" or "Deep 90-min blocks"
    day_theme: Optional[str] = None        # e.g. "🚨 Survival Day" or "🔬 Deep Study"
    details: Optional[list[dict]] = None  # Per-topic breakdown


class SchedulerResponse(BaseModel):
    """The complete study schedule for exam preparation."""
    course_id: str
    exam_date: str
    total_days: int
    total_hours: float
    schedule: list[ScheduleDay]


class ShareResponse(BaseModel):
    """A generated shareable link for a course profile."""
    share_url: str
    share_token: str
    expires_at: Optional[datetime] = None


class FlashCard(BaseModel):
    """A single flashcard for active recall practice."""
    id: str
    question: str
    answer: str
    topic: str
    difficulty: str  # "easy", "medium", "hard"
    source_year: Optional[int] = None


class QuizQuestion(BaseModel):
    """A multiple-choice quiz question."""
    id: str
    question: str
    options: list[str]
    correct_index: int
    explanation: str
    topic: str
    difficulty: Optional[str] = None  # "easy", "medium", "hard"
    marks: Optional[int] = None
