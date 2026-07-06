"""
Text Utility Functions
========================
Shared text processing helpers used across the pipeline.
"""

import re
import tiktoken
from typing import Optional


# Load the tokenizer once (cl100k_base works for most modern models)
# This is the same tokenizer used by GPT-4 and works well for token counting
_tokenizer = None


def get_tokenizer():
    """Lazy-load the tokenizer to avoid startup costs if not needed."""
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = tiktoken.get_encoding("cl100k_base")
    return _tokenizer


def count_tokens(text: str) -> int:
    """
    Count the number of tokens in a text string.
    
    WHY WE COUNT TOKENS (not characters or words):
    - LLMs process text as tokens, not words
    - "O(n log n)" is multiple tokens despite being one "word"
    - Accurate token counting prevents context window overflow
    - Our chunk size limit (512 tokens) must be measured precisely
    """
    tokenizer = get_tokenizer()
    return len(tokenizer.encode(text))


def clean_extracted_text(text: str) -> str:
    """
    Clean up text extracted from PDFs by Docling.
    
    Docling does a great job, but extracted text often has:
    - Excessive whitespace from column layouts
    - Page headers/footers repeated on every page
    - Unicode artifacts from PDF encoding
    - Orphaned bullet points or numbering
    """
    # Normalize Unicode characters
    text = text.replace('\u2018', "'").replace('\u2019', "'")  # Smart quotes
    text = text.replace('\u201c', '"').replace('\u201d', '"')  # Smart double quotes
    text = text.replace('\u2013', '-').replace('\u2014', '-')  # Em/en dashes
    text = text.replace('\u00a0', ' ')  # Non-breaking spaces
    
    # Remove common page artifacts first (before collapsing newlines)
    text = re.sub(r'Page \d+ of \d+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^\d+\s*$', '', text, flags=re.MULTILINE)  # Lone page numbers
    
    # Collapse multiple blank lines into max 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Collapse multiple spaces into one (but preserve newlines)
    text = re.sub(r'[^\S\n]+', ' ', text)
    
    return text.strip()


def extract_year_from_filename(filename: str) -> Optional[int]:
    """
    Try to extract an exam year from a filename.
    
    Common patterns:
    - "CS402_PYQ_2023.pdf" → 2023
    - "Past-Papers-2022-May.pdf" → 2022
    - "exam_questions_21-22.pdf" → 2022 (takes the later year)
    """
    # Look for 4-digit years between 2000-2030
    years = re.findall(r'20[0-3]\d', filename)
    if years:
        return int(max(years))  # Return the most recent year found
    
    # Look for 2-digit years (21, 22, 23, etc.)
    short_years = re.findall(r'(?<!\d)([2][0-9])(?!\d)', filename)
    if short_years:
        return 2000 + int(max(short_years))
    
    return None


def extract_marks_from_text(text: str) -> Optional[int]:
    """
    Try to extract mark allocation from question text.
    
    Common patterns in Indian university papers:
    - "[10 marks]"
    - "(5M)" or "(5 Marks)"
    - "marks: 10"
    - "10 pts"
    """
    patterns = [
        r'\[(\d+)\s*(?:marks?|pts?|points?)\]',
        r'\((\d+)\s*(?:marks?|pts?|points?|M)\)',
        r'(?:marks?|pts?)\s*[:=]\s*(\d+)',
        r'(\d+)\s*(?:marks?|pts?|points?)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            marks = int(match.group(1))
            # Sanity check: marks should be between 1 and 100
            if 1 <= marks <= 100:
                return marks
    
    return None


def truncate_text(text: str, max_tokens: int = 512) -> str:
    """
    Truncate text to a maximum number of tokens.
    Useful for ensuring context chunks fit within model limits.
    """
    tokenizer = get_tokenizer()
    tokens = tokenizer.encode(text)
    
    if len(tokens) <= max_tokens:
        return text
    
    # Decode only the first max_tokens tokens
    truncated_tokens = tokens[:max_tokens]
    return tokenizer.decode(truncated_tokens)
