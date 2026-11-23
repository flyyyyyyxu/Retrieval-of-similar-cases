"""引用校验：每条引用的原文必须能在对应段落里逐字找到（忽略空白和标点差异）。

这一步只证明“引用存在”；“引用是否支持结论”需要法律成员抽查。"""

import re

from app.schemas import CaseDetail, CaseSection, Explanation, Point, ResearchPoint

_NOISE = re.compile(r"[\s，。；：、“”‘’（）()《》,.;:\"'…—-]")


def normalize(text: str) -> str:
    return _NOISE.sub("", text)


def verify_research_point(point: ResearchPoint, case: CaseDetail) -> ResearchPoint | None:
    section = CaseSection(key="analysis", text=point.text, origin="ai",
                          paragraph_ids=list(dict.fromkeys(c.paragraph_id for c in point.citations)),
                          citations=[c.model_copy(deep=True) for c in point.citations])
    checked = verify_section(section, case)
    if checked is None or not point.factors.strip():
        return None
    return point.model_copy(update={"citations": checked.citations})


def verify_section(section: CaseSection, case: CaseDetail) -> CaseSection | None:
    """预生成摘要必须携带属于当前文书的有效原文引用；失败时整段移除。"""
    if section.origin != "ai":
        return section
    paras = {p.id: p.text for p in case.paragraphs}
    if not section.text or not section.citations or not section.paragraph_ids:
        return None
    for citation in section.citations:
        body = paras.get(citation.paragraph_id, "")
        citation.verified = bool(
            citation.case_id == case.id and normalize(citation.quote)
            and normalize(citation.quote) in normalize(body)
        )
        if not citation.verified:
            return None
    if set(section.paragraph_ids) != {c.paragraph_id for c in section.citations}:
        return None
    return section


def verify(expl: Explanation, case: CaseDetail) -> Explanation:
    paras = {p.id: normalize(p.text) for p in case.paragraphs}
    dropped = False

    def check(points: list[Point]) -> list[Point]:
        nonlocal dropped
        kept = []
        for pt in points:
            good = []
            for c in pt.citations:
                body = paras.get(c.paragraph_id)
                c.verified = bool(c.case_id == case.id and body and normalize(c.quote)
                                  and normalize(c.quote) in body)
                if c.verified:
                    good.append(c)
                else:
                    dropped = True
            pt.citations = good
            # AI 归纳的结论必须有至少一条通过校验的引用，否则不展示
            if pt.origin == "original" or good:
                kept.append(pt)
        return kept

    expl.similarities = check(expl.similarities)
    expl.differences = check(expl.differences)
    if dropped and "citation_dropped" not in expl.degraded:
        expl.degraded.append("citation_dropped")
    return expl
