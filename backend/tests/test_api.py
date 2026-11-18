"""用 mock 数据源跑通完整链路；不需要内网和模型。"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CASE_SOURCE", "mock")
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_MODEL", "")
    monkeypatch.setenv("RERANK_URL", "")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    from app import api
    from app.config import get_settings

    for fn in (get_settings, api.store, api.source, api.case_type, api.llm):
        fn.cache_clear()
    from app.main import app

    return TestClient(app)


TEXT = "只有银行转账记录，没有借条，对方主张款项属于赠与，如何审查借贷关系是否成立？"


def test_health(client):
    r = client.get("/api/health").json()
    assert r["data_mode"] == "mock" and r["llm_configured"] is False


def test_full_flow(client):
    parsed = client.post("/api/query/parse", json={"text": TEXT}).json()
    assert "llm_unavailable" in parsed["degraded"]
    assert {"借条", "转账", "赠与"} <= set(parsed["query"]["keywords"])

    res = client.post("/api/search", json={"query": parsed["query"], "size": 5}).json()
    assert res["hits"], "mock 数据应能命中借贷案例"
    assert res["hits"][0]["case"]["id"].startswith("loan-")
    assert "paragraphs" not in res["hits"][0]["case"], "列表不应携带全文"
    assert [h["rank"] for h in res["hits"]] == list(range(1, len(res["hits"]) + 1))

    case_id = res["hits"][0]["case"]["id"]
    detail = client.get(f"/api/cases/{case_id}").json()
    assert detail["paragraphs"][0]["id"] == "p1"

    expl = client.post(f"/api/cases/{case_id}/explain", json={"query": parsed["query"]}).json()
    assert all(c["verified"] for p in expl["similarities"] for c in p["citations"])

    r = client.post("/api/feedback", json={"search_id": res["search_id"], "case_id": case_id,
                                           "relevant": True})
    assert r.status_code == 204


def test_filters_are_never_relaxed(client):
    q = client.post("/api/query/parse", json={"text": TEXT}).json()["query"]
    q["filters"] = {"region": "上海"}
    res = client.post("/api/search", json={"query": q}).json()
    assert res["hits"] and all(h["case"]["region"] == "上海" for h in res["hits"])


def test_missing_case_404(client):
    assert client.get("/api/cases/nope").status_code == 404


def test_frontend_served(client):
    assert "清案" in client.get("/").text
