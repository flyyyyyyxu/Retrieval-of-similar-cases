import pytest
from pydantic import ValidationError

from app.config import Settings
from app.pipeline import run_search
from app.schemas import Filters, ParsedQuery
from app.sources.mock import MockSource


def test_search_scope_is_applied_before_recall_even_when_query_is_broadened():
    settings = Settings(_env_file=None, case_source="mock", anthropic_api_key="", rerank_url="")
    source = MockSource(settings.fixtures_path)
    query = ParsedQuery(raw_text="转账与赠与", case_type="private-lending", keywords=["转账", "不存在的检索词"],
                        filters=Filters(region="上海", court_level="基层法院", year_from=2025, year_to=2025))
    hits, degraded, _ = run_search(query, source, settings, 10)
    assert "query_broadened" in degraded
    assert [hit.case.id for hit in hits] == ["loan-1"]


@pytest.mark.parametrize("scope", [
    {"year_from": 2026, "year_to": 2025}, {"year_from": 1800}, {"year_to": 2101},
])
def test_invalid_search_year_ranges_are_rejected(scope):
    with pytest.raises(ValidationError):
        Filters.model_validate(scope)


def test_multi_scope_uses_or_within_and_across_dimensions():
    settings = Settings(_env_file=None, case_source="mock", anthropic_api_key="", rerank_url="")
    source = MockSource(settings.fixtures_path)
    query = ParsedQuery(raw_text="转账借贷", case_type="private-lending", keywords=["转账"],
                        filters=Filters(regions=["上海", "北京"], years=[2024, 2025],
                                        court_levels=["基层法院", "中级法院"]))
    hits, _, _ = run_search(query, source, settings, 10)
    assert {hit.case.id for hit in hits} == {"loan-1", "loan-2"}
    query.filters.regions = ["湖南"]
    assert run_search(query, source, settings, 10)[0] == []


@pytest.mark.parametrize("years", [[1899], [2101]])
def test_multi_year_values_are_validated(years):
    with pytest.raises(ValidationError):
        Filters(years=years)


def test_es_multi_filters_preserve_or_semantics(monkeypatch):
    from app.sources.es import FIELD_MAP, EsSource
    monkeypatch.setitem(FIELD_MAP, "region", "region_test")
    monkeypatch.setitem(FIELD_MAP, "court_level", "level_test")
    monkeypatch.setitem(FIELD_MAP, "judge_date", "date_test")
    clauses = EsSource.__new__(EsSource)._filters(Filters(
        regions=["上海", "北京"], court_levels=["基层法院", "中级法院"], years=[2023, 2025]))
    assert clauses[0] == {"terms": {"region_test": ["上海", "北京"]}}
    assert clauses[1] == {"terms": {"level_test": ["基层法院", "中级法院"]}}
    assert clauses[2]["bool"]["minimum_should_match"] == 1
    assert len(clauses[2]["bool"]["should"]) == 2
