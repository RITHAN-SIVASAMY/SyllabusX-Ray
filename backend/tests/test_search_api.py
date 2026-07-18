import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from app.main import app
from app.auth.jwt_handler import get_current_user

# Override dependency for authentication
def override_get_current_user():
    return {"sub": "user_123", "email": "test@example.com"}

app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)

@patch("app.routers.search.get_supabase_admin_client")
def test_search_course_not_found(mock_supabase):
    # Mock supabase response to simulate course not found
    mock_query = MagicMock()
    # Mocking supabase.table().select().eq().eq().execute()
    mock_query.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    mock_supabase.return_value.table.return_value = mock_query

    response = client.post(
        "/api/search/",
        json={"query": "test query", "course_id": "invalid_course"}
    )
    
    assert response.status_code == 404
    assert response.json()["detail"] == "Course not found"


@patch("app.routers.search.get_supabase_admin_client")
@patch("app.routers.search.get_hybrid_search_service")
@patch("app.routers.search.get_reranker_service")
@patch("app.routers.search.get_llm_client")
def test_search_success(mock_llm, mock_reranker, mock_search, mock_supabase):
    # Setup Supabase mock
    mock_query = MagicMock()
    mock_query.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"id": "valid_course"}]
    mock_supabase.return_value.table.return_value = mock_query
    
    # Setup Hybrid Search mock
    mock_search_instance = AsyncMock()
    mock_search_instance.search.return_value = [{"id": "1", "content": "mocked chunk"}]
    mock_search.return_value = mock_search_instance
    
    # Setup Reranker mock
    mock_reranker_instance = AsyncMock()
    mock_reranker_instance.rerank.return_value = [{"id": "1", "content": "mocked chunk", "rerank_score": 0.9}]
    mock_reranker.return_value = mock_reranker_instance
    
    # Setup LLM mock
    mock_llm_instance = AsyncMock()
    mock_llm_instance.generate_study_content.return_value = {
        "answer": "This is a mocked answer.",
        "confidence": 0.95
    }
    mock_llm.return_value = mock_llm_instance
    
    response = client.post(
        "/api/search/",
        json={"query": "What is testing?", "course_id": "valid_course", "mode": "explain"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "This is a mocked answer."
    assert data["confidence_score"] == 0.95
    assert len(data["source_chunks"]) == 1
