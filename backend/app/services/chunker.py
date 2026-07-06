"""
Document Chunking Service
============================
Splits extracted Markdown into overlapping chunks for vector embedding.

THE CHUNKING STRATEGY EXPLAINED:
After Docling extracts a 20-page exam paper into Markdown, we need to
split it into digestible pieces for the vector database. But HOW we
split matters enormously for retrieval quality.

NAIVE APPROACH (what most tutorials teach):
  - Split every N characters → Breaks mid-sentence, mid-table, mid-question
  - Result: "Question 4.a: Explain the difference between" [CHUNK BREAK]
            "static and dynamic binding." [NEXT CHUNK]
  - The search engine can never find the full question.

OUR APPROACH (semantic-aware chunking):
  1. Prefer splitting at HEADING BOUNDARIES (# Module 3, ## Question 4)
  2. Fallback to PARAGRAPH BOUNDARIES (double newlines)
  3. Last resort: sentence boundaries (period + space)
  4. OVERLAP: 64 tokens of the previous chunk are prepended to the next
     → This ensures cross-boundary concepts appear in at least one chunk

WHY 512 TOKENS:
  - all-MiniLM-L6-v2 has a max input of 512 tokens
  - Chunks longer than 512 get truncated by the embedding model → lost data
  - Shorter chunks (128-256) increase total chunk count → slower search
  - 512 is the sweet spot: full model utilization with manageable count
"""

import re
import logging
from typing import Optional
from app.utils.text_utils import count_tokens, get_tokenizer

logger = logging.getLogger(__name__)

# Chunking configuration
MAX_CHUNK_TOKENS = 512     # Maximum tokens per chunk
OVERLAP_TOKENS = 64        # Tokens of overlap between consecutive chunks
MIN_CHUNK_TOKENS = 5       # Minimum chunk size (skip tiny fragments)


