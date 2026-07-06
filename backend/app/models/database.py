"""
Database Client Module
=======================
Provides a configured Supabase client for database operations.

WHY SUPABASE CLIENT (not raw psycopg2):
- The Supabase Python SDK handles connection pooling, retries, and
  automatic JWT injection for Row-Level Security (RLS).
- When we pass a user's JWT to the client, RLS policies automatically
  restrict queries to that user's data — no manual WHERE clauses needed.
- For the service role client (admin operations like embedding storage),
  we use the service_role_key which bypasses RLS.
"""

from supabase import create_client, Client
from app.config import get_settings


def get_supabase_client() -> Client:
    """
    Creates a Supabase client using the ANON key.
    
    USE THIS FOR: Public-facing operations where RLS should be enforced.
    The anon key has limited permissions — it can only access data that
    the RLS policies explicitly allow for the authenticated user.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_supabase_admin_client() -> Client:
    """
    Creates a Supabase client using the SERVICE ROLE key.
    
    USE THIS FOR: Backend-only operations that need to bypass RLS:
    - Storing embeddings during PDF processing
    - Running frequency aggregation queries across all user data
    - Admin-level data management
    
    ⚠️ SECURITY WARNING: This key bypasses ALL Row-Level Security.
    Never expose it to the frontend or pass it in API responses.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
