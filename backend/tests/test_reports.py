from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CASE_SOURCE", "mock")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("RERANK_URL", "")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "reports.db"))
    from app import api
    from app.config import get_settings
    for factory in (get_settings, api.store, api.source, api.case_type, api.llm, api.optimization_llm):
        factory.cache_clear()
    from app.main import app
    return TestClient(app)


def search(client):
    query = client.post("/api/query/parse", json={"text": "只有转账记录没有借条，如何认定借贷关系"}).json()["query"]
    return client.post("/api/search", json={"query": query}).json()


def test_report_uses_selected_source_text_and_downloads_latest_edits(client):
    result = search(client)
    ids = [h["case"]["id"] for h in result["hits"][:2]]
    created = client.post("/api/reports", json={"search_id": result["search_id"], "case_ids": ids + ids})
    assert created.status_code == 200, created.text
    report = created.json()
    assert report["case_ids"] == ids
    text = "".join(o["insert"] for o in report["ops"] if isinstance(o["insert"], str))
    assert "清案虚构演示样例库" in text
    assert "本报告纳入2篇案例" in text
    assert "段落p5" in text
    for case_id in ids:
        case = client.get(f"/api/cases/{case_id}").json()
        assert next(p["text"] for p in case["paragraphs"] if p["id"] == "p5") in text
    tiers = next(o["insert"]["reportPyramid"] for o in report["ops"] if isinstance(o["insert"], dict))
    assert sum(t["count"] for t in tiers) == 2
    assert len(client.get("/api/reports").json()) == 1
    body = {"title": "修改后的报告", "revision": report["revision"],
            "ops": [{"insert": "人工修改 <script> & 中文", "attributes": {"bold": True}},
                    {"insert": "\n"}]}
    saved = client.put(f"/api/reports/{report['id']}", json=body)
    assert saved.status_code == 200
    assert saved.json()["revision"] == 2
    assert client.put(f"/api/reports/{report['id']}", json=body).status_code == 409
    word = client.get(f"/api/reports/{report['id']}/download?format=docx")
    assert word.status_code == 200
    with ZipFile(BytesIO(word.content)) as z:
        xml = z.read("word/document.xml").decode()
        assert "人工修改 &lt;script&gt; &amp; 中文" in xml
        assert "本报告纳入2篇案例" not in xml
    pdf = client.get(f"/api/reports/{report['id']}/download?format=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert "filename*=UTF-8''" in pdf.headers["content-disposition"]


def test_report_rejects_cases_outside_search_and_unreadable_documents(client, monkeypatch):
    result = search(client)
    assert client.post("/api/reports", json={"search_id": result["search_id"], "case_ids": ["unknown"]}).status_code == 422
    from app import api
    monkeypatch.setattr(api, "source", lambda: SimpleNamespace(get=lambda _: None))
    assert client.post("/api/reports", json={"search_id": result["search_id"], "case_ids": [result["hits"][0]["case"]["id"]]}).status_code == 409
    assert client.get("/api/reports").json() == []


@pytest.mark.parametrize("ops", [
    [{"insert": {"image": "https://example.com/track"}}, {"insert": "\n"}],
    [{"insert": "test", "attributes": {"onclick": "alert(1)"}}, {"insert": "\n"}],
    [{"insert": "unfinished"}],
])
def test_report_rejects_html_attributes_and_unsupported_embeds(client, ops):
    result = search(client)
    report = client.post("/api/reports", json={"search_id": result["search_id"], "case_ids": [result["hits"][0]["case"]["id"]]}).json()
    assert client.put(f"/api/reports/{report['id']}", json={"title": "标题", "revision": 1, "ops": ops}).status_code == 422
