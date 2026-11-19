"""一次短调用优化问题，不检索、不生成裁判结论、不自动替换用户输入。"""

import json
import logging

from pydantic import BaseModel, Field, ValidationError

from app.llm import LLM, LLMError
from app.schemas import OptimizeResponse

log = logging.getLogger(__name__)


class OptimizedQuestion(BaseModel):
    optimized_text: str = Field(min_length=5, max_length=5000)


def optimize_question(text: str, llm: LLM, prompt: str) -> OptimizeResponse:
    if llm.configured:
        try:
            output = llm.structured(
                prompt, json.dumps({"用户问题": text}, ensure_ascii=False),
                OptimizedQuestion, effort="low", max_tokens=llm.s.llm_optimize_max_tokens,
            )
            candidate = output.optimized_text.strip()
            if len(candidate) < 5:
                raise LLMError("优化结果为空或过短")
            return OptimizeResponse(
                original_text=text, optimized_text=candidate, status="ready",
            )
        except (LLMError, ValidationError) as error:
            log.warning("问题优化未完成：%s", type(error).__name__)
    return OptimizeResponse(
        original_text=text, optimized_text=text, status="unavailable",
        notice="问题优化暂不可用，已保留原问题，可以直接检索。",
    )
