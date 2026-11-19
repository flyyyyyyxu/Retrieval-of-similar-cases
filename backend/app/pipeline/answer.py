"""综合答复策略接入点；本轮仅保留接口，不生成预设或无依据的法律结论。"""

from app.schemas import Hit, ParsedQuery, SearchAnswer


def build_answer(search_id: str, query: ParsedQuery, hits: list[Hit]) -> SearchAnswer:
    # TODO: 团队确认策略后，用 query 和检索到的 hits 获取原文，再生成：
    # conclusion（一句话结论）+ judicial_view（综合裁判观点）。
    # 两者分别附原文引用并校验，处理分歧和证据不足，不输出模型内部推理。
    return SearchAnswer(search_id=search_id, status="pending")
