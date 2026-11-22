"""唯一的数据契约。前端、评测脚本、各数据源都以这里为准。

修改字段后运行 `uv run python ../scripts/export_openapi.py` 更新 docs/openapi.json。
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SourceType = Literal["demo", "guiding", "typical", "reference", "judgment"]
"""demo=虚构演示；guiding=指导性；typical=官方典型；reference=入库参考；judgment=普通文书"""

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
    year_from: int | None = Field(default=None, ge=1900, le=2100)
    year_to: int | None = Field(default=None, ge=1900, le=2100)
    court_level: str | None = None
    regions: list[str] = Field(default_factory=list, max_length=60)
    court_levels: list[str] = Field(default_factory=list, max_length=10)
    years: list[Annotated[int, Field(ge=1900, le=2100)]] = Field(default_factory=list, max_length=201)

    @model_validator(mode="after")
    def ordered_years(self):
        if self.year_from is not None and self.year_to is not None and self.year_from > self.year_to:
            raise ValueError("截止年份不能早于起始年份")
        return self


class ParsedQuery(BaseModel):
    """检索链路内部使用的结构化案情，不要求用户逐项确认。"""

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


class OptimizeResponse(BaseModel):
    original_text: str
    optimized_text: str
    status: Literal["ready", "unavailable"]
    notice: str | None = None


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
    updated_date: str | None = None
    procedure: str | None = None
    word_count: int | None = Field(default=None, ge=0)
    claim_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    case_fee: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    disclosure_level: str | None = None
    has_hearing_video: bool | None = None
    cause_path: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(
        default_factory=list, description="底库缺失的字段；前端不展示，也不让模型补造"
    )


class LawArticle(BaseModel):
    id: str
    number: str = Field(description="条号，如 第四十七条")
    text: str = Field(description="数据源提供的原始条文，不由展示层补全")
    paragraph_ids: list[str] = Field(default_factory=list, description="本文援引该条的段落")


class LawReference(BaseModel):
    id: str
    title: str
    version: str | None = None
    authority: str | None = None
    published_date: str | None = None
    effective_date: str | None = None
    source_url: str | None = None
    articles: list[LawArticle] = Field(default_factory=list)


class CaseSection(BaseModel):
    key: Literal["overview", "opinion", "facts", "claims", "defense", "issues", "evidence", "result", "related"]
    text: str | None = None
    paragraph_ids: list[str] = Field(default_factory=list)


class CaseDetail(CaseSummary):
    paragraphs: list[Paragraph]
    full_text_available: bool = True
    law_references: list[LawReference] = Field(default_factory=list)
    content_sections: list[CaseSection] | None = Field(
        default=None, description="可选摘要分栏：null=尚未适配，可按原文段落展示；[]=无摘要；只展示有内容项",
    )


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


class ResultFilters(BaseModel):
    model_config = {"extra": "forbid"}

    court_levels: list[str] = Field(default_factory=list)
    reference_levels: list[Literal["guiding", "typical", "reference", "judgment"]] = Field(default_factory=list)
    courts: list[str] = Field(default_factory=list)
    causes: list[str] = Field(default_factory=list)
    procedures: list[str] = Field(default_factory=list)
    date_from: date | None = None
    date_to: date | None = None
    doc_types: list[str] = Field(default_factory=list)
    word_count_min: int | None = Field(default=None, ge=0)
    word_count_max: int | None = Field(default=None, ge=0)
    claim_amount_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    claim_amount_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    case_fee_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    case_fee_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    disclosure_levels: list[str] = Field(default_factory=list)
    has_hearing_video: bool | None = None

    @model_validator(mode="after")
    def ordered_ranges(self):
        for lower, upper in (("date_from", "date_to"), ("word_count_min", "word_count_max"),
                             ("claim_amount_min", "claim_amount_max"), ("case_fee_min", "case_fee_max")):
            a, b = getattr(self, lower), getattr(self, upper)
            if a is not None and b is not None and a > b:
                raise ValueError(f"{lower} 不能大于 {upper}")
        return self


class ResultFilterRequest(BaseModel):
    search_id: str
    filters: ResultFilters = Field(default_factory=ResultFilters)


class ResultFilterResponse(BaseModel):
    search_id: str
    scope: Literal["returned_results"] = "returned_results"
    hits: list[Hit]
    total: int


class ResultFilterOptions(BaseModel):
    search_id: str
    scope: Literal["returned_results"] = "returned_results"
    court_levels: list[str] = Field(default_factory=list)
    reference_levels: list[str] = Field(default_factory=list)
    courts: list[str] = Field(default_factory=list)
    causes: list[str] = Field(default_factory=list)
    procedures: list[str] = Field(default_factory=list)
    doc_types: list[str] = Field(default_factory=list)
    disclosure_levels: list[str] = Field(default_factory=list)


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


class SearchAnswerRequest(BaseModel):
    search_id: str


class SearchAnswer(BaseModel):
    """综合答复预留契约。策略接入后，两部分均需带通过原文校验的引用。"""

    search_id: str
    status: Literal["pending", "ready"] = "pending"
    conclusion: Point | None = None
    judicial_view: Point | None = None


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


# ---------- 可编辑检索报告（受限 Delta，不接受 HTML / 任意嵌入） ----------

class ReportTier(BaseModel):
    model_config = {"extra": "forbid"}
    label: str = Field(max_length=40)
    count: int = Field(ge=0, le=100)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class ReportPyramid(BaseModel):
    model_config = {"extra": "forbid"}
    reportPyramid: list[ReportTier] = Field(min_length=1, max_length=8)


class ReportAttributes(BaseModel):
    model_config = {"extra": "forbid"}
    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    strike: bool | None = None
    header: Literal[1, 2, 3] | None = None
    align: Literal["center", "right", "justify"] | None = None
    list: Literal["ordered", "bullet"] | None = None
    indent: int | None = Field(default=None, ge=0, le=4)


class ReportOp(BaseModel):
    model_config = {"extra": "forbid"}
    insert: str | ReportPyramid
    attributes: ReportAttributes | None = None


class ReportContent(BaseModel):
    model_config = {"extra": "forbid"}
    title: str = Field(min_length=1, max_length=120)
    ops: list[ReportOp] = Field(min_length=1, max_length=20000)

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value):
        if not value.strip():
            raise ValueError("报告名称不能为空")
        return value.strip()

    @model_validator(mode="after")
    def bounded_content(self):
        if sum(len(op.insert) for op in self.ops if isinstance(op.insert, str)) > 500000:
            raise ValueError("报告内容超过50万字")
        if not isinstance(self.ops[-1].insert, str) or not self.ops[-1].insert.endswith("\n"):
            raise ValueError("报告必须以完整段落结束")
        return self


class ReportCreateRequest(BaseModel):
    search_id: str
    case_ids: list[str] = Field(min_length=1, max_length=50)
    filters: ResultFilters = Field(default_factory=ResultFilters)


class ReportUpdate(ReportContent):
    revision: int = Field(ge=1)


class RetrievalReport(ReportContent):
    id: str
    search_id: str
    case_ids: list[str]
    data_mode: DataMode
    created_at: str
    updated_at: str
    revision: int = 1


class ReportSummary(BaseModel):
    id: str
    title: str
    case_ids: list[str]
    data_mode: DataMode
    updated_at: str
