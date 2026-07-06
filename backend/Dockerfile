# ==================================================
# SyllabusX-Ray Backend — Docker Configuration
# ==================================================
# This Dockerfile is designed for deployment to:
#   - Hugging Face Spaces (Docker SDK)
#   - Render.com (Docker)
#   - Any container hosting platform
#
# BUILD:  docker build -t syllabusx-ray-api .
# RUN:    docker run -p 8000:8000 --env-file .env syllabusx-ray-api

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
# - gcc & python3-dev: needed for building some Python packages
# - libpq-dev: needed for psycopg2 (PostgreSQL driver)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching optimization)
# If requirements.txt hasn't changed, this layer is cached
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create upload directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Start the server
# --host 0.0.0.0: Listen on all interfaces (required for Docker)
# --workers 2: Use 2 worker processes (good for free-tier 512MB RAM)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
