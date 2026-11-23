"""本地导入、分析引用及地区筛选；只使用虚构数据，不依赖私人文书。"""

from copy import deepcopy

from app.pipeline.answer import build_answer
from app.pipeline.cite import verify_section
from app.schemas import CaseSection, Filters, Hit, ParsedQuery
from app.sources.local_import import clean_case
from app.sources.mock import passes_filters


def example():
    return {
        "id": "fictional-local", "title": "虚构金融借款样例", "source_type": "demo",
        "case_number": "虚构案号", "court": "文书内容\n\n示例人民法院",
        "region": "安徽省示例市示例县", "court_level": "基层人民法院", "judge_date": "2025-01-01",
        "paragraphs": [
            {"id": "p1", "text": "本院认为，合同没有明确复利计收方式，复利请求不予支持。"},
            {"id": "p2", "text": "判决如下："},
            {"id": "p3", "text": "一、偿还借款本金。"},
            {"id": "p4", "text": "审判员 某某", "section": "本院认为"},
        ],
    }


def annotated_case():
    return clean_case(example(), [{"key": "analysis", "text": "本案因复利约定不明未支持复利。",
                                  "paragraph_ids": ["p1"], "research_points": [{
                                      "topic": "利息罚息与复利", "outcome": "rejected",
                                      "text": "本案因复利约定不明未支持复利。",
                                      "factors": "合同未明确复利计收方式", "paragraph_ids": ["p1"],
                                  }]}])


def test_import_preserves_source_and_cleans_sections():
    raw = example()
    before = deepcopy(raw)
    case = clean_case(raw, [])
    assert raw == before
    assert [(p.id, p.text) for p in case.paragraphs] == [
        (p["id"], p["text"]) for p in raw["paragraphs"]
    ]
    assert case.court == "示例人民法院"
    assert [p.section for p in case.paragraphs] == ["本院认为", "裁判结果", "裁判结果", "落款"]
    assert passes_filters(case, Filters(regions=["安徽"], court_levels=["基层法院"]))
    assert passes_filters(case, Filters(region="安徽省", years=[2025]))
    assert not passes_filters(case, Filters(regions=["北京"]))
    assert not passes_filters(case, Filters(years=[2024]))


def test_analysis_requires_own_case_and_existing_quote():
    case = annotated_case()
    section = case.content_sections[0]
    assert section.origin == "ai" and section.citations[0].verified
    bad = section.model_copy(deep=True)
    bad.citations[0].case_id = "other-case"
    assert verify_section(bad, case) is None
    bad = section.model_copy(deep=True)
    bad.citations[0].quote = "原文没有的结论"
    assert verify_section(bad, case) is None
    assert verify_section(CaseSection(key="analysis", origin="ai", text="没有依据"), case) is None


def test_answer_only_uses_returned_cases_and_verified_analysis():
    case = annotated_case()
    query = ParsedQuery(raw_text="复利如何处理", case_type="financial-loan", keywords=["复利"])
    hit = Hit(case=case, rank=1, score=1)
    answer = build_answer("s1", query, [hit], [case])
    assert answer.status == "ready"
    assert answer.judicial_points and answer.judicial_points[0].title
    assert "合同未明确复利计收方式" in answer.judicial_points[0].text
    assert answer.comparison_table is None
    assert "复利约定不明" in answer.judicial_view.text
    assert all(c.verified and c.case_id == case.id for c in answer.judicial_view.citations)
    assert build_answer("s1", query, [], [case]).status == "pending"
    assert build_answer("s1", query, [hit]).status == "pending"
    query.keywords = ["完全无关词"]
    assert build_answer("s1", query, [hit], [case]).status == "pending"


def test_mock_drops_tampered_analysis(tmp_path):
    import json

    from app.sources.mock import MockSource

    case = annotated_case()
    case.content_sections[0].citations[0].quote = "篡改后的引用"
    file = tmp_path / "fictional.json"
    file.write_text(json.dumps([case.model_dump()]))
    source = MockSource(file)
    assert all(s.origin != "ai" for s in source.get(case.id).content_sections)


def test_comparison_uses_same_topic_and_both_sources():
    left = annotated_case()
    raw = example()
    raw.update(id="fictional-second", case_number="另一虚构案号")
    raw["paragraphs"][0]["text"] = "本院认为，合同明确约定复利方式且计算明细完整，支持复利。"
    right = clean_case(raw, [{
        "key": "analysis", "text": "本案支持复利", "paragraph_ids": ["p1"],
        "research_points": [{"topic": "利息罚息与复利", "outcome": "supported",
                             "text": "法院支持复利请求。", "factors": "计息约定明确且计算明细完整",
                             "paragraph_ids": ["p1"]}],
    }])
    query = ParsedQuery(raw_text="复利如何处理", case_type="financial-loan", keywords=["复利"])
    hits = [Hit(case=c, rank=i, score=1) for i, c in enumerate([left, right], 1)]
    answer = build_answer("s2", query, hits, [left, right])
    assert "未支持复利" in answer.conclusion.text and "支持复利请求" in answer.conclusion.text
    assert "当前命中" not in answer.conclusion.text
    comparison = answer.case_comparison[0]
    assert "合同未明确" in comparison.text and "计息约定明确" in comparison.text
    assert {c.case_id for c in comparison.citations} == {left.id, right.id}
    assert all(c.verified for c in comparison.citations)
    table = answer.comparison_table
    assert {c.id for c in table.cases} == {left.id, right.id}
    assert [r.label for r in table.rows] == ["争议请求", "关键事实", "合同与证据", "裁判处理", "参考边界"]
    for row in table.rows:
        assert len(row.cells) == len(table.cases)
        for case, cell in zip(table.cases, row.cells, strict=True):
            if cell is not None:
                assert all(c.verified and c.case_id == case.id for c in cell.citations)
    # 未结构化的合同与证据信息保持缺失，不能从裁判结论反推补造。
    assert next(row for row in table.rows if row.key == "evidence").cells == [None, None]
    right.research_points[0].topic = "保证责任"
    right.research_points[0].text = "法院支持保证责任。"
    right.research_points[0].factors = "保证期间未经过"
    assert "尚不能形成多案比较" in build_answer("s2", query, hits, [left, right]).case_comparison[0].text


def test_comparison_does_not_promote_low_relevance_to_force_different_outcome():
    from app.schemas import ResearchPoint

    cases = []
    for i in range(4):
        case = annotated_case()
        case.id = f"fictional-{i}"
        quote = case.paragraphs[0].text
        case.research_points = [ResearchPoint(
            topic="利息罚息与复利", outcome="rejected" if i < 3 else "supported",
            text="复利请求不获支持，需核对复利约定" if i < 3 else "支持利息请求",
            factors="复利约定不明" if i < 3 else "有借款合同",
            origin="ai", citations=[{"case_id": case.id, "paragraph_id": "p1", "quote": quote}],
        )]
        cases.append(case)
    hits = [Hit(case=c, rank=i, score=1) for i, c in enumerate(cases, 1)]
    q = ParsedQuery(raw_text="复利请求如何处理", case_type="financial-loan", keywords=["复利"])
    table = build_answer("s4", q, hits, cases).comparison_table
    assert [c.id for c in table.cases] == [c.id for c in cases[:3]]


def test_research_point_rejects_cross_case_reference():
    case = annotated_case()
    case.research_points[0].citations[0].case_id = "other-case"
    query = ParsedQuery(raw_text="复利如何处理", case_type="financial-loan", keywords=["复利"])
    assert build_answer("s3", query, [Hit(case=case, rank=1, score=1)], [case]).status == "pending"
