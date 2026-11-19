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
