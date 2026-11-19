"""HTTP 接口：只做参数校验、调用 pipeline、记录日志。业务逻辑不写在这里。"""

from datetime import UTC, datetime
from functools import lru_cache
from typing import Literal
from urllib.parse import quote
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.case_type import CaseType, load_case_type
from app.config import get_settings
from app.llm import LLM, load_prompt
from app.pipeline import run_search
from app.pipeline.answer import build_answer
from app.pipeline.explain import explain
from app.pipeline.optimize import optimize_question
from app.pipeline.parse import parse_query
from app.pipeline.report import report_content
from app.pipeline.result_filters import filter_hits, filter_options
from app.report_export import docx_bytes, pdf_bytes
from app.schemas import (
    CaseDetail,
    ExplainRequest,
    Explanation,
    FeedbackRequest,
    Health,
    Hit,
    OptimizeResponse,
    ParseRequest,
    ParseResponse,
    ReportCreateRequest,
    ReportSummary,
    ReportUpdate,
    ResultFilterOptions,
    ResultFilterRequest,
    ResultFilterResponse,
    RetrievalReport,
    SearchAnswer,
    SearchAnswerRequest,
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


@lru_cache
def optimization_llm() -> LLM:
    s = get_settings()
    return LLM(s.model_copy(update={
        "llm_model": s.llm_model_optimize or s.llm_model,
        "llm_timeout_s": s.llm_optimize_timeout_s,
        "llm_max_retries": 0,
        "llm_fallbacks": False,
    }))


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


@router.post("/query/parse", response_model=ParseResponse, summary="内部检索要素提取")
def parse(req: ParseRequest):
    return parse_query(req.text, case_type(), llm(), prompt("parse"))


@router.post("/query/optimize", response_model=OptimizeResponse, summary="优化检索问题（一次短调用）")
def optimize(req: ParseRequest):
    return optimize_question(req.text, optimization_llm(), prompt("optimize"))


@router.post("/search", response_model=SearchResponse, summary="按内部检索要素查找案例")
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


@router.post("/search/answer", response_model=SearchAnswer, summary="综合结论与裁判观点（策略预留）")
def search_answer(req: SearchAnswerRequest):
    saved = store().get_search(req.search_id)
    if saved is None:
        raise HTTPException(404, "检索记录不存在，请重新检索")
    request, response = saved
    query = SearchRequest.model_validate(request).query
    hits = [Hit.model_validate(hit) for hit in response["hits"]]
    return build_answer(req.search_id, query, hits)


@router.get("/cases/{case_id}", response_model=CaseDetail, summary="文书详情与段落")
def get_case(case_id: str):
    case = source().get(case_id)
    if not case:
        raise HTTPException(404, "文书不存在或当前数据源不可用")
    return case


def saved_hits(search_id: str) -> list[Hit]:
    saved = store().get_search(search_id)
    if saved is None:
        raise HTTPException(404, "检索记录不存在，请重新检索")
    return [Hit.model_validate(item) for item in saved[1]["hits"]]


@router.get("/search/{search_id}/filters", response_model=ResultFilterOptions, summary="结果筛选可选值")
def get_filter_options(search_id: str):
    return filter_options(search_id, saved_hits(search_id))


@router.post("/search/filter", response_model=ResultFilterResponse, summary="十二维结果筛选")
def apply_result_filters(req: ResultFilterRequest):
    hits = filter_hits(saved_hits(req.search_id), req.filters)
    return ResultFilterResponse(search_id=req.search_id, hits=hits, total=len(hits))


@router.post("/cases/{case_id}/explain", response_model=Explanation, summary="单篇相似点/差异点")
def explain_case(case_id: str, req: ExplainRequest):
    case = get_case(case_id)
    return explain(req.query, case, llm(), prompt("explain"))


@router.post("/feedback", status_code=204, summary="相关性反馈")
def feedback(req: FeedbackRequest):
    store().save_feedback(req.search_id, req.case_id, req.relevant, req.reason)


@router.post("/reports", response_model=RetrievalReport, response_model_exclude_none=True,
             summary="生成选定类案的可编辑检索报告")
def create_report(req: ReportCreateRequest):
    saved = store().get_search(req.search_id)
    if saved is None:
        raise HTTPException(404, "检索记录不存在，请重新检索")
    request, response = saved
    if response["data_mode"] != get_settings().case_source:
        raise HTTPException(409, "当前案例库与检索记录不一致，请重新检索")
    ids = list(dict.fromkeys(req.case_ids))
    allowed = {h["case"]["id"] for h in response["hits"]}
    if not set(ids) <= allowed:
        raise HTTPException(422, "只能将本次检索返回的案例加入报告")
    cases = []
    for case_id in ids:
        doc = source().get(case_id)
        if doc is None:
            raise HTTPException(409, "部分文书暂时无法读取，请稍后重试生成报告")
        cases.append(doc)
    now = datetime.now(UTC).isoformat()
    database = {"mock": "清案虚构演示样例库", "es": "案例库", "replay": "案例库缓存回放"}[response["data_mode"]]
    query = SearchRequest.model_validate(request).query
    completed = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    title, ops = report_content(query, cases, database, completed, req.filters)
    report = RetrievalReport(id=uuid4().hex, title=title, ops=ops, search_id=req.search_id,
                             case_ids=ids, data_mode=response["data_mode"], created_at=now, updated_at=now)
    store().create_report(report.model_dump(mode="json", exclude_none=True))
    return report


@router.get("/reports", response_model=list[ReportSummary], summary="已保存的检索报告")
def list_reports():
    return store().list_reports()


@router.get("/reports/{report_id}", response_model=RetrievalReport, response_model_exclude_none=True)
def get_report(report_id: str):
    saved = store().get_report(report_id)
    if saved is None:
        raise HTTPException(404, "报告不存在")
    return RetrievalReport.model_validate(saved)


@router.put("/reports/{report_id}", response_model=RetrievalReport, response_model_exclude_none=True,
            summary="保存编辑后的报告")
def update_report(report_id: str, req: ReportUpdate):
    old = get_report(report_id)
    report = old.model_copy(update={"title": req.title, "ops": req.ops,
                                   "revision": req.revision + 1,
                                   "updated_at": datetime.now(UTC).isoformat()})
    if not store().update_report(report.model_dump(mode="json", exclude_none=True), req.revision):
        raise HTTPException(409, "报告已在其他窗口更新，请保留当前文本并刷新后重新编辑")
    return report


@router.get("/reports/{report_id}/download", summary="下载已保存报告的 Word 或 PDF")
def download_report(report_id: str, format: Literal["docx", "pdf"]):
    report = get_report(report_id)
    data = docx_bytes(report) if format == "docx" else pdf_bytes(report)
    media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if format == "docx" else "application/pdf"
    return Response(content=data, media_type=media, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(report.title, safe='')}.{format}",
        "Cache-Control": "no-store",
    })
