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
from datetime import datetime, timedelta, timezone
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
            mode: Study mode — controls topic filtering and day strategies
        """
        now = datetime.now(timezone.utc)
        if exam_date.tzinfo is None:
            exam_date = exam_date.replace(tzinfo=timezone.utc)
        
        # Calculate available time
        days_remaining = (exam_date.date() - now.date()).days
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
            now, review_hours, mode
        )

        return {
            "course_id": course_id,
            "exam_date": exam_date.isoformat(),
            "total_days": int(days_remaining),
            "total_hours": float(total_hours),
            "study_hours": float(total_hours - review_hours),
            "review_hours": float(review_hours),
            "topics_covered": int(len(allocations)),
            "mode": mode,
            "mode_summary": self._get_mode_summary(mode, days_remaining),
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
                    "hours": float(round(per_topic, 1)),
                    "weightage_percent": float(round(100 / max(len(topics), 1), 1)),
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
                "hours": float(round(final_hours, 1)),
                "weightage_percent": float(round(weight, 1)),
                "trend": topic.get("trend", "stable"),
                "priority": priority
            })

        return allocations

    def _get_mode_summary(self, mode: str, days: int) -> dict:
        """Return a human-readable summary of what the mode means for this schedule."""
        if mode == "panic":
            return {
                "label": "🚨 Panic Mode",
                "description": "Only the highest-yield topics are scheduled. Focus on definitions, formulas, and past exam answers.",
                "session_strategy": "Short 25-min Pomodoro bursts. Skip derivations — memorize key results.",
                "color": "danger"
            }
        elif mode == "efficiency":
            return {
                "label": "⚡ 80/20 Efficiency",
                "description": "Topics covering 90% of historical marks are prioritized. Secondary topics are excluded.",
                "session_strategy": "45-min focused blocks with 10-min breaks. Prioritize high-weightage topics each day.",
                "color": "warning"
            }
        else:  # deep_dive
            return {
                "label": "🔬 Deep Dive",
                "description": "Comprehensive coverage of all topics. Full explanations, examples, and cross-topic connections.",
                "session_strategy": "90-min deep work sessions. Review previous day's material for 15 min before starting.",
                "color": "primary"
            }

    def _get_mode_day_config(self, mode: str, day_number: int, priority: str, is_review: bool) -> dict:
        """Return mode-specific tips and theme for a specific day."""
        if mode == "panic":
            if is_review:
                return {
                    "day_theme": "🚨 Rapid Review",
                    "mode_tips": "Quick-scan your notes. Write down 3 key facts per topic from memory.",
                    "session_strategy": "2 × 25-min sprints with 5-min breaks. Use active recall — test yourself."
                }
            elif priority == "high":
                return {
                    "day_theme": "🔥 High-Yield Blitz",
                    "mode_tips": "These are the most exam-critical topics. Memorize formulas and key definitions first.",
                    "session_strategy": "25-min Pomodoro blocks. After each block, close your notes and recall 3 facts."
                }
            else:
                return {
                    "day_theme": "⚡ Quick Coverage",
                    "mode_tips": "Cover these briefly — focus on what appeared in past papers, skip deep explanations.",
                    "session_strategy": "Single 25-min sprint per topic. Move on even if not fully comfortable."
                }
        elif mode == "efficiency":
            if is_review:
                return {
                    "day_theme": "📊 Strategic Review",
                    "mode_tips": "Revisit high-yield topics from earlier days. Practice solving past paper questions.",
                    "session_strategy": "45-min block: 20 min review, 15 min practice questions, 10 min self-assessment."
                }
            elif priority == "high":
                return {
                    "day_theme": "⚡ Priority Focus",
                    "mode_tips": "High-weightage topic — allocate most energy here. Understand the core concept deeply.",
                    "session_strategy": "Two 45-min focused blocks. After each, summarize the key points in your own words."
                }
            else:
                return {
                    "day_theme": "📈 Steady Progress",
                    "mode_tips": "Medium priority — cover key ideas and practice 1-2 past questions per topic.",
                    "session_strategy": "45-min block per topic. Use active recall at the end of each session."
                }
        else:  # deep_dive
            if is_review:
                return {
                    "day_theme": "🔬 Deep Review",
                    "mode_tips": "Revisit all topics covered so far. Connect concepts across modules and build a mental map.",
                    "session_strategy": "90-min session: review notes → create concept connections → practice applications."
                }
            elif priority == "high":
                return {
                    "day_theme": "📚 Comprehensive Study",
                    "mode_tips": "Core topic — study all subtopics, examples, and edge cases. Cross-reference with related modules.",
                    "session_strategy": "90-min deep work blocks. Read, summarize, then solve progressively harder problems."
                }
            else:
                return {
                    "day_theme": "🌱 Broadening Coverage",
                    "mode_tips": "Supporting topic — understand how it connects to your high-priority modules.",
                    "session_strategy": "60-min exploration. Focus on understanding principles, not just memorizing facts."
                }

    def _distribute_across_days(
        self,
        allocations: list[dict],
        total_days: int,
        hours_per_day: float,
        start_date: datetime,
        review_hours: float,
        mode: str = "efficiency"
    ) -> list[dict]:
        """
        Spread topic allocations across available days with mode-specific enrichment.
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
                        day_priority = min(today_topics, key=lambda t: priority_order.get(t["priority"], 2))["priority"]
                        schedule.append({
                            "date": (start_date + timedelta(days=current_day + 1)).strftime("%Y-%m-%d"),
                            "day_number": current_day + 1,
                            "topics": [t["name"] for t in today_topics],
                            "hours_allocated": float(round(sum(t["hours"] for t in today_topics), 1)),
                            "priority": day_priority,
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
                    "hours": float(round(chunk, 1)),
                    "priority": alloc["priority"],
                    "trend": alloc["trend"],
                    "weightage_percent": float(alloc.get("weightage_percent", 0))
                })
                
                hours_left -= chunk
                remaining_today -= chunk

            if current_day >= total_days:
                break

        # Save the last day's topics
        if today_topics:
            day_priority = min(today_topics, key=lambda t: priority_order.get(t["priority"], 2))["priority"]
            schedule.append({
                "date": (start_date + timedelta(days=current_day + 1)).strftime("%Y-%m-%d"),
                "day_number": current_day + 1,
                "topics": [t["name"] for t in today_topics],
                "hours_allocated": float(round(sum(t["hours"] for t in today_topics), 1)),
                "priority": day_priority if today_topics else "low",
                "is_review": False,
                "details": today_topics
            })

        # Add review days every 3rd day and on the last day
        review_per_session = review_hours / max(total_days // 3, 1)
        for i in range(len(schedule)):
            is_review = (i + 1) % 3 == 0 or i == len(schedule) - 1
            if is_review:
                schedule[i]["is_review"] = True
                schedule[i]["topics"].append("📖 Review & Practice")
                schedule[i]["hours_allocated"] = round(
                    schedule[i]["hours_allocated"] + review_per_session, 1
                )

            # Enrich each day with mode-specific tips
            day_config = self._get_mode_day_config(
                mode=mode,
                day_number=schedule[i]["day_number"],
                priority=schedule[i]["priority"],
                is_review=schedule[i]["is_review"]
            )
            schedule[i].update(day_config)

        return schedule


# Singleton
_planner: Optional[StudyPlanner] = None


def get_study_planner() -> StudyPlanner:
    """Get or create the global study planner instance."""
    global _planner
    if _planner is None:
        _planner = StudyPlanner()
    return _planner
