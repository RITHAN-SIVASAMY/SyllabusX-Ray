"""
Rate Limiting Middleware
=========================
Protects free-tier resources from abuse by throttling requests per IP.

WHY THIS IS CRITICAL FOR A FREE-TIER APP:
- Groq free tier: ~30 requests/minute
- Supabase free tier: limited database connections
- Docling PDF processing: CPU-intensive, ~5-15 seconds per file
- Without rate limiting, a single bot could exhaust all quotas in minutes

HOW IT WORKS:
- slowapi tracks request counts per client IP in memory
- Each endpoint category has its own limit (uploads are stricter than searches)
- When a limit is hit, the client gets a 429 "Too Many Requests" response
- Limits reset automatically after the time window expires
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse
from app.config import get_settings

# Initialize the rate limiter using client IP as the key
# get_remote_address extracts the IP from the request
limiter = Limiter(key_func=get_remote_address)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom error handler for rate limit violations.
    
    Returns a clean JSON error instead of a raw HTML error page.
    The Retry-After header tells the client when to try again.
    """
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": str(exc.detail),
            "message": "You're making requests too quickly. Please wait before trying again."
        },
        headers={"Retry-After": str(exc.detail)}
    )
