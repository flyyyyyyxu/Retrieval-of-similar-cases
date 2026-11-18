"""引用校验：每条引用的原文必须能在对应段落里逐字找到（忽略空白和标点差异）。

这一步只证明“引用存在”；“引用是否支持结论”需要法律成员抽查。"""

import re

from app.schemas import CaseDetail, Explanation, Point

_NOISE = re.compile(r"[\s，。；：、“”‘’（）()《》,.;:\"'…—-]")


def normalize(text: str) -> str:
    return _NOISE.sub("", text)


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
                c.verified = bool(body and normalize(c.quote) and normalize(c.quote) in body)
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
