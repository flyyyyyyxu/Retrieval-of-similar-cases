"""案类规则：读取 configs/case_type.yaml（由法律成员维护），启动时校验格式。"""

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class Issue(BaseModel):
    name: str = Field(description="争议问题")
    key_facts: list[str] = Field(default_factory=list, description="影响结论的关键事实")
    terms: list[str] = Field(default_factory=list, description="常见表达，用于检索")
    differences: list[str] = Field(default_factory=list, description="会导致结论不同的差异点")


class CaseType(BaseModel):
    id: str
    name: str
    causes: list[str] = Field(description="对应底库中的案由名称")
    issues: list[Issue]
    synonyms: dict[str, list[str]] = Field(default_factory=dict, description="标准词: [同义表达]")
    exclude_terms: list[str] = Field(default_factory=list, description="出现即可能混淆的情形")

    def vocabulary(self) -> list[str]:
        words = {t for i in self.issues for t in i.terms} | set(self.synonyms)
        return sorted(words, key=len, reverse=True)

    def canonical(self, word: str) -> str:
        for std, alts in self.synonyms.items():
            if word == std or word in alts:
                return std
        return word


def load_case_type(path: Path) -> CaseType:
    return CaseType.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
