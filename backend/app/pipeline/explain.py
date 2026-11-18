"""第 4 步：对单篇案例生成相似点、差异点，每条都附原文引用，并经过 cite.verify 校验。

前端按需调用（点开某篇时再请求），不阻塞结果列表。"""

import json
import logging

from pydantic import BaseModel, Field

from app.llm import LLM, LLMError
from app.pipeline.cite import verify
from app.schemas import CaseDetail, Citation, Explanation, ParsedQuery, Point

log = logging.getLogger(__name__)

FOCUS_SECTIONS = ("案件事实", "本院认为", "经审理查明", "本院查明")


class CitationOutput(BaseModel):
    paragraph_id: str = Field(description="给定段落的 id")
    quote: str = Field(description="从该段落原文逐字复制的一句话")


class PointOutput(BaseModel):
    text: str = Field(description="一句话结论，不超过 60 字")
    citations: list[CitationOutput] = Field(description="至少一条原文引用")


class ExplainOutput(BaseModel):
    similarities: list[PointOutput] = Field(description="相似点，最多 3 条")
    differences: list[PointOutput] = Field(description="可能影响结论的差异点，最多 3 条")


def explain(q: ParsedQuery, case: CaseDetail, llm: LLM, prompt: str) -> Explanation:
    if llm.configured:
        try:
            return verify(_explain_with_llm(q, case, llm, prompt), case)
        except LLMError as e:
            log.warning("类案解释降级为原文摘录：%s", e)
    return _explain_fallback(q, case)


def _explain_with_llm(q: ParsedQuery, case: CaseDetail, llm: LLM, prompt: str) -> Explanation:
    paragraphs = [p for p in case.paragraphs if p.section in FOCUS_SECTIONS] or case.paragraphs
    user = json.dumps(
        {
            "检索条件": q.model_dump(include={"issues", "facts", "keywords"}),
            "文书段落": [{"id": p.id, "部分": p.section, "原文": p.text} for p in paragraphs],
        },
        ensure_ascii=False,
    )
    out = llm.structured(prompt, user, ExplainOutput, effort=llm.s.llm_effort_explain)

    def points(items: list[PointOutput]) -> list[Point]:
        return [
            Point(
                text=it.text,
                origin="ai",
                citations=[
                    Citation(case_id=case.id, paragraph_id=c.paragraph_id, quote=c.quote)
                    for c in it.citations
                ],
            )
            for it in items
        ]

    return Explanation(
        case_id=case.id,
        similarities=points(out.similarities),
        differences=points(out.differences),
    )


def _explain_fallback(q: ParsedQuery, case: CaseDetail) -> Explanation:
    """降级：只摘出命中关键词的原文段落，不做任何归纳。"""
    pts = []
    for p in case.paragraphs:
        if p.section in FOCUS_SECTIONS and any(k in p.text for k in q.keywords):
            pts.append(
                Point(
                    text=p.text,
                    origin="original",
                    citations=[Citation(case_id=case.id, paragraph_id=p.id, quote=p.text,
                                        verified=True)],
                )
            )
    return Explanation(case_id=case.id, similarities=pts[:3],
                       degraded=["llm_unavailable", "explain_fallback"])
