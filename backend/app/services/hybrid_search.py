"""
Hybrid Search Service (pgvector + tsvector + RRF)
====================================================
The heart of the RAG retrieval pipeline.

WHY "HYBRID" SEARCH:
Pure vector search (semantic) and pure keyword search each have blind spots:

VECTOR SEARCH ALONE:
  ✅ "How does sorting work?" → matches "comparison-based ordering algorithms"
  ❌ "Find CS402 questions" → CS402 is a course code, not a concept
  ❌ "What about O(n log n)?" → mathematical notation has no semantic meaning

KEYWORD SEARCH ALONE:
  ✅ "CS402" → exact match works perfectly
  ✅ "O(n log n)" → exact string match
  ❌ "How does sorting work?" → misses "comparison-based ordering" (different words)

HYBRID = BEST OF BOTH:
  ✅ Semantic concepts → vector branch catches them
  ✅ Exact codes/formulas → keyword branch catches them
  ✅ Mixed queries → both branches contribute, fused by RRF

RECIPROCAL RANK FUSION (RRF):
  Instead of just averaging scores (which doesn't work because vector scores
  and keyword scores are on different scales), RRF uses RANK positions:
  
  RRF_score(doc) = Σ  1 / (k + rank_in_list)
  
  where k=60 is a smoothing constant. A document ranked #1 in both lists
  gets a much higher fused score than one ranked #1 in only one list.
"""

import logging
from typing import Optional
from app.models.database import get_supabase_admin_client
from app.services.embeddings import get_embedding_service
from app.config import get_settings

logger = logging.getLogger(__name__)

# RRF smoothing constant (standard value from the original RRF paper)
RRF_K = 60


