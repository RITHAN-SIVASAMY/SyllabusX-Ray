"""
Deterministic Mark Frequency & Weightage Engine
===================================================
THIS IS THE MOST CRITICAL SERVICE IN THE ENTIRE APPLICATION.

WHY THIS EXISTS (and why an LLM MUST NOT do this):
When a student asks "Which topics should I focus on?", the answer must be
based on REAL STATISTICAL DATA from past exam papers — not LLM guesswork.

If we asked an LLM: "What percentage of marks come from Module 3?"
  → It would generate a plausible-sounding number (e.g., "approximately 28%")
  → But this number is FABRICATED. It's a language pattern, not a calculation.
  → Students would study the wrong topics and lose real marks.

THIS SERVICE runs PURE SQL against structured PYQ data in the database.
Every number it produces is mathematically correct because:
  - It uses COUNT(*), SUM(marks), GROUP BY — standard database operations
  - No neural network, no inference, no randomness
  - The same input always produces the same output (deterministic)

DATA FLOW:
  1. PDF uploaded → Docling extracts → LLM structures into pyq_questions table
  2. pyq_questions table has: topic_name, marks, exam_year (per question)
  3. THIS SERVICE queries pyq_questions with aggregation SQL
  4. Returns exact frequencies, weightages, and trends
"""

import logging
from typing import Optional
from datetime import datetime
from app.models.database import get_supabase_admin_client

logger = logging.getLogger(__name__)


