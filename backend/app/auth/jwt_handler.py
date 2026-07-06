"""
JWT Authentication Handler
============================
Verifies Supabase-issued JWTs on every incoming API request.

HOW THIS WORKS (step by step):
1. Student logs in via Google OAuth on the frontend → Supabase issues a JWT
2. Frontend stores the JWT and sends it in the Authorization header: "Bearer <token>"
3. This module intercepts every request, extracts the token, and verifies it
4. If valid → request proceeds with the user's UUID attached
5. If invalid/expired → request is rejected with 401 Unauthorized

WHY LOCAL VERIFICATION (not calling Supabase's API):
- Calling supabase.auth.get_user(token) on every request adds ~100ms network latency
- Local verification with the JWT secret takes <1ms
- We already have the secret from our Supabase project settings
- The JWT contains the user's UUID in the 'sub' claim — that's all we need
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError
import httpx
from app.config import get_settings

# HTTPBearer automatically extracts the token from "Authorization: Bearer <token>"
security_scheme = HTTPBearer()

# Cache the JWKS so we don't fetch it on every request
_jwks_cache = None

async def get_jwks(supabase_url: str):
    global _jwks_cache
    if _jwks_cache is None:
        url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            _jwks_cache = response.json()
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> dict:
    """
    FastAPI dependency that extracts and verifies the JWT from any request.
    """
    settings = get_settings()
    token = credentials.credentials

    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        
        if alg == "HS256":
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            key = await get_jwks(settings.supabase_url)
            algorithms = ["RS256", "ES256"]

        # Decode and verify the JWT
        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            # The 'audience' claim must be "authenticated" for logged-in users.
            audience="authenticated"
        )
        
        # Sanity check: the token must contain a user ID
        if "sub" not in payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token payload missing user identifier ('sub' claim)"
            )
        
        return payload

    except ExpiredSignatureError:
        # Token has expired — frontend should refresh it
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    except JWTError as e:
        # Any other JWT issue: invalid signature, malformed token, etc.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )
