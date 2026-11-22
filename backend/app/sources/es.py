"""内网 Elasticsearch 数据源 —— 草稿，尚未连真实服务验证。

接入前先完成 docs/data-audit.md，然后：
1. 按实际 mapping 填写 FIELD_MAP（左边是统一字段，右边是 ES 字段名）；
2. 确认 ES 版本、分词器、正文字段是否完整、段落怎么切；
3. 用真实查询跑通后删除本段“草稿”说明。

用 httpx 直接调 REST API，避免 ES 客户端版本与服务端不匹配。
"""

import re

import httpx

from app.config import Settings
from app.schemas import CaseDetail, Filters, Hit, Paragraph
from app.sources.base import MatchMode

# TODO(郑元龙)：按 data-audit 结果填写；值为 None 表示底库没有该字段
FIELD_MAP: dict[str, str | None] = {
    "title": None,
    "case_number": None,
    "court": None,
    "court_level": None,
    "region": None,
    "judge_date": None,
    "cause": None,
    "doc_type": None,
    "source_url": None,
    "full_text": None,  # 全文字段
}
SEARCH_FIELDS: list[str] = []  # 参与关键词检索的字段，如 事实、说理


class EsSource:
    mode = "es"

    def __init__(self, s: Settings):
        if not s.es_url or not s.es_index:
            raise RuntimeError("CASE_SOURCE=es 需要配置 ES_URL 和 ES_INDEX")
        if not FIELD_MAP["full_text"] or not SEARCH_FIELDS:
            raise RuntimeError("请先在 app/sources/es.py 填写 FIELD_MAP 和 SEARCH_FIELDS")
        auth = (s.es_username, s.es_password) if s.es_username else None
        self.client = httpx.Client(base_url=s.es_url, auth=auth, timeout=15)
        self.index = s.es_index

    # ---- 查询 ----

    def search(
        self, keywords: list[str], filters: Filters, *, match: MatchMode, size: int
    ) -> list[Hit]:
        if not keywords:
            return []
        must = [
            {"multi_match": {"query": k, "fields": SEARCH_FIELDS, "type": "phrase"}}
            for k in keywords
        ]
        body = {
            "size": size,
            "query": {
                "bool": {
                    "must" if match == "all" else "should": must,
                    **({"minimum_should_match": 1} if match == "any" else {}),
                    "filter": self._filters(filters),
                }
            },
            "highlight": {"fields": {f: {} for f in SEARCH_FIELDS}},
        }
        r = self.client.post(f"/{self.index}/_search", json=body)
        r.raise_for_status()
        hits = []
        for h in r.json()["hits"]["hits"]:
            case = self._to_case(h["_id"], h["_source"])
            matched = [k for k in keywords if any(k in p.text for p in case.paragraphs)]
            snippets = [p for p in case.paragraphs if any(k in p.text for k in matched)][:2]
            hits.append(
                Hit(case=case, rank=0, score=h["_score"] or 0, matched_keywords=matched,
                    snippets=snippets)
            )
        return hits

    def get(self, case_id: str) -> CaseDetail | None:
        r = self.client.get(f"/{self.index}/_doc/{case_id}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return self._to_case(case_id, r.json()["_source"])

    # ---- 字段映射 ----

    def _filters(self, f: Filters) -> list[dict]:
        out: list[dict] = []
        if f.regions and FIELD_MAP["region"]:
            out.append({"terms": {FIELD_MAP["region"]: f.regions}})
        elif f.region and FIELD_MAP["region"]:
            out.append({"term": {FIELD_MAP["region"]: f.region}})
        if f.court_levels and FIELD_MAP["court_level"]:
            out.append({"terms": {FIELD_MAP["court_level"]: f.court_levels}})
        elif f.court_level and FIELD_MAP["court_level"]:
            out.append({"term": {FIELD_MAP["court_level"]: f.court_level}})
        if f.years and FIELD_MAP["judge_date"]:
            out.append({"bool": {"should": [
                {"range": {FIELD_MAP["judge_date"]: {
                    "gte": f"{year}-01-01", "lte": f"{year}-12-31"}}}
                for year in sorted(set(f.years))
            ], "minimum_should_match": 1}})
        elif (f.year_from or f.year_to) and FIELD_MAP["judge_date"]:
            rng = {}
            if f.year_from:
                rng["gte"] = f"{f.year_from}-01-01"
            if f.year_to:
                rng["lte"] = f"{f.year_to}-12-31"
            out.append({"range": {FIELD_MAP["judge_date"]: rng}})
        return out

    def _to_case(self, doc_id: str, src: dict) -> CaseDetail:
        def pick(name: str):
            field = FIELD_MAP.get(name)
            return src.get(field) if field else None

        missing = [k for k in FIELD_MAP if k != "full_text" and not pick(k)]
        text = pick("full_text") or ""
        return CaseDetail(
            id=doc_id,
            title=pick("title") or pick("case_number") or doc_id,
            case_number=pick("case_number"),
            court=pick("court"),
            court_level=pick("court_level"),
            region=pick("region"),
            judge_date=pick("judge_date"),
            cause=pick("cause"),
            doc_type=pick("doc_type"),
            source_type="judgment",  # TODO：如底库区分指导性/参考案例，在此映射
            source_url=pick("source_url"),
            missing_fields=missing,
            paragraphs=split_paragraphs(text),
            full_text_available=bool(text),
        )


SECTION_HEADS = ("本院认为", "经审理查明", "本院查明", "判决如下", "裁定如下")


def split_paragraphs(text: str) -> list[Paragraph]:
    """按换行切段，并给每段标上最近出现的部分标题。切分规则需按真实正文调整。"""
    paras, section = [], None
    for i, line in enumerate(x.strip() for x in re.split(r"\n+", text)):
        if not line:
            continue
        for head in SECTION_HEADS:
            if line.startswith(head):
                section = head
        paras.append(Paragraph(id=f"p{i + 1}", section=section, text=line))
    return paras
