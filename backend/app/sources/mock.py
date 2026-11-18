"""本地演示数据源：读取 backend/fixtures/*.json，不需要内网。

fixture 只能放虚构或已脱敏的数据。"""

import json
from pathlib import Path

from app.schemas import CaseDetail, Filters, Hit
from app.sources.base import MatchMode


def passes_filters(case: CaseDetail, f: Filters) -> bool:
    year = int(case.judge_date[:4]) if case.judge_date else None
    if f.region and case.region != f.region:
        return False
    if f.court_level and case.court_level != f.court_level:
        return False
    if f.year_from and (year is None or year < f.year_from):
        return False
    return not (f.year_to and (year is None or year > f.year_to))


class MockSource:
    mode = "mock"

    def __init__(self, fixtures_path: Path):
        raw = json.loads(fixtures_path.read_text(encoding="utf-8"))
        self.cases = {c["id"]: CaseDetail.model_validate(c) for c in raw}

    def search(
        self, keywords: list[str], filters: Filters, *, match: MatchMode, size: int
    ) -> list[Hit]:
        if not keywords:
            return []
        hits: list[Hit] = []
        for case in self.cases.values():
            if not passes_filters(case, filters):
                continue
            body = case.title + (case.cause or "") + "".join(p.text for p in case.paragraphs)
            matched = [k for k in keywords if k in body]
            if not matched or (match == "all" and len(matched) < len(keywords)):
                continue
            snippets = [p for p in case.paragraphs if any(k in p.text for k in matched)][:2]
            hits.append(
                Hit(
                    case=case,  # CaseDetail 是 CaseSummary 的子类，序列化时按 Hit.case 字段裁剪
                    rank=0,
                    score=len(matched) / len(keywords),
                    matched_keywords=matched,
                    snippets=snippets,
                )
            )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:size]

    def get(self, case_id: str) -> CaseDetail | None:
        return self.cases.get(case_id)
