"""从本次命中文书的已核验观点生成总结、裁判观点和同争点案例比较。"""

from collections import defaultdict

from app.pipeline.cite import verify_research_point
from app.schemas import (
    CaseDetail,
    CaseSummary,
    ComparisonRow,
    ComparisonTable,
    Hit,
    JudicialPoint,
    ParsedQuery,
    Point,
    ResearchPoint,
    SearchAnswer,
)


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
    search_order = {h.case.id: (h.score, h.rank or i) for i, h in enumerate(hits, 1)}
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
    ranked = sorted(groups[topic], key=lambda row: (
        -row[0], -search_order[row[1].id][0], search_order[row[1].id][1],
    ))
    selected, seen_cases = [], set()
    # 先按当前争点相关性，再按检索分与顺序选取；不为凑不同结果拉入低相关案例。
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
    judicial_points = [JudicialPoint(
        title=point.principle_title or f"{topic}的具体认定",
        text=f"{point.text}该案中，{point.factors.rstrip('。')}。",
        origin="ai", citations=point.citations,
    ) for _, _, point in selected]
    table = None
    if len(selected) > 1:
        dimensions = [
            ("request", "争议请求", "request"),
            ("facts", "关键事实", "factors"),
            ("evidence", "合同与证据", "contract_evidence"),
            ("holding", "裁判处理", "text"),
            ("boundary", "参考边界", "boundary"),
        ]
        table = ComparisonTable(
            topic=topic,
            cases=[CaseSummary.model_validate(case.model_dump()) for _, case, _ in selected],
            rows=[ComparisonRow(key=key, label=label, cells=[
                Point(text=value, origin="ai", citations=point.citations)
                if (value := getattr(point, field)) and value.strip() else None
                for _, _, point in selected
            ]) for key, label, field in dimensions],
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
                        judicial_view=view, case_comparison=comparisons,
                        judicial_points=judicial_points, comparison_table=table)
