"""第 2 步：召回。严格查询（全部关键词）结果不足时，补一路宽松查询（任一关键词），去重合并。

用户明确指定的筛选条件在两路查询里都保留，不会被放宽。"""

from app.schemas import Degradation, Hit, ParsedQuery
from app.sources.base import CaseSource

MIN_STRICT = 20  # 严格查询少于这个数就补宽松查询；按真实数据调整


def recall(q: ParsedQuery, source: CaseSource, size: int = 100) -> tuple[list[Hit], list[Degradation]]:
    degraded: list[Degradation] = []
    hits = source.search(q.keywords, q.filters, match="all", size=size)
    if len(hits) < MIN_STRICT and len(q.keywords) > 1:
        hits += source.search(q.keywords, q.filters, match="any", size=size)
        degraded.append("query_broadened")
    return dedupe(hits), degraded


def dedupe(hits: list[Hit]) -> list[Hit]:
    """同一文书只保留分数最高的一条。TODO：识别同案一审/二审的关联文书。"""
    best: dict[str, Hit] = {}
    for h in hits:
        if h.case.id not in best or h.score > best[h.case.id].score:
            best[h.case.id] = h
    return list(best.values())
