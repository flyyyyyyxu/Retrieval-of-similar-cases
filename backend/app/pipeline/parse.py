"""第 1 步：把用户案情解析成可编辑的检索条件（争点、事实、关键词、筛选）。"""

import json
import logging

from pydantic import BaseModel, Field

from app.case_type import CaseType
from app.llm import LLM, LLMError
from app.schemas import Filters, ParsedQuery, ParseResponse

log = logging.getLogger(__name__)


class ParseOutput(BaseModel):
    """模型需要返回的结构（由结构化输出保证格式）。"""

    issues: list[str] = Field(description="核心争点，1–3 个")
    facts: list[str] = Field(description="用户明确给出的关键事实，不推测")
    keywords: list[str] = Field(description="检索词，优先使用检索词表，最多 8 个")
    filters: Filters = Field(description="用户明确提到的地域、年份、法院层级；没提到就留空")


def parse_query(text: str, ct: CaseType, llm: LLM, prompt: str) -> ParseResponse:
    if llm.configured:
        try:
            return ParseResponse(query=_parse_with_llm(text, ct, llm, prompt))
        except LLMError as e:
            log.warning("要素抽取降级为规则方式：%s", e)
    return ParseResponse(query=_parse_with_rules(text, ct), degraded=["llm_unavailable"])


def _parse_with_llm(text: str, ct: CaseType, llm: LLM, prompt: str) -> ParsedQuery:
    user = json.dumps(
        {
            "案情": text,
            "案类": ct.name,
            "可选争点": [i.name for i in ct.issues],
            "检索词表": ct.vocabulary(),
        },
        ensure_ascii=False,
    )
    out = llm.structured(prompt, user, ParseOutput, effort=llm.s.llm_effort_parse)
    keywords: list[str] = []
    for k in out.keywords:
        if ct.canonical(k) not in keywords:
            keywords.append(ct.canonical(k))
    return ParsedQuery(
        raw_text=text,
        case_type=ct.id,
        issues=out.issues,
        facts=out.facts,
        keywords=keywords,
        filters=out.filters,
    )


def _parse_with_rules(text: str, ct: CaseType) -> ParsedQuery:
    """降级方案：用案类词表做字面匹配，只取用户原文里出现过的词，不做补全。"""
    keywords: list[str] = []
    for w in ct.vocabulary() + [a for alts in ct.synonyms.values() for a in alts]:
        if w in text and ct.canonical(w) not in keywords:
            keywords.append(ct.canonical(w))
    issues = [i.name for i in ct.issues if any(t in text for t in i.terms)]
    return ParsedQuery(raw_text=text, case_type=ct.id, issues=issues, keywords=keywords)
