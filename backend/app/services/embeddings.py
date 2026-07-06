"""
Embedding Generation Service
================================
Generates dense vector embeddings for document chunks using sentence-transformers.

WHAT ARE EMBEDDINGS?
An embedding converts a text string into a fixed-size array of floating-point
numbers (a "vector"). Text with similar MEANING will have vectors that are
close together in the embedding space — even if the words are completely different.

Example:
  "sorting algorithm efficiency" → [0.12, -0.34, 0.56, ...]
  "how fast does quicksort run"  → [0.11, -0.33, 0.55, ...]  ← very similar!
  "the weather is nice today"    → [0.89, 0.12, -0.67, ...]  ← very different

WHY all-MiniLM-L6-v2:
  - Only 80MB (vs. 420MB for larger models)
  - 384-dimensional output (efficient for pgvector storage)
  - Runs in ~5ms per chunk on CPU
  - Trained on 1B+ sentence pairs — excellent semantic quality
  - No GPU, no API calls, no cost — runs entirely locally

HOW THIS FITS IN THE PIPELINE:
  PDF → Docling → Chunks → [THIS SERVICE] → Vectors → Supabase pgvector
                                                     ↕
                                              User query → Vector → Similarity search
"""

import logging
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Generates vector embeddings for text chunks.
    
    The model is loaded lazily (first call) and cached for the process lifetime.
    On a free-tier server with 512MB RAM, the model uses ~120MB — well within limits.
    """

    def __init__(self):
        self._model = None
        self._settings = get_settings()

    def _load_model(self):
        """
        Lazy-load the embedding model.
        
        WHY LAZY: Loading the model takes ~2 seconds. We don't want to block
        the FastAPI startup. Instead, the first embedding request triggers
        the load, and all subsequent requests reuse the loaded model.
        """
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                
                logger.info(f"Loading embedding model: {self._settings.embedding_model}")
                self._model = SentenceTransformer(self._settings.embedding_model)
                logger.info(f"Embedding model loaded. Dimensions: {self._settings.embedding_dimensions}")
            except ImportError:
                logger.error(
                    "sentence-transformers is not installed! "
                    "Install with: pip install sentence-transformers"
                )
                raise

    def embed_text(self, text: str) -> list[float]:
        """
        Generate an embedding vector for a single text string.
        
        Args:
            text: The text to embed (typically a document chunk)
        
        Returns:
            List of floats with length = embedding_dimensions (384)
        """
        self._load_model()
        
        # encode() returns a numpy array; we convert to list for JSON serialization
        embedding = self._model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """
        Generate embeddings for multiple texts in a single batch.
        
        Batching is ~5x faster than individual calls because the model
        processes all texts in one GPU/CPU pass instead of N separate passes.
        
        Args:
            texts: List of text strings to embed
            batch_size: How many texts to process per internal batch
                       (32 is optimal for CPU; use 64-128 for GPU)
        
        Returns:
            List of embedding vectors (same order as input texts)
        """
        self._load_model()
        
        logger.info(f"Embedding batch of {len(texts)} texts")
        
        embeddings = self._model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,  # L2 normalize for cosine similarity
            show_progress_bar=len(texts) > 100  # Progress bar for large batches
        )
        
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a search query.
        
        NOTE: For some models, query embeddings should be generated differently
        than document embeddings (e.g., with a "query: " prefix). MiniLM doesn't
        require this distinction, but we keep this separate method for future
        model upgrades where it might matter.
        """
        return self.embed_text(query)


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
