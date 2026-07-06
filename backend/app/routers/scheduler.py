"""
Scheduler Router — Cram Countdown API
=========================================
Generates adaptive study schedules based on exam dates and topic importance.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth.jwt_handler import get_current_user
from app.auth.middleware import limiter
from app.models.schemas import SchedulerRequest
from app.services.study_planner import get_study_planner
from app.models.database import get_supabase_admin_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scheduler", tags=["Scheduler"])


@router.post("/generate")
@limiter.limit("10/minute")
async def generate_study_schedule(
    request: Request,
    schedule_request: SchedulerRequest,
    user: dict = Depends(get_current_user)
):
    """
    Generate a personalized study schedule.
    
    Input: course_id, exam_date, hours_per_day, study_mode
    Output: Day-by-day schedule with topic allocations proportional to importance
    """
    supabase = get_supabase_admin_client()
    course = supabase.table("courses").select("id, name").eq(
        "id", schedule_request.course_id
    ).eq("user_id", user["sub"]).execute()
    
    if not course.data:
        raise HTTPException(status_code=404, detail="Course not found")

    planner = get_study_planner()
    schedule = await planner.generate_schedule(
        course_id=schedule_request.course_id,
        exam_date=schedule_request.exam_date,
        hours_per_day=schedule_request.hours_per_day,
        mode=schedule_request.mode.value
    )

    schedule["course_name"] = course.data[0]["name"]
    return schedule
