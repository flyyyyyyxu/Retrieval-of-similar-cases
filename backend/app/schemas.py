"""唯一的数据契约。前端、评测脚本、各数据源都以这里为准。

修改字段后运行 `uv run python ../scripts/export_openapi.py` 更新 docs/openapi.json。
"""

from typing import Literal

from pydantic import BaseModel, Field

SourceType = Literal["demo", "guiding", "reference", "judgment"]
"""demo=虚构演示；guiding=指导性案例；reference=入库参考案例；judgment=普通裁判文书"""

DataMode = Literal["mock", "es", "replay"]

Degradation = Literal[
    "llm_unavailable",  # 未配置或调用失败，要素抽取/解释走规则降级
    "query_broadened",  # 严格查询结果不足，补充了宽松查询
    "rerank_skipped",  # 未做重排，沿用召回顺序
    "explain_fallback",  # 解释仅为原文摘录，未经模型归纳
    "citation_dropped",  # 有引用未通过原文校验，已移除
]


# ---------- 查询 ----------


class Filters(BaseModel):
    """用户明确指定的筛选条件，不会被系统静默放宽。"""

    region: str | None = None
    year_from: int | None = None
    year_to: int | None = None
    court_level: str | None = None


class ParsedQuery(BaseModel):
    """系统对用户案情的理解。前端展示给用户确认、修改后再检索。"""

    raw_text: str
    case_type: str = Field(description="当前案类，对应 configs/case_type.yaml 的 id")
    issues: list[str] = Field(default_factory=list, description="核心争点")
    facts: list[str] = Field(default_factory=list, description="用户明确给出的关键事实")
    keywords: list[str] = Field(default_factory=list, description="检索词")
    filters: Filters = Field(default_factory=Filters)


class ParseRequest(BaseModel):
    text: str = Field(min_length=5, max_length=5000)


class ParseResponse(BaseModel):
    query: ParsedQuery
    degraded: list[Degradation] = Field(default_factory=list)


# ---------- 案例 ----------


class Paragraph(BaseModel):
    id: str = Field(description="文书内唯一的段落 ID，引用以此定位")
    section: str | None = Field(default=None, description="所属部分，如 案件事实 / 本院认为")
    text: str


class CaseSummary(BaseModel):
    id: str = Field(description="系统内部文书 ID")
    title: str
    case_number: str | None = None
    court: str | None = None
    court_level: str | None = None
    region: str | None = None
    judge_date: str | None = Field(default=None, description="YYYY-MM-DD")
    cause: str | None = None
    doc_type: str | None = None
    source_type: SourceType
    source_url: str | None = None
    missing_fields: list[str] = Field(
        default_factory=list, description="底库缺失的字段；前端不展示，也不让模型补造"
    )


class CaseDetail(CaseSummary):
    paragraphs: list[Paragraph]
    full_text_available: bool = True


# ---------- 检索 ----------


class SearchRequest(BaseModel):
    query: ParsedQuery
    size: int = Field(default=10, ge=1, le=50)


class Hit(BaseModel):
    case: CaseSummary
    rank: int
    score: float = Field(description="内部排序分，只用于排序，不能展示为可信度")
    matched_keywords: list[str] = Field(default_factory=list)
    snippets: list[Paragraph] = Field(default_factory=list, description="命中的原文段落")


class SearchResponse(BaseModel):
    search_id: str
    data_mode: DataMode
    hits: list[Hit]
    degraded: list[Degradation] = Field(default_factory=list)
    took_ms: int


# ---------- 解释与引用 ----------


class Citation(BaseModel):
    case_id: str
    paragraph_id: str
    quote: str = Field(description="原文引句，必须能在对应段落中逐字找到")
    verified: bool = False


class Point(BaseModel):
    text: str
    origin: Literal["original", "ai"] = Field(description="original=原文摘录；ai=模型归纳")
    citations: list[Citation] = Field(default_factory=list)


class ExplainRequest(BaseModel):
    query: ParsedQuery
    search_id: str | None = None


class Explanation(BaseModel):
    case_id: str
    similarities: list[Point] = Field(default_factory=list)
    differences: list[Point] = Field(default_factory=list)
    degraded: list[Degradation] = Field(default_factory=list)


# ---------- 反馈 ----------


class FeedbackRequest(BaseModel):
    search_id: str
    case_id: str
    relevant: bool
    reason: str | None = Field(default=None, max_length=500)


class Health(BaseModel):
    data_mode: DataMode
    llm_configured: bool
    llm_model: str | None = None
    rerank_configured: bool
    case_type: str
