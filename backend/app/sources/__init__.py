from app.config import Settings
from app.sources.base import CaseSource
from app.sources.cached import RecordingSource, ReplaySource
from app.store import Store


def build_source(s: Settings, store: Store) -> CaseSource:
    if s.case_source == "mock":
        from app.sources.mock import MockSource

        return MockSource(s.fixtures_path)
    if s.case_source == "replay":
        return ReplaySource(store)
    if s.case_source == "es":
        from app.sources.es import EsSource

        src = EsSource(s)
        return RecordingSource(src, store) if s.record_responses else src
    raise ValueError(f"未知的 CASE_SOURCE: {s.case_source}")
