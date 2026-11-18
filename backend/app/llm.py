"""大模型调用：目前使用 Claude API（Anthropic 官方 Python SDK）。

全项目只有这个文件直接接触模型服务。pipeline 只调用 `LLM.structured()`，
传入提示词和一个 Pydantic 输出模型，拿回校验过的对象。以后换模型或服务商，只改这里。

两种接入方式（.env 的 LLM_API_STYLE）：
- anthropic：直连官方接口。用系统提示词 + 结构化输出（API 保证返回符合结构的 JSON），
  并开启拒答自动换模型（LLM_FALLBACKS）。
- gateway：公司网关。网关会丢弃系统提示词和结构化输出参数，所以把指令和 JSON 结构
  都写进用户消息，拿到文本后用 Pydantic 校验；校验不过按失败处理。

未配置 key 时 configured=False，pipeline 走规则降级，并在响应里标记 llm_unavailable。
"""

import json
import logging
import os
import re
from functools import cached_property
from pathlib import Path
from typing import Literal, TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import Settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
Effort = Literal["low", "medium", "high", "xhigh", "max"]

MAX_TOKENS = 16000
# 被安全分类器拒答时，由服务端自动换用 Anthropic 推荐的备用模型重试
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(RuntimeError):
    pass


class LLM:
    def __init__(self, s: Settings):
        self.s = s

    @property
    def configured(self) -> bool:
        return bool(self.s.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY"))

    @property
    def model(self) -> str | None:
        return self.s.llm_model if self.configured else None

    @cached_property
    def client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(
            api_key=self.s.anthropic_api_key or None,  # None → SDK 读环境变量
            base_url=self.s.anthropic_base_url or None,  # 走代理或网关时填写
            timeout=self.s.llm_timeout_s,
            max_retries=2,  # SDK 自动重试 429 / 5xx / 网络错误
        )

    def structured(self, system: str, user: str, output: type[T], effort: Effort = "medium") -> T:
        """一次调用，返回符合 `output` 结构的对象。任何失败都抛 LLMError，由调用方降级。"""
        if not self.configured:
            raise LLMError("未配置 ANTHROPIC_API_KEY")
        try:
            if self.s.llm_api_style == "gateway":
                return self._via_gateway(system, user, output)
            return self._via_anthropic(system, user, output, effort)
        except anthropic.AuthenticationError as e:
            raise LLMError("ANTHROPIC_API_KEY 无效") from e
        except anthropic.PermissionDeniedError as e:
            raise LLMError("API key 没有该模型的权限") from e
        except anthropic.NotFoundError as e:
            raise LLMError(f"模型或接口不存在：{self.s.llm_model}") from e
        except anthropic.RateLimitError as e:
            raise LLMError("触发限流，请稍后再试") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"模型服务错误（{e.status_code}）：{e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError("连不上模型服务，检查网络或 ANTHROPIC_BASE_URL") from e

    # ---- 直连官方接口：结构化输出 ----

    def _via_anthropic(self, system: str, user: str, output: type[T], effort: Effort) -> T:
        extra = {"betas": [FALLBACK_BETA], "fallbacks": "default"} if self.s.llm_fallbacks else {}
        resp = self.client.beta.messages.parse(
            model=self.s.llm_model,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=output,
            output_config={"effort": effort},
            **extra,
        )
        _check_stop(resp.stop_reason)
        if resp.parsed_output is None:
            raise LLMError("模型没有返回结构化结果")
        return resp.parsed_output

    # ---- 公司网关：指令写进用户消息，自行校验 JSON ----

    def _via_gateway(self, system: str, user: str, output: type[T]) -> T:
        schema = json.dumps(output.model_json_schema(), ensure_ascii=False)
        content = (
            f"{system}\n\n"
            f"只输出一个 JSON 对象，不要输出其他文字。JSON 必须符合以下 JSON Schema：\n{schema}\n\n"
            f"输入：\n{user}"
        )
        resp = self.client.messages.create(
            model=self.s.llm_model,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": content}],
        )
        _check_stop(resp.stop_reason)
        text = "".join(b.text for b in resp.content if b.type == "text")
        try:
            return output.model_validate_json(_extract_json(text))
        except ValidationError as e:
            raise LLMError(f"网关返回的 JSON 不符合结构：{e.error_count()} 处错误") from e


def _check_stop(stop_reason: str | None) -> None:
    if stop_reason == "refusal":
        raise LLMError("模型拒绝回答")
    if stop_reason == "max_tokens":
        raise LLMError("模型输出被截断（max_tokens）")


def _extract_json(text: str) -> str:
    """去掉 ```json 代码块包裹，取第一个 { 到最后一个 } 之间的内容。"""
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    text = m.group(1) if m else text
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start != -1 and end > start else text


def load_prompt(prompts_dir: Path, name: str) -> str:
    return (prompts_dir / f"{name}.md").read_text(encoding="utf-8")
