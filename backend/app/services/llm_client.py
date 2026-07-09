"""
Groq LLM Client Service
==========================
Handles all communication with the Groq API for text generation.

WHY GROQ (not OpenAI, Anthropic, or local models):
  - FREE TIER: ~30 req/min, generous daily token limits
  - SPEED: Groq's LPU (Language Processing Unit) delivers ~500 tokens/sec
    vs ~50 tokens/sec for typical GPU inference
  - MODEL: Llama 3.3 70B is competitive with GPT-4 on academic tasks
  - OPENAI-COMPATIBLE: The SDK mirrors OpenAI's API, making it easy to
    swap models later without code changes

HOW THIS SERVICE IS USED IN THE PIPELINE:
  The reranker gives us the top 5 most relevant text chunks.
  This service takes those chunks + the student's question and asks the LLM
  to generate a structured, formatted response.

  The key constraint: We use response_format={"type": "json_object"} to force
  the LLM to output valid JSON. This prevents free-form hallucination and
  ensures the frontend can reliably parse the response.

IMPORTANT — WHAT THIS SERVICE DOES NOT DO:
  - It does NOT calculate mark frequencies (that's frequency_engine.py using SQL)
  - It does NOT decide topic weightage (that's deterministic aggregation)
  - It ONLY generates natural-language study content from retrieved context
"""

import json
import logging
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

# System prompts for each study mode
SYSTEM_PROMPTS = {
    "deep_dive": """You are SyllabusX-Ray, an expert academic tutor.
The student is in DEEP DIVE mode — they want comprehensive, detailed explanations.

Given the context chunks from their course materials, provide:
1. A thorough explanation of the topic
2. Key concepts with examples
3. Important formulas or definitions
4. Common exam question patterns
5. Cross-references between topics

Format your response as a JSON object with these fields:
{
    "answer": "Detailed markdown-formatted explanation",
    "key_concepts": ["concept1", "concept2", ...],
    "formulas": ["formula1", "formula2", ...],
    "exam_tips": ["tip1", "tip2", ...],
    "confidence": 0.0-1.0
}

CRITICAL RULES:
- ONLY use information from the provided context chunks
- If the context doesn't contain enough information, say so honestly
- Never fabricate statistics, mark allocations, or frequency data
- Use Markdown formatting for readability""",

    "efficiency": """You are SyllabusX-Ray, an exam strategist.
The student is in 80/20 EFFICIENCY mode — they want ONLY high-yield content.

Given the context chunks, provide:
1. The most important points for exam preparation (Pareto principle)
2. Key formulas and definitions that are most likely to be tested
3. Common question patterns from past papers
4. Skip secondary details — focus on what will score marks

Format your response as a JSON object:
{
    "answer": "Concise, high-yield markdown explanation",
    "must_know": ["critical point 1", "critical point 2", ...],
    "key_formulas": ["formula1", ...],
    "likely_questions": ["question pattern 1", ...],
    "confidence": 0.0-1.0
}

CRITICAL RULES:
- Be extremely concise — every sentence must be exam-relevant
- Prioritize content that appears repeatedly in past papers
- Never fabricate statistics or mark allocations""",

    "panic": """You are SyllabusX-Ray in PANIC MODE.
The student has very limited time. Give them ONLY the absolute essentials.

From the context, extract:
1. Essential definitions (1 sentence each, max 10)
2. Must-know formulas (max 10)
3. One-line exam tips

Format as JSON:
{
    "answer": "Ultra-brief survival guide in markdown",
    "essential_definitions": [{"term": "...", "definition": "..."}],
    "essential_formulas": ["formula1", ...],
    "quick_tips": ["tip1", ...],
    "confidence": 0.0-1.0
}

RULES:
- Maximum brevity — this is a cheat sheet, not a textbook
- Only the most critical items
- Easy to scan in under 2 minutes"""
}

# Prompt for generating flashcards from course content
FLASHCARD_PROMPT = """You are SyllabusX-Ray's flashcard generator.
Create study flashcards from the provided course material context.

CRITICAL REQUIREMENT:
The user will provide a "Requested Topic to Focus On". You MUST ONLY generate flashcards about this specific topic.
If the course material contains other unrelated topics, IGNORE THEM COMPLETELY.

Generate a JSON object with an array of flashcards:
{
    "flashcards": [
        {
            "question": "Clear, specific question testing one concept",
            "answer": "Concise, accurate answer",
            "topic": "Topic/module name",
            "difficulty": "easy|medium|hard"
        }
    ]
}

RULES:
- Create 5-10 flashcards from the provided context
- Mix difficulty levels
- Focus on concepts frequently tested in past exams
- CRITICAL: Questions MUST be completely self-contained. Always provide the specific context (e.g., "In the context of Matrix Chain Multiplication..." rather than just "What is the algorithm..."). Do NOT assume the student knows which section you are testing.
- CRITICAL: Answers must explain the actual concept. NEVER use phrases like "as given in the course material" or "mentioned in the text".
- Keep answers brief but educational and complete"""