class DocumentChunker:
    """
    Splits documents into overlapping, metadata-tagged chunks.
    
    Each chunk is a dictionary:
    {
        "content": str,           # The text content
        "chunk_index": int,       # Position in the document (0-indexed)
        "token_count": int,       # Number of tokens
        "metadata": {
            "course_id": str,     # Which course
            "document_id": str,   # Which document
            "source_type": str,   # "syllabus" or "pyq"
            "exam_year": int,     # Year of the PYQ (if applicable)
            "file_name": str,     # Original filename
            "heading": str,       # Most recent heading above this chunk
        }
    }
    """

    def chunk_document(
        self,
        markdown: str,
        course_id: str,
        document_id: str,
        source_type: str,
        file_name: str,
        exam_year: Optional[int] = None
    ) -> list[dict]:
        """
        Main entry point: split a Markdown document into overlapping chunks.
        
        Args:
            markdown: The full document as Markdown text
            course_id: UUID of the course
            document_id: UUID of the uploaded document
            source_type: "syllabus" or "pyq"
            file_name: Original filename (for provenance tracking)
            exam_year: Year of the exam paper (None for syllabi)
        
        Returns:
            List of chunk dictionaries ready for embedding and storage.
        """
        if not markdown or not markdown.strip():
            logger.warning(f"Empty document received for chunking: {file_name}")
            return []

        # Step 1: Split document into semantic sections (by headings)
        sections = self._split_by_headings(markdown)
        
        # Step 2: Further split large sections into token-limited chunks
        raw_chunks = []
        for heading, section_text in sections:
            section_chunks = self._split_section(section_text, heading)
            raw_chunks.extend(section_chunks)

        # Step 3: Apply overlap between consecutive chunks
        overlapped_chunks = self._apply_overlap(raw_chunks)

        # Step 4: Tag each chunk with metadata
        tagged_chunks = []
        for i, chunk in enumerate(overlapped_chunks):
            token_count = count_tokens(chunk["content"])
            
            # Skip chunks that are too small to be useful
            if token_count < MIN_CHUNK_TOKENS:
                continue

            tagged_chunks.append({
                "content": chunk["content"],
                "chunk_index": i,
                "token_count": token_count,
                "metadata": {
                    "course_id": course_id,
                    "document_id": document_id,
                    "source_type": source_type,
                    "exam_year": exam_year,
                    "file_name": file_name,
                    "heading": chunk.get("heading", ""),
                }
            })

        logger.info(
            f"Chunked '{file_name}' into {len(tagged_chunks)} chunks "
            f"(avg {sum(c['token_count'] for c in tagged_chunks) // max(len(tagged_chunks), 1)} tokens/chunk)"
        )
        
        return tagged_chunks

    def _split_by_headings(self, markdown: str) -> list[tuple[str, str]]:
        """
        Split document at Markdown heading boundaries.
        
        Returns list of (heading, content) tuples.
        The heading is the most recent heading above the content block.
        """
        # Regex matches lines starting with 1-4 # symbols
        heading_pattern = re.compile(r'^(#{1,4})\s+(.+)$', re.MULTILINE)
        
        sections = []
        last_pos = 0
        current_heading = "Introduction"

        for match in heading_pattern.finditer(markdown):
            # Everything between the last heading and this one is a section
            section_text = markdown[last_pos:match.start()].strip()
            if section_text:
                sections.append((current_heading, section_text))
            
            current_heading = match.group(2).strip()
            last_pos = match.end()

        # Don't forget the last section (after the final heading)
        remaining = markdown[last_pos:].strip()
        if remaining:
            sections.append((current_heading, remaining))

        # If no headings were found, treat the whole document as one section
        if not sections:
            sections = [("Document", markdown)]

        return sections

    def _split_section(self, text: str, heading: str) -> list[dict]:
        """
        Split a single section into token-limited chunks.
        
        Strategy (in order of preference):
        1. Split at paragraph boundaries (double newline)
        2. Split at sentence boundaries (period + space)
        3. Hard split at token limit (last resort)
        """
        token_count = count_tokens(text)
        
        # If the section fits in one chunk, return it directly
        if token_count <= MAX_CHUNK_TOKENS:
            return [{"content": text, "heading": heading}]

        chunks = []
        
        # Split into paragraphs first
        paragraphs = re.split(r'\n\s*\n', text)
        
        current_chunk = ""
        current_tokens = 0

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            para_tokens = count_tokens(para)
            
            # If adding this paragraph exceeds the limit, save current chunk
            if current_tokens + para_tokens > MAX_CHUNK_TOKENS and current_chunk:
                chunks.append({"content": current_chunk.strip(), "heading": heading})
                current_chunk = ""
                current_tokens = 0

            # If a single paragraph exceeds the limit, split by sentences
            if para_tokens > MAX_CHUNK_TOKENS:
                if current_chunk:
                    chunks.append({"content": current_chunk.strip(), "heading": heading})
                    current_chunk = ""
                    current_tokens = 0
                
                sentence_chunks = self._split_by_sentences(para, heading)
                chunks.extend(sentence_chunks)
            else:
                current_chunk += para + "\n\n"
                current_tokens += para_tokens

        # Don't forget the last chunk
        if current_chunk.strip():
            chunks.append({"content": current_chunk.strip(), "heading": heading})

        return chunks

    def _split_by_sentences(self, text: str, heading: str) -> list[dict]:
        """
        Split text at sentence boundaries when paragraphs are too long.
        Sentence detection uses period/question/exclamation + space.
        """
        # Simple sentence splitter (handles Mr., Dr., etc. reasonably)
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        chunks = []
        current_chunk = ""
        current_tokens = 0

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            sent_tokens = count_tokens(sentence)
            
            if current_tokens + sent_tokens > MAX_CHUNK_TOKENS and current_chunk:
                chunks.append({"content": current_chunk.strip(), "heading": heading})
                current_chunk = ""
                current_tokens = 0

            current_chunk += sentence + " "
            current_tokens += sent_tokens

        if current_chunk.strip():
            chunks.append({"content": current_chunk.strip(), "heading": heading})

        return chunks

    def _apply_overlap(self, chunks: list[dict]) -> list[dict]:
        """
        Add overlap between consecutive chunks.
        
        WHY OVERLAP:
        Without overlap, a concept that spans the boundary of two chunks
        would be partially represented in each — but fully represented in
        neither. This causes retrieval failures for boundary-spanning queries.
        
        HOW: Prepend the last OVERLAP_TOKENS tokens from chunk[i-1] to chunk[i].
        """
        if len(chunks) <= 1:
            return chunks

        tokenizer = get_tokenizer()
        overlapped = [chunks[0]]  # First chunk has no predecessor

        for i in range(1, len(chunks)):
            prev_content = chunks[i - 1]["content"]
            curr_content = chunks[i]["content"]
            
            # Get the last OVERLAP_TOKENS tokens of the previous chunk
            prev_tokens = tokenizer.encode(prev_content)
            
            if len(prev_tokens) > OVERLAP_TOKENS:
                overlap_tokens = prev_tokens[-OVERLAP_TOKENS:]
                overlap_text = tokenizer.decode(overlap_tokens)
                
                # Prepend the overlap with a visual separator
                overlapped_content = f"...{overlap_text}\n\n{curr_content}"
            else:
                overlapped_content = curr_content
            
            overlapped.append({
                "content": overlapped_content,
                "heading": chunks[i].get("heading", "")
            })

        return overlapped


# Singleton instance
_chunker: Optional[DocumentChunker] = None


def get_chunker() -> DocumentChunker:
    """Get or create the global chunker instance."""
    global _chunker
    if _chunker is None:
        _chunker = DocumentChunker()
    return _chunker
