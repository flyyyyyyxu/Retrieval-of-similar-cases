"""模型分支的测试：用假的 Claude 客户端，不发真实请求、不花钱。"""

from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.case_type import load_case_type
from app.config import Settings
from app.llm import LLM, LLMError
from app.pipeline.explain import CitationOutput, ExplainOutput, PointOutput, explain
from app.pipeline.parse import ParseOutput, parse_query
from app.schemas import Filters
from app.sources.mock import MockSource

S = Settings(anthropic_api_key="sk-ant-test", _env_file=None)
CT = load_case_type(S.case_type_config)
CASE = MockSource(S.fixtures_path).get("loan-1")


class FakeMessages:
    def __init__(self, parsed=None, stop_reason="end_turn", exc=None, text=""):
        self.parsed, self.stop_reason, self.exc, self.text = parsed, stop_reason, exc, text
        self.calls = []

    def parse(self, **kw):  # 直连模式：client.beta.messages.parse
        self.calls.append(kw)
        if self.exc:
            raise self.exc
        return SimpleNamespace(parsed_output=self.parsed, stop_reason=self.stop_reason)

    def create(self, **kw):  # 网关模式：client.messages.create
        self.calls.append(kw)
        if self.exc:
            raise self.exc
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=self.text)])


def llm_with(messages: FakeMessages, settings: Settings = S) -> LLM:
    llm = LLM(settings)
    llm.__dict__["client"] = SimpleNamespace(messages=messages,
                                             beta=SimpleNamespace(messages=messages))
    return llm


GATEWAY = Settings(anthropic_api_key="sk-ant-test", llm_api_style="gateway", _env_file=None)


def test_gateway_puts_everything_in_user_message():
    reply = '好的：\n```json\n{"issues": ["借贷合意是否成立"], "facts": [], "keywords": ["欠条"],' \
            ' "filters": {}}\n```'
    fake = FakeMessages(text=reply)
    resp = parse_query("只有转账没有借条", CT, llm_with(fake, GATEWAY), "SYSTEM-RULES")
    kw = fake.calls[0]
    assert "system" not in kw and "output_format" not in kw and "fallbacks" not in kw
    assert "SYSTEM-RULES" in kw["messages"][0]["content"]
    assert resp.degraded == [] and resp.query.keywords == ["借条"]


def test_gateway_bad_json_degrades():
    fake = FakeMessages(text='{"issues": "不是列表"}')
    resp = parse_query("只有转账没有借条", CT, llm_with(fake, GATEWAY), "sys")
    assert resp.degraded == ["llm_unavailable"]


def test_fallbacks_can_be_turned_off():
    s = Settings(anthropic_api_key="sk-ant-test", llm_fallbacks=False, _env_file=None)
    fake = FakeMessages(ParseOutput(issues=[], facts=[], keywords=[], filters=Filters()))
    parse_query("只有转账没有借条", CT, llm_with(fake, s), "sys")
    assert "fallbacks" not in fake.calls[0] and "betas" not in fake.calls[0]


def test_request_shape():
    fake = FakeMessages(ParseOutput(issues=["借贷合意是否成立"], facts=[], keywords=["欠条"],
                                    filters=Filters()))
    parse_query("只有转账没有借条", CT, llm_with(fake), "sys")
    kw = fake.calls[0]
    assert kw["model"] == "claude-opus-5-5"
    assert kw["output_format"] is ParseOutput
    assert kw["output_config"] == {"effort": "low"}
    assert kw["fallbacks"] == "default"


def test_parse_uses_model_and_canonicalizes():
    fake = FakeMessages(ParseOutput(issues=["借贷合意是否成立"], facts=["无借条"],
                                    keywords=["欠条", "借条", "汇款"], filters=Filters()))
    resp = parse_query("只有转账没有借条", CT, llm_with(fake), "sys")
    assert resp.degraded == []
    assert resp.query.keywords == ["借条", "转账"]  # 同义词归一并去重


def test_explain_drops_fabricated_quotes():
    real = CASE.paragraphs[4]
    fake = FakeMessages(ExplainOutput(
        similarities=[PointOutput(text="真引用", citations=[
            CitationOutput(paragraph_id=real.id, quote=real.text[:20])])],
        differences=[PointOutput(text="编造", citations=[
            CitationOutput(paragraph_id=real.id, quote="原文里没有这句")])],
    ))
    q = parse_query("转账 借条", CT, LLM(Settings(_env_file=None)), "").query
    out = explain(q, CASE, llm_with(fake), "sys")
    assert [p.text for p in out.similarities] == ["真引用"]
    assert out.differences == [] and "citation_dropped" in out.degraded


@pytest.mark.parametrize("fake", [
    FakeMessages(None, stop_reason="refusal"),
    FakeMessages(None, stop_reason="max_tokens"),
    FakeMessages(exc=anthropic.APIConnectionError(
        request=httpx2.Request("POST", "https://api.anthropic.com"))),
])
def test_failures_degrade_to_rules(fake):
    resp = parse_query("只有转账没有借条", CT, llm_with(fake), "sys")
    assert resp.degraded == ["llm_unavailable"]
    assert "借条" in resp.query.keywords


def test_unconfigured_raises():
    with pytest.raises(LLMError):
        LLM(Settings(_env_file=None)).structured("s", "u", ParseOutput)
