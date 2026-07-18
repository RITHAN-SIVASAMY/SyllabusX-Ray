import pytest
from unittest.mock import patch, MagicMock
from app.services.reranker import RerankerService, get_reranker_service

class TestRerankerService:
    @pytest.fixture
    def reranker(self):
        # Reset the singleton before each test if needed
        import app.services.reranker as reranker_module
        reranker_module._reranker = None
        return get_reranker_service()

    @patch('app.services.reranker.RerankerService._load_ranker')
    @pytest.mark.asyncio
    async def test_empty_results(self, mock_load, reranker):
        """Should return empty list immediately if input is empty."""
        results = await reranker.rerank("query", [])
        assert results == []
        mock_load.assert_not_called()

    @patch('app.services.reranker.logger')
    @pytest.mark.asyncio
    async def test_fallback_on_error(self, mock_logger, reranker):
        """Should gracefully return original results truncated to top_k on error."""
        results = [{"id": "1", "content": "test"}] * 10
        with patch.object(reranker, '_load_ranker', side_effect=Exception("Model error")):
            reranked = await reranker.rerank("query", results, top_k=5)
            assert len(reranked) == 5
            mock_logger.error.assert_called()

    @pytest.mark.asyncio
    async def test_successful_rerank(self, reranker):
        """Should correctly format and return reranked results."""
        # Mock the ranker instance itself
        mock_ranker = MagicMock()
        mock_ranker.rerank.return_value = [
            {"id": "doc2", "text": "better content", "score": 0.9, "meta": {"original_score": 0.5, "metadata": {"source": "pdf"}}},
            {"id": "doc1", "text": "some content", "score": 0.7, "meta": {"original_score": 0.8, "metadata": {"source": "pdf"}}},
        ]
        
        # Avoid trying to import flashrank by setting _ranker directly and patching _load_ranker
        reranker._ranker = mock_ranker
        
        input_results = [
            {"id": "doc1", "content": "some content", "score": 0.8},
            {"id": "doc2", "content": "better content", "score": 0.5},
        ]

        with patch.object(reranker, '_load_ranker'):
            # Also mock flashrank.RerankRequest which is imported inside rerank
            with patch.dict('sys.modules', {'flashrank': MagicMock()}):
                reranked = await reranker.rerank("test query", input_results, top_k=2)

        assert len(reranked) == 2
        assert reranked[0]["id"] == "doc2"
        assert reranked[0]["rerank_score"] == 0.9
        assert reranked[1]["id"] == "doc1"
        assert reranked[1]["rerank_score"] == 0.7
