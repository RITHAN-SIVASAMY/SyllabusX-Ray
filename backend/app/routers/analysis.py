"""
Analysis Router — Frequency & Weightage API
===============================================
Serves the deterministic analytics computed by the frequency engine.

THESE ARE NOT LLM-GENERATED NUMBERS.
Every metric here comes from SQL aggregation against real PYQ data.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth.jwt_handler import get_current_user
from app.auth.middleware import limiter
from app.services.frequency_engine import get_frequency_engine
from app.models.database import get_supabase_admin_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


@router.get("/{course_id}/frequencies")
@limiter.limit("10/minute")
async def get_topic_frequencies(
    request: Request,
    course_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get topic frequency analysis for a course.
    
    Returns each topic with:
    - times_appeared: How many exam papers it was in
    - total_marks: Sum of marks allocated to it across all papers
    - weightage_percent: What % of total marks this topic represents
    - trend: Is it appearing more or less often? (increasing/decreasing/stable)
    - years_appeared: Which specific exam years it appeared in
    """
    # Verify user owns this course
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    engine = get_frequency_engine()
    frequencies = await engine.get_topic_frequencies(course_id)
    
    return {
        "course_id": course_id,
        "total_topics": len(frequencies),
        "topics": frequencies
    }


@router.get("/{course_id}/weightage")
@limiter.limit("10/minute")
async def get_module_weightage(
    request: Request,
    course_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get module-level mark weightage distribution.
    
    This is the data that powers the 80/20 visualization:
    modules sorted by total marks, with cumulative percentage
    and a flag showing which modules are "high priority."
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    engine = get_frequency_engine()
    weightage = await engine.get_module_weightage(course_id)
    
    return {
        "course_id": course_id,
        "modules": weightage
    }


@router.get("/{course_id}/high-yield")
@limiter.limit("10/minute")
async def get_high_yield_topics(
    request: Request,
    course_id: str,
    threshold: float = 80.0,
    user: dict = Depends(get_current_user)
):
    """
    Get the minimum set of topics covering a given percentage of marks.
    
    This IS the 80/20 rule endpoint.
    Default threshold: 80% — returns the smallest set of topics that
    collectively account for 80% of all historical marks.
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id, name").eq(
        "id", course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    engine = get_frequency_engine()
    high_yield = await engine.get_high_yield_topics(course_id, threshold)
    all_topics = await engine.get_topic_frequencies(course_id)
    
    return {
        "course_id": course_id,
        "course_name": course.data[0]["name"],
        "threshold_percent": threshold,
        "high_yield_count": len(high_yield),
        "total_topic_count": len(all_topics),
        "efficiency_ratio": f"{len(high_yield)}/{len(all_topics)} topics cover {threshold}% of marks",
        "topics": high_yield
    }


@router.get("/{course_id}/year-analysis")
@limiter.limit("10/minute")
async def get_year_over_year(
    request: Request,
    course_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get year-over-year exam pattern analysis.
    Shows how topics have shifted across exam years.
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id").eq(
        "id", course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    engine = get_frequency_engine()
    analysis = await engine.get_year_over_year_analysis(course_id)
    
    return {
        "course_id": course_id,
        "analysis": analysis
    }
