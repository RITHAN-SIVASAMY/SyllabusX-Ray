"""
FlashRank Reranking Service
===============================
Second-stage reranking using a cross-encoder model on CPU.

WHY RERANKING AFTER HYBRID SEARCH?
The hybrid search (vector + keyword + RRF) returns the top 30 candidates.
These are GOOD candidates, but their ranking isn't perfect because:

1. Vector search uses BI-ENCODER similarity — it compares the query embedding
   with each chunk embedding INDEPENDENTLY. This is fast but shallow.
   
2. A CROSS-ENCODER compares the query AND the chunk TOGETHER in a single pass,
   allowing deep attention-based interaction between the two texts.

ANALOGY:
  - Bi-encoder (vector search): Looking at two photos separately and guessing
    if they show the same person. Fast, but sometimes wrong.
  - Cross-encoder (reranking): Holding the photos side-by-side and carefully
    comparing features. Slower, but much more accurate.

WHY WE CAN'T USE CROSS-ENCODER FOR EVERYTHING:
  Cross-encoders need to process (query, chunk) pairs. For 10,000 chunks,
  that's 10,000 model forward passes — way too slow.
  
  Instead: vector search narrows 10,000 → 30, then cross-encoder reranks 30 → 5.
  Total time: ~100ms (vector) + ~50ms (rerank) = ~150ms. Excellent.

WHY FLASHRANK:
  - Only ~33MB model (ms-marco-MiniLM-L-12-v2)
  - CPU-only, no PyTorch dependency
  - Processes 30 passages in <50ms
  - Perfect for free-tier deployment with no GPU
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RerankerService:
    """
    Reranks search results using FlashRank's cross-encoder model.
    """

    def __init__(self):
        self._ranker = None

    def _load_ranker(self):
        """
        Lazy-load the FlashRank model.
        
        Model: ms-marco-MiniLM-L-12-v2
        - Trained on MS MARCO passage ranking dataset
        - 12-layer MiniLM architecture
        - Optimized for CPU inference via ONNX runtime
        """
        if self._ranker is None:
            try:
                from flashrank import Ranker
                
                logger.info("Loading FlashRank reranker model...")
                self._ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2")
                logger.info("FlashRank reranker loaded successfully")
            except ImportError:
                logger.error(
                    "FlashRank is not installed! "
                    "Install with: pip install flashrank"
                )
                raise

    async def rerank(
        self,
        query: str,
        results: list[dict],
        top_k: int = 5
    ) -> list[dict]:
        """
        Rerank search results using cross-encoder scoring.
        
        Args:
            query: The student's original question
            results: List of search result dicts (must have 'content' and 'id' keys)
            top_k: Number of top results to return after reranking
        
        Returns:
            The top_k results, re-ordered by cross-encoder relevance score.
            Each result gets a new 'rerank_score' field.
        
        WHAT HAPPENS INTERNALLY:
        1. For each result, FlashRank processes (query, result.content) together
        2. The cross-encoder outputs a relevance score for each pair
        3. Results are re-sorted by this score
        4. Top-k are returned
        """
        if not results:
            return []

        self._load_ranker()

        try:
            from flashrank import RerankRequest

            # Prepare passages in FlashRank's expected format
            passages = []
            for result in results:
                passages.append({
                    "id": result.get("id", ""),
                    "text": result.get("content", ""),
                    # FlashRank allows passing metadata through
                    "meta": {
                        "original_score": result.get("score", 0),
                        "original_rank": result.get("rank", 0),
                        "metadata": result.get("metadata", {}),
                    }
                })

            # Execute reranking
            rerank_request = RerankRequest(query=query, passages=passages)
            reranked = self._ranker.rerank(rerank_request)

            # Reconstruct our result format with reranking scores
            reranked_results = []
            for i, item in enumerate(reranked[:top_k]):
                original_meta = item.get("meta", {})
                reranked_results.append({
                    "id": item["id"],
                    "content": item["text"],
                    "metadata": original_meta.get("metadata", {}),
                    "rerank_score": float(item.get("score", 0)),
                    "original_score": float(original_meta.get("original_score", 0)),
                    "rank": i + 1
                })

            logger.info(
                f"Reranked {len(results)} results → top {len(reranked_results)}. "
                f"Best score: {reranked_results[0]['rerank_score']:.4f}" if reranked_results else "No results"
            )

            return reranked_results

        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            # Graceful fallback: return original results in their original order
            return results[:top_k]


# Singleton
_reranker: Optional[RerankerService] = None


def get_reranker_service() -> RerankerService:
    """Get or create the global reranker service instance."""
    global _reranker
    if _reranker is None:
        _reranker = RerankerService()
    return _reranker
