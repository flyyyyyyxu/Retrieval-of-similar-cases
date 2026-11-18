"""运行配置：全部来自环境变量或仓库根目录的 .env，见 .env.example。"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]  # 仓库根目录


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    # 案例库来源：mock=本地演示数据；es=内网 ES；replay=只回放已缓存的真实响应
    case_source: Literal["mock", "es", "replay"] = "mock"
    # 连真实来源时，是否把响应写入缓存（供 replay 和离线开发）
    record_responses: bool = True

    es_url: str = ""
    es_index: str = ""
    es_username: str = ""
    es_password: str = ""

    # 大模型：Claude API。key 留空则走规则降级
    anthropic_api_key: str = ""
    anthropic_base_url: str = ""  # 走代理或公司网关时填写，否则留空
    # anthropic=直连官方接口；gateway=公司网关（不支持系统提示词和结构化输出参数）
    llm_api_style: Literal["anthropic", "gateway"] = "anthropic"
    llm_model: str = "claude-opus-5-5"
    llm_effort_parse: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    llm_effort_explain: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    llm_fallbacks: bool = True  # 拒答时服务端自动换模型重试；仅 anthropic 直连模式生效
    llm_timeout_s: float = 120

    # 重排服务：暂无可用服务，留空则沿用召回排序（见 README 待办）
    rerank_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = ""

    case_type_config: Path = ROOT / "configs" / "case_type.yaml"
    prompts_dir: Path = ROOT / "prompts"
    fixtures_path: Path = ROOT / "backend" / "fixtures" / "demo_cases.json"
    db_path: Path = ROOT / "var" / "app.db"
    frontend_dir: Path = ROOT / "frontend"


@lru_cache
def get_settings() -> Settings:
    return Settings()
