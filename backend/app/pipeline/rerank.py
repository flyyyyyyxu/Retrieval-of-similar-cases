"""第 3 步：重排。配置了 RERANK_URL 就调用重排服务，否则沿用召回分数。

现状：暂无可用的重排服务，RERANK_URL 留空，结果按召回分数排序，并标记 rerank_skipped。
TODO(郑元龙)：确认服务（BGE / Qwen reranker 二选一）后填 .env 的 RERANK_URL / RERANK_MODEL /
RERANK_API_KEY。_call_service 按常见 /rerank 接口写的，实际格式不同就改这个函数。"""

import httpx

from app.config import Settings
from app.schemas import Degradation, Hit, ParsedQuery


def rerank(
    q: ParsedQuery, hits: list[Hit], s: Settings, top_k: int
) -> tuple[list[Hit], list[Degradation]]:
    degraded: list[Degradation] = []
    if s.rerank_url and hits:
        try:
            scores = _call_service(s, _query_text(q), [_passage(h) for h in hits])
            for h, sc in zip(hits, scores, strict=True):
                h.score = sc
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            degraded.append("rerank_skipped")
    else:
        degraded.append("rerank_skipped")

    ranked = sorted(hits, key=lambda h: (h.case.source_type != "typical", -h.score))[:top_k]
    for i, h in enumerate(ranked, 1):
        h.rank = i
    return ranked, degraded


def _query_text(q: ParsedQuery) -> str:
    return "；".join(q.issues + q.facts) or q.raw_text


def _passage(h: Hit) -> str:
    """送入重排的文本：优先用命中段落，而不是固定截取前 N 字。"""
    return "\n".join(p.text for p in h.snippets) or h.case.title


def _call_service(s: Settings, query: str, documents: list[str]) -> list[float]:
    """常见 /rerank 接口：{model, query, documents} → {results: [{index, relevance_score}]}"""
    headers = {"Authorization": f"Bearer {s.rerank_api_key}"} if s.rerank_api_key else {}
    r = httpx.post(
        s.rerank_url,
        json={"model": s.rerank_model, "query": query, "documents": documents},
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    scores = [0.0] * len(documents)
    for item in r.json()["results"]:
        scores[item["index"]] = float(item["relevance_score"])
    return scores
