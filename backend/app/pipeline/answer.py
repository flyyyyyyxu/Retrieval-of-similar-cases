"""从本次命中文书的已核验观点生成总结、裁判观点和同争点案例比较。"""

from collections import defaultdict

from app.pipeline.cite import verify_research_point
from app.schemas import CaseDetail, Hit, ParsedQuery, Point, ResearchPoint, SearchAnswer


def _references(points: list[ResearchPoint]):
    unique = {}
    for point in points:
        for citation in point.citations:
            unique[(citation.case_id, citation.paragraph_id, citation.quote)] = citation
    return list(unique.values())


def build_answer(
    search_id: str, query: ParsedQuery, hits: list[Hit], cases: list[CaseDetail] | None = None,
) -> SearchAnswer:
    allowed = {h.case.id for h in hits}
    keywords = [k for k in query.keywords if k not in {"借款", "合同", "银行", "金融借款"}]
    keywords = keywords or query.keywords
    groups = defaultdict(list)
    for case in cases or []:
        if case.id not in allowed:
            continue
        for point in case.research_points:
            checked = verify_research_point(point, case)
            if checked is None:
                continue
            score = sum(2 * (k in checked.topic) + 3 * (k in checked.text)
                        + (k in checked.factors) for k in keywords)
            if score:
                groups[checked.topic].append((score, case, checked))
    if not groups:
        return SearchAnswer(search_id=search_id, status="pending")
    # 只比较同一争点；不把执行裁定、担保责任等不相关结果混入计息比较。
    topic = max(groups, key=lambda key: max(row[0] for row in groups[key]))
    ranked = sorted(groups[topic], key=lambda row: -row[0])
    selected = [ranked[0]]
    seen_outcomes = {ranked[0][2].outcome}
    seen_cases = {ranked[0][1].id}
    # 在已命中的相关文书中优先保留不同处理结果，避免只展示支持一方的案例。
    for row in ranked[1:]:
        if row[1].id not in seen_cases and row[2].outcome not in seen_outcomes:
            selected.append(row)
            seen_outcomes.add(row[2].outcome)
            seen_cases.add(row[1].id)
        if len(selected) == 3:
            break
    for row in ranked:
        if len(selected) == 3:
            break
        if row[1].id not in seen_cases:
            selected.append(row)
            seen_cases.add(row[1].id)
    points = [row[2] for row in selected]
    refs = _references(points)
    summary = Point(
        text=f"围绕{topic}，本次类案的处理包括："
             + "；".join(p.text.removeprefix("法院").rstrip("。") for p in points) + "。",
        origin="ai", citations=refs,
    )
    view = Point(
        text="\n\n".join(f"{case.case_number or case.title}：{point.text}"
                         for _, case, point in selected),
        origin="ai", citations=refs,
    )
    comparisons = []
    first = selected[0]
    for other in selected[1:]:
        _, left, a = first
        _, right, b = other
        distinction = ("两案的处理结果不同，" if a.outcome != b.outcome else "两案的处理方向相近，")
        comparisons.append(Point(
            text=f"{left.case_number or left.title}与{right.case_number or right.title}相比："
                 f"前案的具体情况是{a.factors}；后案则是{b.factors}。"
                 + distinction + "比较时需分别核对这些事实与约定。",
            origin="ai", citations=_references([a, b]),
        ))
    if not comparisons:
        comparisons.append(Point(
            text=f"当前命中结果中，{topic}只有1件具备可核验观点的文书，尚不能形成多案比较。"
                 f"该案的关键事实是{points[0].factors}。",
            origin="ai", citations=refs,
        ))
    return SearchAnswer(search_id=search_id, status="ready", conclusion=summary,
                        judicial_view=view, case_comparison=comparisons)
