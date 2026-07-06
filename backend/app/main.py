"""
SyllabusX-Ray — FastAPI Application Entry Point
===================================================
This is the central hub that wires everything together:
- Mounts all API routers
- Configures CORS (Cross-Origin Resource Sharing)
- Sets up rate limiting middleware
- Handles application lifecycle (startup/shutdown)

START THE SERVER:
  uvicorn app.main:app --reload --port 8000

INTERACTIVE API DOCS:
  Open http://localhost:8000/docs for the Swagger UI
  Open http://localhost:8000/redoc for ReDoc
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.auth.middleware import limiter, rate_limit_exceeded_handler
from app.routers import upload, analysis, search, scheduler, share

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-25s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    
    STARTUP: Runs once when the server starts
    - Validates configuration
    - Creates upload directory
    - Pre-loads models (optional, for faster first request)
    
    SHUTDOWN: Runs once when the server stops
    - Cleans up temporary files
    """
    # --- STARTUP ---
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("SyllabusX-Ray Backend Starting...")
    logger.info(f"  Environment: {settings.app_env}")
    logger.info(f"  CORS Origins: {settings.cors_origins_list}")
    logger.info(f"  Groq Model: {settings.groq_model}")
    logger.info(f"  Embedding Model: {settings.embedding_model}")
    logger.info("=" * 60)

    # Create upload directory
    os.makedirs(settings.upload_dir, exist_ok=True)

    yield  # Server is running, handling requests

    # --- SHUTDOWN ---
    logger.info("SyllabusX-Ray Backend Shutting Down...")
    # Clean up any remaining temp files
    upload_dir = settings.upload_dir
    if os.path.exists(upload_dir):
        for f in os.listdir(upload_dir):
            try:
                os.remove(os.path.join(upload_dir, f))
            except OSError:
                pass
    logger.info("Shutdown complete.")


# Create the FastAPI application
app = FastAPI(
    title="SyllabusX-Ray API",
    description=(
        "Production-grade Hybrid RAG exam preparation system. "
        "Upload your syllabus & PYQs → get the 20% of topics that account for 80% of marks."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# --- Middleware ---

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS — Allow the Next.js frontend to call this API
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # Required for JWT cookies
    allow_methods=["*"],     # Allow all HTTP methods
    allow_headers=["*"],     # Allow all headers (including Authorization)
)

# --- Mount Routers ---
app.include_router(upload.router)
app.include_router(analysis.router)
app.include_router(search.router)
app.include_router(scheduler.router)
app.include_router(share.router)


# --- Health Check ---
@app.get("/", tags=["Health"])
async def health_check():
    """
    Simple health check endpoint.
    Used by deployment platforms (Render, HF Spaces) to verify the app is alive.
    """
    return {
        "status": "healthy",
        "service": "SyllabusX-Ray API",
        "version": "1.0.0"
    }


@app.get("/health", tags=["Health"])
async def detailed_health():
    """
    Detailed health check with dependency status.
    """
    settings = get_settings()
    
    # Check Supabase connectivity
    supabase_ok = False
    try:
        from app.models.database import get_supabase_admin_client
        client = get_supabase_admin_client()
        # Simple query to check connectivity
        client.table("courses").select("count").limit(0).execute()
        supabase_ok = True
    except Exception:
        pass

    return {
        "status": "healthy" if supabase_ok else "degraded",
        "service": "SyllabusX-Ray API",
        "version": "1.0.0",
        "dependencies": {
            "supabase": "connected" if supabase_ok else "disconnected",
            "groq_model": settings.groq_model,
            "embedding_model": settings.embedding_model,
        }
    }
