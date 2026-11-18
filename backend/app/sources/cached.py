"""录制 / 回放包装：
- record：调用真实数据源，同时把响应写进本地 SQLite；
- replay：只读缓存，不连内网。用于离线开发和演示兜底。

缓存里是真实文书，var/ 目录已在 .gitignore 中，不要提交。"""

import hashlib
import json

from app.schemas import CaseDetail, Filters, Hit
from app.sources.base import CaseSource, MatchMode
from app.store import Store


def _key(*parts) -> str:
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


class RecordingSource:
    def __init__(self, inner: CaseSource, store: Store):
        self.inner, self.store, self.mode = inner, store, inner.mode

    def search(self, keywords, filters: Filters, *, match: MatchMode, size: int) -> list[Hit]:
        hits = self.inner.search(keywords, filters, match=match, size=size)
        key = _key("search", keywords, filters.model_dump(), match, size)
        self.store.cache_put(key, [h.model_dump(mode="json") for h in hits])
        return hits

    def get(self, case_id: str) -> CaseDetail | None:
        case = self.inner.get(case_id)
        if case:
            self.store.cache_put(_key("get", case_id), case.model_dump(mode="json"))
        return case


class ReplaySource:
    mode = "replay"

    def __init__(self, store: Store):
        self.store = store

    def search(self, keywords, filters: Filters, *, match: MatchMode, size: int) -> list[Hit]:
        cached = self.store.cache_get(_key("search", keywords, filters.model_dump(), match, size))
        return [Hit.model_validate(h) for h in cached or []]

    def get(self, case_id: str) -> CaseDetail | None:
        cached = self.store.cache_get(_key("get", case_id))
        return CaseDetail.model_validate(cached) if cached else None
