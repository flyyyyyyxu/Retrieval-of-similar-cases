from app.pipeline.cite import verify
from app.schemas import CaseDetail, Citation, Explanation, Paragraph, Point

CASE = CaseDetail(
    id="c1", title="测试案", source_type="demo",
    paragraphs=[Paragraph(id="p1", section="本院认为", text="款项交付与借贷合意，应结合全案证据分别审查。")],
)


def cite(pid, quote):
    return Citation(case_id="c1", paragraph_id=pid, quote=quote)


def test_quote_found_ignoring_punctuation():
    e = Explanation(case_id="c1", similarities=[
        Point(text="需分别审查", origin="ai", citations=[cite("p1", "款项交付与借贷合意 应结合全案证据")])])
    out = verify(e, CASE)
    assert out.similarities[0].citations[0].verified
    assert out.degraded == []


def test_fabricated_quote_drops_ai_point():
    e = Explanation(case_id="c1", differences=[
        Point(text="编造", origin="ai", citations=[cite("p1", "原文里没有这句话")])])
    out = verify(e, CASE)
    assert out.differences == []
    assert "citation_dropped" in out.degraded


def test_unknown_paragraph_rejected():
    e = Explanation(case_id="c1", similarities=[
        Point(text="x", origin="ai", citations=[cite("p99", "款项交付")])])
    assert verify(e, CASE).similarities == []