class HybridSearchService:
    """
    Executes parallel dense + sparse searches and fuses results with RRF.
    """

    def __init__(self):
        self.supabase = get_supabase_admin_client()
        self.embedding_service = get_embedding_service()

    async def search(
        self,
        query: str,
        course_id: str,
        top_k: int = 30,
        source_type: Optional[str] = None
    ) -> list[dict]:
        """
        Execute a hybrid search and return fused results.
        
        Args:
            query: The student's search question
            course_id: Restrict search to this course's documents
            top_k: Number of results to return after fusion
            source_type: Optional filter ("syllabus" or "pyq")
        
        Returns:
            List of dicts, each containing:
            {
                "id": chunk UUID,
                "content": chunk text,
                "metadata": {...},
                "score": RRF fusion score,
                "rank": position in final ranking (1-indexed)
            }
        """
        logger.info(f"Hybrid search: '{query[:80]}...' in course {course_id}")

        # Run both searches in parallel (conceptually — executed sequentially
        # here for simplicity, but could be asyncio.gather'd for performance)
        vector_results = await self._vector_search(query, course_id, top_k, source_type)
        keyword_results = await self._keyword_search(query, course_id, top_k, source_type)

        # Fuse results using Reciprocal Rank Fusion
        fused = self._reciprocal_rank_fusion(vector_results, keyword_results)

        # Return top_k fused results
        top_results = fused[:top_k]

        logger.info(
            f"Hybrid search returned {len(top_results)} results "
            f"(vector: {len(vector_results)}, keyword: {len(keyword_results)})"
        )

        return top_results

    async def _vector_search(
        self,
        query: str,
        course_id: str,
        top_k: int,
        source_type: Optional[str]
    ) -> list[dict]:
        """
        Dense vector similarity search using pgvector.
        
        HOW IT WORKS:
        1. Convert the query text into a 384-dim embedding vector
        2. Use pgvector's cosine distance operator (<=> ) to find nearest neighbors
        3. The database returns chunks with the most similar meaning
        
        The SQL function 'match_document_chunks' is a stored procedure in Supabase
        that wraps the pgvector similarity query for clean API access.
        """
        try:
            # Generate query embedding
            query_embedding = self.embedding_service.embed_query(query)

            # Call Supabase RPC function for vector similarity search
            # This calls a stored SQL function we define in the migration script
            params = {
                "query_embedding": query_embedding,
                "match_course_id": course_id,
                "match_count": top_k
            }
            
            if source_type:
                params["filter_source_type"] = source_type

            response = self.supabase.rpc(
                "match_document_chunks",
                params
            ).execute()

            results = []
            for i, row in enumerate(response.data or []):
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "metadata": row.get("metadata", {}),
                    "similarity": row.get("similarity", 0),
                    "rank": i + 1,
                    "source": "vector"
                })

            return results

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

    async def _keyword_search(
        self,
        query: str,
        course_id: str,
        top_k: int,
        source_type: Optional[str]
    ) -> list[dict]:
        """
        Sparse keyword search using PostgreSQL Full-Text Search (tsvector).
        
        HOW IT WORKS:
        1. PostgreSQL's to_tsquery() converts the query into a search token list
        2. The @@ operator matches these tokens against pre-computed tsvector columns
        3. ts_rank_cd() scores results by how well they match
        
        This catches EXACT terms that vector search would miss:
        - Course codes (CS402)
        - Mathematical notation (O(n log n))
        - Specific technical terms (tsvector, pgvector)
        - Exam-specific keywords (2023, May, Section B)
        """
        try:
            # Build the full-text search query
            # plainto_tsquery handles natural language queries automatically
            # (splits on spaces, removes stop words, stems words)
            params = {
                "search_query": query,
                "match_course_id": course_id,
                "match_count": top_k
            }
            
            if source_type:
                params["filter_source_type"] = source_type

            response = self.supabase.rpc(
                "keyword_search_chunks",
                params
            ).execute()

            results = []
            for i, row in enumerate(response.data or []):
                results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "metadata": row.get("metadata", {}),
                    "ts_rank": row.get("rank", 0),
                    "rank": i + 1,
                    "source": "keyword"
                })

            return results

        except Exception as e:
            logger.error(f"Keyword search failed: {e}")
            return []

    def _reciprocal_rank_fusion(
        self,
        vector_results: list[dict],
        keyword_results: list[dict]
    ) -> list[dict]:
        """
        Merge results from two different ranking lists using RRF.
        
        THE MATH:
        For each document that appears in ANY list:
            rrf_score = sum over all lists: 1 / (k + rank_in_that_list)
        
        where k = 60 (smoothing constant from the original RRF paper).
        
        WHY NOT JUST AVERAGE SCORES?
        Vector similarity scores are between 0-1 (cosine similarity).
        Keyword search scores are on a completely different scale (ts_rank).
        You can't meaningfully average 0.87 (vector) with 3.45 (keyword).
        RRF converts both to RANK-based scores, which are directly comparable.
        
        EXAMPLE:
        Doc A: rank #1 in vector, rank #3 in keyword
          → score = 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323
        Doc B: rank #2 in vector only (not in keyword results)
          → score = 1/(60+2) = 0.0161
        Doc A wins because it appeared in both lists.
        """
        # Collect all unique documents with their ranks per source
        doc_ranks: dict[str, dict] = {}

        for result in vector_results:
            doc_id = result["id"]
            if doc_id not in doc_ranks:
                doc_ranks[doc_id] = {"data": result, "ranks": {}}
            doc_ranks[doc_id]["ranks"]["vector"] = result["rank"]

        for result in keyword_results:
            doc_id = result["id"]
            if doc_id not in doc_ranks:
                doc_ranks[doc_id] = {"data": result, "ranks": {}}
            doc_ranks[doc_id]["ranks"]["keyword"] = result["rank"]

        # Calculate RRF score for each document
        fused_results = []
        for doc_id, info in doc_ranks.items():
            rrf_score = 0
            for source, rank in info["ranks"].items():
                rrf_score += 1.0 / (RRF_K + rank)

            result = info["data"].copy()
            result["score"] = rrf_score
            result["appeared_in"] = list(info["ranks"].keys())
            fused_results.append(result)

        # Sort by RRF score (highest first)
        fused_results.sort(key=lambda x: x["score"], reverse=True)

        # Assign final rank
        for i, result in enumerate(fused_results):
            result["rank"] = i + 1

        return fused_results


# Singleton
_search_service: Optional[HybridSearchService] = None


def get_hybrid_search_service() -> HybridSearchService:
    """Get or create the global hybrid search service instance."""
    global _search_service
    if _search_service is None:
        _search_service = HybridSearchService()
    return _search_service