# Prompt for generating quiz questions
QUIZ_PROMPT = """You are SyllabusX-Ray's quiz generator.
Create multiple-choice questions from the provided course material.

CRITICAL REQUIREMENT:
The user will provide a "Requested Topic to Focus On". You MUST ONLY generate questions about this specific topic.
If the course material contains other unrelated topics, IGNORE THEM COMPLETELY.

Generate a JSON object:
{
    "questions": [
        {
            "question": "Clear question text",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_index": 0,
            "explanation": "Why this answer is correct",
            "topic": "Topic name",
            "difficulty": "easy|medium|hard"
        }
    ]
}

RULES:
- Create 5 questions
- Each must have exactly 4 options
- Only ONE correct answer per question
- Distractors should be plausible but clearly wrong
- CRITICAL: The question text MUST be completely self-contained. Always specify the exact algorithm, model, or topic being tested (e.g., "What is the time complexity of the Brute Force algorithm for Matrix Chain Multiplication?"). Do NOT write vague questions.
- CRITICAL: The explanation MUST teach the student why the answer is correct using the underlying concepts. NEVER say "because it is in the course material" or "as stated in the text".
- Base questions on actual past exam patterns when possible"""


class LLMClient:
    """
    Client for the Groq API with mode-aware prompt management.
    """

    def __init__(self):
        self._client = None
        self._settings = get_settings()

    def _get_client(self):
        """Lazy-initialize the Groq client."""
        if self._client is None:
            try:
                from groq import Groq
                self._client = Groq(api_key=self._settings.groq_api_key)
                logger.info(f"Groq client initialized with model: {self._settings.groq_model}")
            except ImportError:
                logger.error("Groq SDK not installed! Install with: pip install groq")
                raise
        return self._client

    async def generate_study_content(
        self,
        query: str,
        context_chunks: list[dict],
        mode: str = "efficiency",
        detailed: bool = False
    ) -> dict:
        """
        Generate study content from retrieved context chunks.
        
        Args:
            query: The student's question
            context_chunks: Reranked context chunks (top 5)
            mode: Study mode ("deep_dive", "efficiency", or "panic")
        
        Returns:
            Parsed JSON response from the LLM
        """
        client = self._get_client()

        # Build context string from chunks
        context = self._format_context(context_chunks)

        # Select the appropriate system prompt for the mode
        system_prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["efficiency"])
        
        if detailed:
            system_prompt += (
                "\n\nDETAILED MODE ENABLED: For EVERY section in your JSON response (the main answer, "
                "the concepts, the tips, etc.), provide highly detailed, multi-paragraph explanations with examples. "
                "Do not be brief. Expand extensively.\n\n"
                "CRITICAL JSON FORMATTING RULES:\n"
                "1. You MUST output a completely valid JSON object.\n"
                "2. Do NOT use literal newlines inside JSON string values. You MUST use the `\\n` escape sequence for line breaks.\n"
                "3. You MUST enclose all string values (like the 'answer' field) in double quotes.\n"
                "4. Escape any internal double quotes using `\\\"`."
            )

        try:
            response = client.chat.completions.create(
                model=self._settings.groq_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"## Context from course materials:\n\n{context}\n\n## Student's question:\n{query}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,  # Low temperature for factual accuracy
                max_tokens=6000,
                top_p=0.9
            )

            # Parse the JSON response
            content = response.choices[0].message.content
            result = json.loads(content)
            
            logger.info(f"LLM generated response for mode={mode}, tokens used: {response.usage.total_tokens}")
            return result

        except json.JSONDecodeError as e:
            logger.error(f"LLM returned invalid JSON: {e}")
            return {
                "answer": "I encountered an error processing your question. Please try again.",
                "confidence": 0.0,
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Groq API call failed: {e}")
            return {
                "answer": f"API error: {str(e)}. Please check your Groq API key and try again.",
                "confidence": 0.0,
                "error": str(e)
            }

    async def generate_flashcards(self, topic: str, context_chunks: list[dict], avoid_questions: Optional[list[str]] = None) -> dict:
        """Generate flashcards from context chunks."""
        client = self._get_client()
        context = self._format_context(context_chunks)

        system_prompt = FLASHCARD_PROMPT
        temperature = 0.3
        if avoid_questions:
            avoid_list = "\n".join([f"- {q}" for q in avoid_questions])
            system_prompt += f"\n\nCRITICAL INSTRUCTION: You MUST generate ENTIRELY DIFFERENT questions from the ones listed below. Compare your ideas against this forbidden list. If your proposed question is conceptually similar to any of these, DISCARD IT and test a different detail or concept from the text.\nForbidden questions:\n{avoid_list}"
            temperature = 0.6  # Increase temperature to encourage variety

        try:
            response = client.chat.completions.create(
                model=self._settings.groq_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"## Requested Topic to Focus On:\n{topic}\n\n## Course material context:\n\n{context}"}
                ],
                response_format={"type": "json_object"},
                temperature=temperature,
                max_tokens=2000
            )

            return json.loads(response.choices[0].message.content)

        except Exception as e:
            logger.error(f"Flashcard generation failed: {e}")
            return {"flashcards": [], "error": str(e)}

    async def generate_quiz(self, topic: str, context_chunks: list[dict], avoid_questions: Optional[list[str]] = None) -> dict:
        """Generate quiz questions from context chunks."""
        client = self._get_client()
        context = self._format_context(context_chunks)

        system_prompt = QUIZ_PROMPT
        temperature = 0.3
        if avoid_questions:
            avoid_list = "\n".join([f"- {q}" for q in avoid_questions])
            system_prompt += f"\n\nCRITICAL INSTRUCTION: You MUST generate ENTIRELY DIFFERENT questions from the ones listed below. Compare your ideas against this forbidden list. If your proposed question is conceptually similar to any of these, DISCARD IT and test a different detail or concept from the text.\nForbidden questions:\n{avoid_list}"
            temperature = 0.6  # Increase temperature to encourage variety

        try:
            response = client.chat.completions.create(
                model=self._settings.groq_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"## Requested Topic to Focus On:\n{topic}\n\n## Course material context:\n\n{context}"}
                ],
                response_format={"type": "json_object"},
                temperature=temperature,
                max_tokens=2000
            )

            return json.loads(response.choices[0].message.content)

        except Exception as e:
            logger.error(f"Quiz generation failed: {e}")
            return {"questions": [], "error": str(e)}

    async def extract_syllabus_topics(self, markdown: str) -> dict:
        """Extract structured syllabus modules and topics from markdown."""
        client = self._get_client()
        
        prompt = """You are a Data Extraction AI. Read the provided syllabus markdown and extract all the modules/units and their topics.
Format your output STRICTLY as a JSON object with a single key 'modules' containing an array of module objects.
Example format:
{
    "modules": [
        {
            "module_number": 1,
            "module_name": "Introduction to Database Systems",
            "topics": [
                {
                    "topic_name": "Data Independence",
                    "subtopics": ["Logical", "Physical"]
                }
            ]
        }
    ]
}"""

        try:
            response = client.chat.completions.create(
                model=self._settings.groq_model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"## Syllabus Markdown:\n\n{markdown[:60000]}"} # truncate just in case
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=4000
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Syllabus extraction failed: {e}")
            return {"modules": [], "error": str(e)}

    async def extract_pyq_questions(self, markdown: str, known_topics: list[str] = None) -> dict:
        """Extract structured past year questions and marks from markdown."""
        client = self._get_client()
        
        topics_guidance = ""
        if known_topics:
            topics_list = ", ".join([f"'{t}'" for t in known_topics])
            topics_guidance = f"\nCRITICAL TOPIC MAPPING RULE: You MUST categorize each question into one of the following official syllabus topics: [{topics_list}]. Do NOT invent your own specific topics (e.g. use 'Dynamic Programming' instead of '0/1 Knapsack'). Choose the best matching topic from the list."

        prompt = f"""You are a highly precise Data Extraction AI. Read the provided exam paper (PYQ) markdown and extract ALL individual questions, their question numbers, the marks allocated to them, and infer a concise 'topic_name' for each question.
{topics_guidance}

CRITICAL COMPLETENESS RULE: You MUST extract EVERY SINGLE question. Do not skip any question. Even if it looks like a scenario, a preamble, or an instruction, if it has marks assigned to it, it is a question and MUST be extracted.

Format your output STRICTLY as a JSON object with a single key 'questions' containing an array of question objects.
Example format:
{{
    "questions": [
        {{
            "question_number": "1(a)",
            "question_text": "Explain the difference between 3NF and BCNF with examples.",
            "topic_name": "Normalization",
            "marks": 5
        }}
    ]
}}
If marks are not specified for a question, estimate it based on similar questions or set to 0. Do NOT skip the question."""

        try:
            response = client.chat.completions.create(
                model=self._settings.groq_model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"## Exam Paper Markdown:\n\n{markdown[:60000]}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=4000
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"PYQ extraction failed: {e}")
            return {"questions": [], "error": str(e)}

    def _format_context(self, chunks: list[dict]) -> str:
        """
        Format context chunks into a clean string for the LLM prompt.
        
        Each chunk is labeled with its source for provenance tracking.
        """
        parts = []
        for i, chunk in enumerate(chunks, 1):
            metadata = chunk.get("metadata", {})
            source = metadata.get("source_type", "unknown")
            year = metadata.get("exam_year", "")
            heading = metadata.get("heading", "")
            
            header = f"--- Source {i} [{source}"
            if year:
                header += f", {year}"
            if heading:
                header += f", {heading}"
            header += "] ---"
            
            parts.append(f"{header}\n{chunk.get('content', '')}")
        
        return "\n\n".join(parts)


# Singleton
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Get or create the global LLM client instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client
