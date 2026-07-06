"""
Cram Countdown Adaptive Study Planner
=========================================
Generates a personalized study schedule proportional to topic importance.

THE ALGORITHM:
1. Student inputs: exam_date + hours_per_day
2. We calculate total available study hours
3. We fetch topic weightage from the frequency engine
4. Hours are allocated PROPORTIONALLY to each topic's historical mark percentage
5. Topics are distributed across days with priority ordering

EXAMPLE:
  - Exam in 7 days, 4 hours/day = 28 total hours
  - Module 3: 35% weightage → 9.8 hours → ~2.5 days focused
  - Module 5: 25% weightage → 7.0 hours → ~1.75 days focused
  - Module 1: 20% weightage → 5.6 hours → ~1.4 days focused
  - Remaining modules share the remaining 5.6 hours

The schedule also factors in:
  - Spaced repetition: Review slots for previously studied topics
  - Diminishing returns: No topic gets more than 40% of total time
  - Rest periods: Suggests breaks every 90 minutes (Pomodoro-style)
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from app.services.frequency_engine import get_frequency_engine

logger = logging.getLogger(__name__)

# Constraints
MAX_TOPIC_ALLOCATION_PERCENT = 40  # No single topic gets more than 40% of time
MIN_TOPIC_ALLOCATION_HOURS = 0.5   # Minimum 30 minutes per topic
REVIEW_SLOT_PERCENT = 15           # Reserve 15% of time for review sessions


class StudyPlanner:
    """
    Generates adaptive study schedules based on topic importance and available time.
    """

    def __init__(self):
        self.frequency_engine = get_frequency_engine()

    async def generate_schedule(
        self,
        course_id: str,
        exam_date: datetime,
        hours_per_day: float,
        mode: str = "efficiency"
    ) -> dict:
        """
        Generate a complete study schedule.
        
        Args:
            course_id: Course to generate schedule for
            exam_date: When is the exam?
            hours_per_day: Available study hours per day
            mode: Study mode affects which topics are included
        
        Returns:
            {
                "course_id": str,
                "exam_date": str,
                "total_days": int,
                "total_hours": float,
                "schedule": [
                    {
                        "date": "2024-01-15",
                        "topics": ["Module 3: Sorting", ...],
                        "hours_allocated": 4.0,
                        "priority": "high",
                        "is_review": false,
                        "notes": "Focus on comparison-based sorting algorithms"
                    },
                    ...
                ]
            }
        """
        now = datetime.now()
        
        # Calculate available time
        days_remaining = (exam_date - now).days
        if days_remaining <= 0:
            return {
                "course_id": course_id,
                "exam_date": exam_date.isoformat(),
                "total_days": 0,
                "total_hours": 0,
                "schedule": [],
                "message": "The exam date has already passed!"
            }

        total_hours = days_remaining * hours_per_day
        
        # Reserve time for review sessions
        review_hours = total_hours * (REVIEW_SLOT_PERCENT / 100)
        study_hours = total_hours - review_hours

        # Get topic weightage from the deterministic frequency engine
        if mode == "panic":
            # In panic mode, only get high-yield topics
            topics = await self.frequency_engine.get_high_yield_topics(course_id, 80.0)
        elif mode == "efficiency":
            topics = await self.frequency_engine.get_high_yield_topics(course_id, 90.0)
        else:
            topics = await self.frequency_engine.get_topic_frequencies(course_id)

        if not topics:
            return {
                "course_id": course_id,
                "exam_date": exam_date.isoformat(),
                "total_days": days_remaining,
                "total_hours": total_hours,
                "schedule": [],
                "message": "No topic data available yet. Upload PYQ papers first."
            }

        # Allocate hours proportionally
        allocations = self._allocate_hours(topics, study_hours)

        # Distribute across days
        schedule = self._distribute_across_days(
            allocations, days_remaining, hours_per_day,
            now, review_hours
        )

        return {
            "course_id": course_id,
            "exam_date": exam_date.isoformat(),
            "total_days": days_remaining,
            "total_hours": round(total_hours, 1),
            "study_hours": round(study_hours, 1),
            "review_hours": round(review_hours, 1),
            "topics_covered": len(allocations),
            "schedule": schedule,
        }

    def _allocate_hours(
        self,
        topics: list[dict],
        total_hours: float
    ) -> list[dict]:
        """
        Allocate study hours proportionally to topic weightage.
        
        Applies constraints:
        - No topic gets more than MAX_TOPIC_ALLOCATION_PERCENT of total time
        - Every topic gets at least MIN_TOPIC_ALLOCATION_HOURS
        """
        allocations = []
        total_weight = sum(t.get("weightage_percent", 0) for t in topics)
        
        if total_weight == 0:
            # Equal distribution fallback
            per_topic = total_hours / max(len(topics), 1)
            for topic in topics:
                allocations.append({
                    "topic_name": topic["topic_name"],
                    "hours": round(per_topic, 1),
                    "weightage_percent": round(100 / max(len(topics), 1), 1),
                    "trend": topic.get("trend", "stable"),
                    "priority": "medium"
                })
            return allocations

        for topic in topics:
            weight = topic.get("weightage_percent", 0)
            raw_hours = (weight / total_weight) * total_hours
            
            # Apply cap
            max_hours = total_hours * (MAX_TOPIC_ALLOCATION_PERCENT / 100)
            capped_hours = min(raw_hours, max_hours)
            
            # Apply minimum
            final_hours = max(capped_hours, MIN_TOPIC_ALLOCATION_HOURS)
            
            # Determine priority based on weightage
            if weight >= 20:
                priority = "high"
            elif weight >= 10:
                priority = "medium"
            else:
                priority = "low"
            
            # Boost priority for increasing trends
            if topic.get("trend") == "increasing" and priority != "high":
                priority = "high"

            allocations.append({
                "topic_name": topic["topic_name"],
                "hours": round(final_hours, 1),
                "weightage_percent": round(weight, 1),
                "trend": topic.get("trend", "stable"),
                "priority": priority
            })

        return allocations

    def _distribute_across_days(
        self,
        allocations: list[dict],
        total_days: int,
        hours_per_day: float,
        start_date: datetime,
        review_hours: float
    ) -> list[dict]:
        """
        Spread topic allocations across available days.
        
        Strategy:
        1. High-priority topics come first (when focus is freshest)
        2. Each day fills up to hours_per_day
        3. Review sessions are interspersed every 3 days
        4. The last day is always a review/revision day
        """
        # Sort by priority (high first) then by hours (most time needed first)
        priority_order = {"high": 0, "medium": 1, "low": 2}
        sorted_alloc = sorted(
            allocations,
            key=lambda x: (priority_order.get(x["priority"], 2), -x["hours"])
        )

        schedule = []
        current_day = 0
        remaining_today = hours_per_day
        today_topics = []

        for alloc in sorted_alloc:
            hours_left = alloc["hours"]
            
            while hours_left > 0:
                if remaining_today <= 0:
                    # Save today's schedule and move to next day
                    if today_topics:
                        schedule.append({
                            "date": (start_date + timedelta(days=current_day + 1)).strftime("%Y-%m-%d"),
                            "day_number": current_day + 1,
                            "topics": [t["name"] for t in today_topics],
                            "hours_allocated": round(sum(t["hours"] for t in today_topics), 1),
                            "priority": max(t["priority"] for t in today_topics),
                            "is_review": False,
                            "details": today_topics
                        })
                    current_day += 1
                    remaining_today = hours_per_day
                    today_topics = []

                    if current_day >= total_days:
                        break

                # How much of this topic fits today?
                chunk = min(hours_left, remaining_today)
                today_topics.append({
                    "name": alloc["topic_name"],
                    "hours": round(chunk, 1),
                    "priority": alloc["priority"],
                    "trend": alloc["trend"]
                })
                
                hours_left -= chunk
                remaining_today -= chunk

            if current_day >= total_days:
                break

        # Save the last day's topics
        if today_topics:
            schedule.append({
                "date": (start_date + timedelta(days=current_day + 1)).strftime("%Y-%m-%d"),
                "day_number": current_day + 1,
                "topics": [t["name"] for t in today_topics],
                "hours_allocated": round(sum(t["hours"] for t in today_topics), 1),
                "priority": max(t["priority"] for t in today_topics) if today_topics else "low",
                "is_review": False,
                "details": today_topics
            })

        # Add review days every 3rd day and on the last day
        review_per_session = review_hours / max(total_days // 3, 1)
        for i in range(len(schedule)):
            if (i + 1) % 3 == 0 or i == len(schedule) - 1:
                schedule[i]["is_review"] = True
                schedule[i]["topics"].append("📖 Review & Practice")
                schedule[i]["hours_allocated"] = round(
                    schedule[i]["hours_allocated"] + review_per_session, 1
                )

        return schedule


# Singleton
_planner: Optional[StudyPlanner] = None


def get_study_planner() -> StudyPlanner:
    """Get or create the global study planner instance."""
    global _planner
    if _planner is None:
        _planner = StudyPlanner()
    return _planner
