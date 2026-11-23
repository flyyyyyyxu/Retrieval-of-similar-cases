"""本地导出清洗；不改写原文和段落 ID，不把真实文书写入 fixtures。"""

import re

from app.pipeline.cite import verify_research_point, verify_section
from app.schemas import CaseDetail, CaseSection, ResearchPoint


def clean_case(raw: dict, annotations: list[dict]) -> CaseDetail:
    case = CaseDetail.model_validate(raw)
    if case.court:
        case.court = re.sub(r"^文书内容\s*", "", case.court).strip()
    section = "文书信息"
    for paragraph in case.paragraphs:
        text = paragraph.text.strip()
        if re.match(r"^(审判长|审判员|代理审判员|人民陪审员|书记员|代书记员)", text):
            section = "落款"
        elif text.startswith(("本院认为", "本院经审查认为")):
            section = "本院认为"
        elif text.startswith(("判决如下", "裁定如下")):
            section = "裁判结果"
        elif section == "文书信息" and text.startswith(("本院查明", "经审理查明", "本院认定事实")):
            section = "本院查明"
        paragraph.section = section
        # 包含“判决如下”的段落仍保留在说理中，后续主文另行分区。
        if "判决如下" in text or "裁定如下" in text:
            section = "裁判结果"
    case.word_count = sum(len(p.text) for p in case.paragraphs)
    case.content_sections = []
    case.research_points = []
    for item in annotations:
        ids = item["paragraph_ids"]
        paras = {p.id: p for p in case.paragraphs}
        if not ids or any(pid not in paras for pid in ids):
            raise ValueError(f"分析引用段落不存在：{case.id}")
        candidate = CaseSection(
            key=item["key"], text=item["text"], origin="ai", paragraph_ids=ids,
            citations=[{"case_id": case.id, "paragraph_id": pid, "quote": paras[pid].text}
                       for pid in ids],
        )
        checked = verify_section(candidate, case)
        if checked is None:
            raise ValueError(f"分析引用校验失败：{case.id}")
        case.content_sections.append(checked)
        for point in item.get("research_points", []):
            point = dict(point)
            point_ids = point.pop("paragraph_ids")
            research = ResearchPoint(**point, origin="ai", citations=[
                {"case_id": case.id, "paragraph_id": pid, "quote": paras[pid].text}
                for pid in point_ids
            ])
            checked_point = verify_research_point(research, case)
            if checked_point is None:
                raise ValueError(f"裁判观点引用无效：{case.id}")
            case.research_points.append(checked_point)
    for key, label in [("opinion", "本院认为"), ("facts", "本院查明"), ("result", "裁判结果")]:
        ids = [p.id for p in case.paragraphs if p.section == label]
        if ids:
            case.content_sections.append(CaseSection(key=key, paragraph_ids=ids))
    return case
