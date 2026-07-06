"""
SyllabusX-Ray Configuration Module
===================================
Centralizes all environment variables using Pydantic Settings.
This means every config value is type-checked and validated at startup —
if a required key is missing, the app crashes immediately with a clear error
instead of failing silently during a user request.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    All configuration is loaded from environment variables (or a .env file).
    
    HOW IT WORKS:
    - Pydantic reads each field name as an env var (case-insensitive).
    - If a field has a default value, it's optional.
    - If a field has no default, the app won't start without it.
    """

    # --- Groq API ---
    # Your free API key from console.groq.com
    groq_api_key: str
    # Which Groq model to use for generation
    groq_model: str = "llama-3.3-70b-versatile"

    # --- Supabase ---
    # Found in: Supabase Dashboard → Settings → API
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    # Found in: Supabase Dashboard → Settings → API → JWT Settings
    supabase_jwt_secret: str

    # --- Application ---
    app_env: str = "development"
    # Comma-separated origins allowed to call this API
    cors_origins: str = "http://localhost:3000"
    # Max file size for PDF uploads (in megabytes)
    max_upload_size_mb: int = 20
    # Directory to temporarily store uploaded files during processing
    upload_dir: str = "./uploads"

    # --- Rate Limiting ---
    # Format: "count/period" where period is minute, hour, or day
    rate_limit_uploads: str = "20/hour"
    rate_limit_search: str = "30/minute"
    rate_limit_analysis: str = "10/minute"

    # --- Embedding Model ---
    # HuggingFace model ID for generating vector embeddings
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    # Must match the model's output dimensionality
    embedding_dimensions: int = 384

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def max_upload_size_bytes(self) -> int:
        """Convert MB to bytes for file size validation."""
        return self.max_upload_size_mb * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """
    Cached settings loader.
    
    WHY @lru_cache: We only want to read the .env file once at startup,
    not on every single request. The cache ensures a single Settings
    instance is shared across the entire application lifecycle.
    """
    return Settings()
