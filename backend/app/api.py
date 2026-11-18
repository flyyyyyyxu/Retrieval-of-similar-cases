"""HTTP 接口：只做参数校验、调用 pipeline、记录日志。业务逻辑不写在这里。"""

from functools import lru_cache

from fastapi import APIRouter, HTTPException

from app.case_type import CaseType, load_case_type
from app.config import get_settings
from app.llm import LLM, load_prompt
from app.pipeline import run_search
from app.pipeline.explain import explain
from app.pipeline.parse import parse_query
from app.schemas import (
    CaseDetail,
    ExplainRequest,
    Explanation,
    FeedbackRequest,
    Health,
    ParseRequest,
    ParseResponse,
    SearchRequest,
    SearchResponse,
)
from app.sources import CaseSource, build_source
from app.store import Store

router = APIRouter(prefix="/api")


# ---- 依赖（进程内单例）----


@lru_cache
def store() -> Store:
    return Store(get_settings().db_path)


@lru_cache
def source() -> CaseSource:
    return build_source(get_settings(), store())


@lru_cache
def case_type() -> CaseType:
    return load_case_type(get_settings().case_type_config)


@lru_cache
def llm() -> LLM:
    return LLM(get_settings())


def prompt(name: str) -> str:
    return load_prompt(get_settings().prompts_dir, name)


# ---- 路由 ----


@router.get("/health", response_model=Health)
def health():
    s = get_settings()
    return Health(
        data_mode=s.case_source,
        llm_configured=llm().configured,
        llm_model=llm().model,
        rerank_configured=bool(s.rerank_url),
        case_type=case_type().id,
    )


@router.post("/query/parse", response_model=ParseResponse, summary="案情 → 可编辑的检索条件")
def parse(req: ParseRequest):
    return parse_query(req.text, case_type(), llm(), prompt("parse"))


@router.post("/search", response_model=SearchResponse, summary="用确认后的条件检索")
def search(req: SearchRequest):
    s = get_settings()
    hits, degraded, took = run_search(req.query, source(), s, req.size)
    resp = SearchResponse(
        search_id=store().new_search_id(),
        data_mode=s.case_source,
        hits=hits,
        degraded=degraded,
        took_ms=took,
    )
    store().save_search(resp.search_id, req.model_dump(mode="json"), resp.model_dump(mode="json"))
    return resp


@router.get("/cases/{case_id}", response_model=CaseDetail, summary="文书详情与段落")
def get_case(case_id: str):
    case = source().get(case_id)
    if not case:
        raise HTTPException(404, "文书不存在或当前数据源不可用")
    return case


@router.post("/cases/{case_id}/explain", response_model=Explanation, summary="单篇相似点/差异点")
def explain_case(case_id: str, req: ExplainRequest):
    case = get_case(case_id)
    return explain(req.query, case, llm(), prompt("explain"))


@router.post("/feedback", status_code=204, summary="相关性反馈")
def feedback(req: FeedbackRequest):
    store().save_feedback(req.search_id, req.case_id, req.relevant, req.reason)
