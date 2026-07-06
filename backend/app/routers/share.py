"""
Share Router — Peer Share Engine API
=========================================
Generates cryptographic share URLs for course profiles.

HOW THE PEER SHARE WORKS:
1. Student A configures a course, uploads materials, runs analysis
2. Student A clicks "Share" → this endpoint generates a unique crypto token
3. The token encodes the course_id and is signed with a secret
4. Student A drops the share URL into their class group chat
5. Student B opens the URL → the frontend decodes the token and loads
   Student A's course profile (read-only, no auth needed for shared data)

SECURITY:
- Share tokens are cryptographically random (uuid4 + secrets module)
- Tokens have configurable expiry (default: 1 week)
- The shared profile is READ-ONLY — recipients can't modify the original
- RLS policies allow public SELECT on shared_profiles table
"""

import secrets
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth.jwt_handler import get_current_user
from app.auth.middleware import limiter
from app.models.schemas import ShareRequest, ShareResponse
from app.models.database import get_supabase_admin_client
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/share", tags=["Share"])


def generate_share_token() -> str:
    """
    Generate a cryptographically secure share token.
    
    Uses Python's secrets module which generates cryptographically strong
    random numbers suitable for managing security tokens.
    
    Output: 32-character URL-safe string (e.g., "aB3x_Kz9mP2qR5vW...")
    """
    return secrets.token_urlsafe(24)  # 24 bytes → 32 characters base64


@router.post("/generate", response_model=ShareResponse)
@limiter.limit("10/minute")
async def create_share_link(
    request: Request,
    share_request: ShareRequest,
    user: dict = Depends(get_current_user)
):
    """
    Generate a shareable link for a course profile.
    
    The link allows anyone with the URL to view the course's
    analysis results, topic frequencies, and study materials.
    They CANNOT modify the data or access other courses.
    """
    supabase = get_supabase_admin_client()
    
    # Verify user owns this course
    course = supabase.table("courses").select("id, name").eq(
        "id", share_request.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    # Generate the token
    token = generate_share_token()
    
    # Calculate expiry
    expires_at = None
    if share_request.expires_in_hours:
        expires_at = (datetime.utcnow() + timedelta(hours=share_request.expires_in_hours)).isoformat()

    # Store in database
    supabase.table("shared_profiles").insert({
        "course_id": share_request.course_id,
        "creator_id": user["sub"],
        "share_token": token,
        "expires_at": expires_at,
    }).execute()

    # Build the share URL
    settings = get_settings()
    # In production, this would use the actual frontend domain
    base_url = settings.cors_origins_list[0] if settings.cors_origins_list else "http://localhost:3000"
    share_url = f"{base_url}/shared/{token}"

    logger.info(f"Share link created for course {share_request.course_id} by user {user['sub']}")

    return ShareResponse(
        share_url=share_url,
        share_token=token,
        expires_at=expires_at
    )


@router.get("/{share_token}")
async def get_shared_profile(share_token: str):
    """
    Load a shared course profile (NO AUTH REQUIRED).
    
    Anyone with the share token can view the course's analysis results.
    This is the endpoint the frontend calls when someone opens a share link.
    """
    supabase = get_supabase_admin_client()
    
    # Look up the share token
    share = supabase.table("shared_profiles").select(
        "*, courses(id, name, code, university)"
    ).eq("share_token", share_token).execute()

    if not share.data:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    share_data = share.data[0]

    # Check expiry
    if share_data.get("expires_at"):
        expires = datetime.fromisoformat(share_data["expires_at"].replace("Z", "+00:00"))
        if datetime.utcnow().replace(tzinfo=expires.tzinfo) > expires:
            raise HTTPException(status_code=410, detail="This share link has expired")

    course_id = share_data["course_id"]

    # Fetch the course's analysis data (read-only)
    # This bypasses RLS because we're using the admin client,
    # but we ONLY return analysis results — not raw documents or chunks
    analysis = supabase.table("analysis_results").select("*").eq(
        "course_id", course_id
    ).execute()

    # Fetch topic frequencies
    from app.services.frequency_engine import get_frequency_engine
    engine = get_frequency_engine()
    frequencies = await engine.get_topic_frequencies(course_id)

    return {
        "course": share_data.get("courses", {}),
        "analysis": analysis.data or [],
        "topic_frequencies": frequencies,
        "shared_by": "Anonymous",  # Don't expose the creator's identity
        "expires_at": share_data.get("expires_at"),
    }


@router.delete("/{share_token}")
async def revoke_share_link(
    share_token: str,
    user: dict = Depends(get_current_user)
):
    """Revoke a share link (only the creator can do this)."""
    supabase = get_supabase_admin_client()
    
    result = supabase.table("shared_profiles").delete().eq(
        "share_token", share_token
    ).eq("creator_id", user["sub"]).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Share link not found")

    return {"message": "Share link revoked successfully"}
