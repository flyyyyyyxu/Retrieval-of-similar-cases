"""按源文书生成可编辑报告，不调用模型，也不补写法律观点或法规。"""

from app.schemas import CaseDetail, ParsedQuery, ReportOp, ResultFilters


def report_content(query: ParsedQuery, cases: list[CaseDetail], database: str,
                   completed: str, filters: ResultFilters) -> tuple[str, list[ReportOp]]:
    causes = list(dict.fromkeys(c.cause for c in cases if c.cause))
    title = (causes[0] if len(causes) == 1 else "类案") + "检索报告"
    ops = []

    def line(text, header=None, bold=False, center=False):
        attrs = {"bold": True} if bold else None
        ops.append(ReportOp(insert=text, attributes=attrs))
        block = {k: v for k, v in {"header": header, "align": "center" if center else None}.items() if v}
        ops.append(ReportOp(insert="\n", attributes=block or None))

    line(title, header=1, center=True)
    for name, value in [("报告主题", title), ("完成日期", completed), ("完成人", ""),
                        ("使用数据库", database), ("检索条件", query.raw_text)]:
        ops.append(ReportOp(insert=f"【{name}】：", attributes={"bold": True}))
        line(value)
    applied = filters.model_dump(mode="json", exclude_none=True)
    labels = {"court_levels": "法院级别", "reference_levels": "参照级别", "courts": "审理法院",
              "causes": "案由", "procedures": "审判程序", "date_from": "裁判日起",
              "date_to": "裁判日止", "doc_types": "文书类型", "word_count_min": "篇幅下限",
              "word_count_max": "篇幅上限", "claim_amount_min": "标的额下限（元）",
              "claim_amount_max": "标的额上限（元）", "case_fee_min": "受理费下限（元）",
              "case_fee_max": "受理费上限（元）", "disclosure_levels": "公开程度",
              "has_hearing_video": "有庭审视频"}
    values = [f"{labels[k]}：{'、'.join(v) if isinstance(v, list) else v}"
              for k, v in applied.items() if v != []]
    if values:
        line("结果过滤条件：" + "；".join(values))
    line(f"【报告概况】：本报告纳入{len(cases)}篇案例；以下内容为来源文书摘录，可在编辑后复核。")
    tiers = [("指导性案例", "#ad3334"), ("官方典型案例", "#cf4546"),
             ("最高人民法院", "#195d89"), ("高级人民法院", "#2a79a8"),
             ("中级人民法院", "#5198bd"), ("基层人民法院", "#6aa51c"), ("级别未提供", "#929d94")]
    counts = [0] * len(tiers)
    for c in cases:
        if c.source_type in ("guiding", "typical"):
            index = 0 if c.source_type == "guiding" else 1
        else:
            index = next((i for i, word in [(2, "最高"), (3, "高级"), (4, "中级"), (5, "基层")]
                          if word in (c.court_level or "")), 6)
        counts[index] += 1
    ops.append(ReportOp(insert={"reportPyramid": [
        {"label": label, "count": counts[i], "color": color} for i, (label, color) in enumerate(tiers)
        if i != 6 or counts[i]
    ]}))
    line("相关类案", header=2, center=True)
    for i, case in enumerate(cases, 1):
        line(f"{i}. {case.title}", header=3)
        for label, value in [("案号", case.case_number), ("案由", case.cause),
                             ("裁判日期", case.judge_date), ("审理法院", case.court),
                             ("审级", case.procedure), ("文书类型", case.doc_type)]:
            if value:
                line(f"{label}：{value}")
        if case.source_type == "typical":
            line("参照级别：官方典型案例")
        if case.source_type == "demo":
            line("来源类型：虚构演示案例")
        # 摘要不是原文时不冒充裁判理由，报告使用可定位的原文段落。
        available = [p for p in case.paragraphs if p.section in (
            "本院认为", "裁判理由", "裁判要旨", "裁判结果", "判决如下", "裁定如下", "相关内容")]
        if not available:
            available = case.paragraphs
        for p in available:
            line(f"{p.section or '原文摘录'}（段落{p.id}）", bold=True)
            line(p.text)
        line(f"文书ID：{case.id}")
        if case.source_url and case.source_url.startswith(("http://", "https://")):
            line(f"来源链接：{case.source_url}")
    line("裁判依据 相关法规", header=2)
    seen = set()
    law_count = 0
    for case in cases:
        for law in case.law_references:
            for article in law.articles:
                key = (law.id, law.title, law.version, law.effective_date, article.number, article.text)
                if key in seen:
                    continue
                seen.add(key)
                law_count += 1
                line(f"{law_count}. {law.title} {law.version or ''} {article.number}", header=3)
                metadata = [f"发布部门：{law.authority}" if law.authority else "",
                            f"实施日期：{law.effective_date}" if law.effective_date else ""]
                if any(metadata):
                    line("；".join(filter(None, metadata)))
                line(article.text)
                line(f"引用文书：{case.title}；段落：{'、'.join(article.paragraph_ids) or '未提供'}")
    if not law_count:
        line("当前所选案例未提供结构化引用法规，请结合文书原文补充。")
    line("附录 案例索引", header=2)
    for i, c in enumerate(cases, 1):
        line(f"{i}. {c.title}；{c.court or '法院未提供'}；{c.case_number or '案号未提供'}；"
             f"{c.judge_date or '日期未提供'}；文书ID：{c.id}")
    return title, ops
