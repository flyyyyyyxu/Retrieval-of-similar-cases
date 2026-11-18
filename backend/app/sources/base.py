"""案例库数据源接口。所有数据源（mock / es / replay）实现同一组方法，
并且只返回 schemas 里的统一字段——底库字段名不允许泄漏到这层之外。"""

from typing import Literal, Protocol

from app.schemas import CaseDetail, DataMode, Filters, Hit

MatchMode = Literal["all", "any"]


class CaseSource(Protocol):
    mode: DataMode

    def search(
        self, keywords: list[str], filters: Filters, *, match: MatchMode, size: int
    ) -> list[Hit]:
        """按关键词召回。match=all 要求全部命中，any 命中任一即可。
        返回的 Hit.rank 可为 0，由 pipeline 统一编号。"""
        ...

    def get(self, case_id: str) -> CaseDetail | None:
        """按 ID 取全文与段落；不存在返回 None。"""
        ...
