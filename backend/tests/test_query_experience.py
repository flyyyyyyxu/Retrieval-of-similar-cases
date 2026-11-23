"""问题优化与综合答复接口的边界；不发送外部模型请求。"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.llm import LLMError
from app.pipeline.optimize import OptimizedQuestion, optimize_question


class FakeOptimizer:
    def __init__(self, configured=True, fail=False):
        self.configured = configured
        self.fail = fail
        self.s = SimpleNamespace(llm_optimize_max_tokens=900)
        self.calls = []

    def structured(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.fail:
            raise LLMError("timeout")
        return OptimizedQuestion(optimized_text="只有转账记录而没有借条，如何查找借贷关系认定的类案？")


def test_optimizer_one_short_call():
    model = FakeOptimizer()
    response = optimize_question("给对方转账但没有借条，想找类似案件", model, "RULES")
    assert response.status == "ready"
    assert len(model.calls) == 1
    assert model.calls[0][1] == {"effort": "low", "max_tokens": 900}
    assert response.original_text == "给对方转账但没有借条，想找类似案件"


@pytest.mark.parametrize("model", [FakeOptimizer(configured=False), FakeOptimizer(fail=True)])
def test_optimizer_keeps_original_when_unavailable(model):
    text = "向朋友转账但没有借条，想找类似案件"
    response = optimize_question(text, model, "RULES")
    assert response.status == "unavailable"
    assert response.optimized_text == text
    assert response.notice


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CASE_SOURCE", "mock")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("RERANK_URL", "")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "app.db"))
    from app import api
    from app.config import get_settings

    for factory in (get_settings, api.store, api.source, api.case_type, api.llm, api.optimization_llm):
        factory.cache_clear()
    from app.main import app

    return TestClient(app)


def test_optimize_endpoint_keeps_original_without_model(client):
    text = "只有转账记录，没有借条，想找借贷关系认定的案例"
    response = client.post("/api/query/optimize", json={"text": text})
    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert response.json()["optimized_text"] == text


def test_answer_is_explicitly_pending_not_fabricated(client, monkeypatch):
    from app import api

    for case in api.source().cases.values():
        monkeypatch.setattr(case, "research_points", [])
    query = client.post("/api/query/parse", json={"text": "只有转账记录，没有借条"}).json()["query"]
    result = client.post("/api/search", json={"query": query}).json()
    response = client.post("/api/search/answer", json={"search_id": result["search_id"]})
    assert response.status_code == 200
    assert response.json() == {
        "search_id": result["search_id"], "status": "pending",
        "conclusion": None, "judicial_view": None, "case_comparison": [], "judicial_points": [], "comparison_table": None, "version": 3,
    }
    assert client.post("/api/search/answer", json={"search_id": "missing"}).status_code == 404


def test_demo_analysis_citations_resolve_to_source_paragraphs(client):
    query = client.post("/api/query/parse", json={"text": "只有转账记录，没有借条"}).json()["query"]
    result = client.post("/api/search", json={"query": query}).json()
    response = client.post("/api/search/answer", json={"search_id": result["search_id"]})
    assert response.status_code == 200
    answer = response.json()
    assert answer["status"] == "ready"
    assert answer["judicial_points"] and answer["comparison_table"]
    assert len(answer["comparison_table"]["cases"]) >= 2
    for hit in result["hits"]:
        case = client.get(f"/api/cases/{hit['case']['id']}").json()
        paragraphs = {p["id"]: p["text"] for p in case["paragraphs"]}
        sections = {s["key"]: s for s in case["content_sections"]}
        for key in ("analysis", "overview"):
            section = sections[key]
            assert section["text"] and section["origin"] == "ai"
            assert section["paragraph_ids"]
            for ref in section["citations"]:
                assert ref["verified"] and ref["case_id"] == case["id"]
                assert ref["quote"] in paragraphs[ref["paragraph_id"]]
        for point in answer["judicial_points"]:
            for ref in point["citations"]:
                if ref["case_id"] == case["id"]:
                    assert ref["verified"] and ref["quote"] in paragraphs[ref["paragraph_id"]]


def test_optimizer_has_separate_latency_budget(client):
    from app.api import optimization_llm

    settings = optimization_llm().s
    assert settings.llm_timeout_s == 12
    assert settings.llm_max_retries == 0
    assert settings.llm_fallbacks is False


def test_case_detail_preserves_source_law_references(client, monkeypatch):
    from app import api
    from app.schemas import LawArticle, LawReference

    case = api.source().get("loan-1")
    case.law_references = [LawReference(
        id="demo-law", title="示例法规（演示）", version="测试版本",
        authority="示例发布机构", published_date="2025-01-01", effective_date="2025-02-01",
        articles=[LawArticle(id="a1", number="第一条", text="仅用于接口验证的示例条文。",
                             paragraph_ids=["p5"])],
    )]
    monkeypatch.setattr(api, "source", lambda: SimpleNamespace(get=lambda case_id: case))
    response = client.get("/api/cases/loan-1")
    assert response.status_code == 200
    law = response.json()["law_references"][0]
    assert law["title"] == "示例法规（演示）"
    assert law["effective_date"] == "2025-02-01"
    assert law["articles"][0]["paragraph_ids"] == ["p5"]


def test_result_filter_api_uses_saved_snapshot_and_rejects_invalid_input(client):
    q = client.post("/api/query/parse", json={"text": "只有转账记录，没有借条"}).json()["query"]
    result = client.post("/api/search", json={"query": q}).json()
    sid = result["search_id"]
    options = client.get(f"/api/search/{sid}/filters")
    assert options.status_code == 200
    assert options.json()["scope"] == "returned_results"
    court = result["hits"][0]["case"]["court"]
    filtered = client.post("/api/search/filter", json={"search_id": sid, "filters": {"courts": [court]}})
    assert filtered.status_code == 200
    assert all(hit["case"]["court"] == court for hit in filtered.json()["hits"])
    invalid = client.post("/api/search/filter", json={
        "search_id": sid, "filters": {"date_from": "2026-01-01", "date_to": "2025-01-01"},
    })
    assert invalid.status_code == 422
    missing = client.post("/api/search/filter", json={"search_id": "unknown"})
    assert missing.status_code == 404
