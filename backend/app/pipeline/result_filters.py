"""十二维结果筛选接入层。当前筛选已召回快照，未来可替换成底库查询适配。"""

from app.schemas import Hit, ResultFilterOptions, ResultFilters


def reference_level(hit: Hit) -> str:
    return "judgment" if hit.case.source_type == "demo" else hit.case.source_type


def filter_hits(hits: list[Hit], filters: ResultFilters) -> list[Hit]:
    def in_range(value, lower, upper):
        if lower is None and upper is None:
            return True
        return value is not None and (lower is None or value >= lower) and (upper is None or value <= upper)

    def passes(hit: Hit):
        c = hit.case
        for selected, value in ((filters.court_levels, c.court_level),
                                (filters.reference_levels, reference_level(hit)),
                                (filters.courts, c.court), (filters.causes, c.cause),
                                (filters.procedures, c.procedure), (filters.doc_types, c.doc_type),
                                (filters.disclosure_levels, c.disclosure_level)):
            if selected and value not in selected:
                return False
        date_string = c.judge_date[:10] if c.judge_date else None
        if not in_range(date_string, filters.date_from.isoformat() if filters.date_from else None,
                        filters.date_to.isoformat() if filters.date_to else None):
            return False
        for value, lower, upper in ((c.word_count, filters.word_count_min, filters.word_count_max),
                                    (c.claim_amount, filters.claim_amount_min, filters.claim_amount_max),
                                    (c.case_fee, filters.case_fee_min, filters.case_fee_max)):
            if not in_range(value, lower, upper):
                return False
        return filters.has_hearing_video is None or c.has_hearing_video is filters.has_hearing_video

    # Stable grouping: explicit official typical records first, preserving retrieval order within groups.
    return sorted((h for h in hits if passes(h)), key=lambda h: h.case.source_type != "typical")


def filter_options(search_id: str, hits: list[Hit]) -> ResultFilterOptions:
    def values(field):
        return sorted({getattr(h.case, field) for h in hits if getattr(h.case, field)})

    return ResultFilterOptions(
        search_id=search_id, court_levels=values("court_level"),
        reference_levels=sorted({reference_level(h) for h in hits}),
        courts=values("court"), causes=values("cause"), procedures=values("procedure"),
        doc_types=values("doc_type"), disclosure_levels=values("disclosure_level"),
    )
