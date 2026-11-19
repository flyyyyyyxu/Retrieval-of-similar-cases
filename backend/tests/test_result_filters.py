from datetime import date

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.pipeline.rerank import rerank
from app.pipeline.result_filters import filter_hits, filter_options
from app.schemas import CaseDetail, CaseSection, CaseSummary, Hit, ParsedQuery, ResultFilters


def hit(id="typical", source_type="typical", **updates):
    values = {"id": id, "title": "测试案例", "source_type": source_type, "court": "甲法院",
              "court_level": "基层法院", "cause": "测试案由", "procedure": "一审", "judge_date": "2025-05-20",
              "doc_type": "判决书", "word_count": 3000, "claim_amount": 10000, "case_fee": 50,
              "disclosure_level": "全文公开", "has_hearing_video": False}
    values.update(updates)
    return Hit(case=CaseSummary(**values), rank=1, score=0.1)


def test_all_twelve_filter_dimensions():
    filters = ResultFilters(
        court_levels=["基层法院"], reference_levels=["typical"], courts=["甲法院"],
        causes=["测试案由"], procedures=["一审"], date_from=date(2025, 1, 1), date_to=date(2025, 12, 31),
        doc_types=["判决书"], word_count_min=2000, word_count_max=4000,
        claim_amount_min=5000, claim_amount_max=20000, case_fee_min=10, case_fee_max=100,
        disclosure_levels=["全文公开"], has_hearing_video=False,
    )
    assert len(filter_hits([hit()], filters)) == 1
    assert filter_hits([hit(claim_amount=None)], filters) == []
    assert filter_hits([hit(has_hearing_video=None)], filters) == []


@pytest.mark.parametrize("change", [
    {"court_levels": ["高级法院"]}, {"reference_levels": ["guiding"]}, {"courts": ["乙法院"]},
    {"causes": ["另一案由"]}, {"procedures": ["二审"]}, {"date_from": "2026-01-01"},
    {"doc_types": ["裁定书"]}, {"word_count_max": 2000}, {"claim_amount_max": 9999},
    {"case_fee_max": 49}, {"disclosure_levels": ["部分公开"]}, {"has_hearing_video": True},
])
def test_each_dimension_can_exclude(change):
    assert filter_hits([hit()], ResultFilters.model_validate(change)) == []


def test_typical_priority_before_top_k_and_stable_within_group():
    ordinary = hit("ordinary", "judgment")
    ordinary.score = 10
    typical = hit()
    q = ParsedQuery(raw_text="测试问题", case_type="demo")
    ranked, _ = rerank(q, [ordinary, typical], Settings(_env_file=None, rerank_url=""), top_k=1)
    assert ranked[0].case.id == "typical"
    assert ranked[0].rank == 1
    options = filter_options("s1", [ordinary, typical])
    assert options.reference_levels == ["judgment", "typical"]


@pytest.mark.parametrize("payload", [
    {"date_from": "2026-01-01", "date_to": "2025-01-01"},
    {"word_count_min": 500, "word_count_max": 200}, {"claim_amount_min": -1},
    {"case_fee_min": 20, "case_fee_max": 10}, {"unknown_filter": "cannot silently ignore"},
])
def test_invalid_ranges_and_unknown_fields_rejected(payload):
    with pytest.raises(ValidationError):
        ResultFilters.model_validate(payload)


def test_optional_content_sections_preserve_unknown_empty_and_available():
    base = {"id": "c1", "title": "示例", "source_type": "demo", "paragraphs": []}
    assert CaseDetail(**base).content_sections is None
    assert CaseDetail(**base, content_sections=[]).content_sections == []
    case = CaseDetail(**base, content_sections=[CaseSection(key="overview", text="数据源摘要")])
    assert case.content_sections[0].text == "数据源摘要"