class FrequencyEngine:
    """
    Computes deterministic topic frequency and weightage statistics.
    
    ALL CALCULATIONS ARE SQL-BASED — no LLM, no estimation, no guesswork.
    """

    def __init__(self):
        self.supabase = get_supabase_admin_client()

    async def get_topic_frequencies(self, course_id: str) -> list[dict]:
        """
        Calculate how often each topic appears across all exam years.
        
        SQL LOGIC:
        SELECT topic_name,
               COUNT(*) as times_appeared,
               SUM(marks) as total_marks,
               array_agg(DISTINCT exam_year) as years_appeared
        FROM pyq_questions
        WHERE course_id = $1
        GROUP BY topic_name
        ORDER BY total_marks DESC;
        
        Returns a list of dicts sorted by total marks (highest first).
        """
        try:
            response = self.supabase.rpc(
                "calculate_topic_frequencies",
                {"target_course_id": course_id}
            ).execute()

            frequencies = response.data or []
            
            # Calculate total marks across ALL topics for percentage computation
            total_marks_all = sum(f.get("total_marks", 0) for f in frequencies)
            
            if total_marks_all == 0:
                logger.warning(f"No marks data found for course {course_id}")
                return []

            # Enrich each topic with weightage percentage and trend
            enriched = []
            for freq in frequencies:
                topic_marks = freq.get("total_marks", 0)
                weightage = round((topic_marks / total_marks_all) * 100, 2)
                
                years = freq.get("years_appeared", [])
                trend = self._calculate_trend(course_id, freq.get("topic_name", ""), years)
                
                enriched.append({
                    "topic_name": freq.get("topic_name", "Unknown"),
                    "total_marks": topic_marks,
                    "times_appeared": freq.get("times_appeared", 0),
                    "years_appeared": sorted(years) if years else [],
                    "weightage_percent": weightage,
                    "trend": trend,
                })

            logger.info(f"Computed frequencies for {len(enriched)} topics in course {course_id}")
            return enriched

        except Exception as e:
            logger.error(f"Frequency calculation failed: {e}")
            return []

    async def get_module_weightage(self, course_id: str) -> list[dict]:
        """
        Calculate mark distribution per syllabus module.
        
        This groups pyq_questions by their associated module (from the
        syllabus_topics table) and computes what percentage of total
        historical marks each module accounts for.
        
        THIS IS THE "80/20 RULE" ENGINE:
        If Module 3 accounts for 35% of all marks, Module 5 for 25%,
        and Module 1 for 20%, then studying these 3 modules (out of 8)
        covers 80% of all marks. That's the Pareto principle in action.
        """
        try:
            response = self.supabase.rpc(
                "calculate_module_weightage",
                {"target_course_id": course_id}
            ).execute()

            modules = response.data or []
            total = sum(m.get("total_marks", 0) for m in modules)

            if total == 0:
                return []

            result = []
            cumulative = 0
            for mod in modules:
                marks = mod.get("total_marks", 0)
                pct = round((marks / total) * 100, 2)
                cumulative += pct
                
                result.append({
                    "module_name": mod.get("module_name", "Unknown"),
                    "module_number": mod.get("module_number", 0),
                    "total_marks": marks,
                    "question_count": mod.get("question_count", 0),
                    "weightage_percent": pct,
                    "cumulative_percent": round(cumulative, 2),
                    # Mark whether this module is in the "vital 20%"
                    "is_high_priority": cumulative <= 80
                })

            return result

        except Exception as e:
            logger.error(f"Module weightage calculation failed: {e}")
            return []

    async def get_year_over_year_analysis(self, course_id: str) -> dict:
        """
        Analyze how the exam pattern has changed over years.
        
        Returns:
        {
            "years_analyzed": [2019, 2020, 2021, 2022, 2023],
            "total_papers": 5,
            "year_data": {
                "2023": {
                    "total_marks": 100,
                    "topics_covered": ["Sorting", "Trees", ...],
                    "new_topics": ["Graph Algorithms"],  # first appeared this year
                    "dropped_topics": ["Linked Lists"]   # was in 2022, not in 2023
                },
                ...
            }
        }
        """
        try:
            response = self.supabase.rpc(
                "year_over_year_analysis",
                {"target_course_id": course_id}
            ).execute()

            return response.data if response.data else {}

        except Exception as e:
            logger.error(f"Year-over-year analysis failed: {e}")
            return {}

    def _calculate_trend(
        self,
        course_id: str,
        topic_name: str,
        years: list[int]
    ) -> str:
        """
        Determine if a topic's exam frequency is increasing, decreasing, or stable.
        
        ALGORITHM:
        - Sort years chronologically
        - If the topic appeared in more recent years than older years → "increasing"
        - If it appeared more in older years → "decreasing"  
        - Otherwise → "stable"
        
        This is a simple heuristic. For more sophisticated trend analysis,
        you could use linear regression on the marks per year.
        """
        if not years or len(years) < 2:
            return "stable"

        sorted_years = sorted(years)
        midpoint = len(sorted_years) // 2
        
        older_count = midpoint
        newer_count = len(sorted_years) - midpoint
        
        # Check if the topic appeared in the most recent exam
        current_year = datetime.now().year
        most_recent = sorted_years[-1]
        
        if newer_count > older_count and most_recent >= current_year - 2:
            return "increasing"
        elif older_count > newer_count and most_recent < current_year - 2:
            return "decreasing"
        else:
            return "stable"

    async def get_high_yield_topics(
        self,
        course_id: str,
        threshold_percent: float = 80.0
    ) -> list[dict]:
        """
        Get the minimum set of topics that cover a given percentage of marks.
        This IS the 80/20 rule implementation.
        
        Args:
            course_id: Which course to analyze
            threshold_percent: Cumulative percentage to cover (default 80%)
        
        Returns:
            Topics sorted by weightage, stopping when cumulative % >= threshold.
            These are THE topics the student should focus on.
        """
        all_topics = await self.get_topic_frequencies(course_id)
        
        if not all_topics:
            return []

        # Topics are already sorted by total_marks DESC
        high_yield = []
        cumulative = 0

        for topic in all_topics:
            high_yield.append(topic)
            cumulative += topic["weightage_percent"]
            
            if cumulative >= threshold_percent:
                break

        logger.info(
            f"80/20 Analysis: {len(high_yield)} of {len(all_topics)} topics "
            f"cover {cumulative:.1f}% of marks"
        )

        return high_yield


# Singleton
_frequency_engine: Optional[FrequencyEngine] = None


def get_frequency_engine() -> FrequencyEngine:
    """Get or create the global frequency engine instance."""
    global _frequency_engine
    if _frequency_engine is None:
        _frequency_engine = FrequencyEngine()
    return _frequency_engine
