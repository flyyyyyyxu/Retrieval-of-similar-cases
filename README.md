# 清案 · 可信类案检索助手

> 面向律师的类案检索工具：聚焦一个高频民事争议，输入案情（可选问题优化）→ 直接检索 → 综合答复与类案 → 逐条回到原文核验。
>
> **比赛提交：11 月 30 日** · 当前阶段：搭骨架 + 案例库摸底

---

## 👥 分工

| 成员 | 负责 | 主要维护 |
|---|---|---|
| 徐可欣 | 产品范围、前端交互、接口对接、演示 | `frontend/` |
| 郑元龙 | 数据审计、后端、检索与重排 | `backend/`、`docs/data-audit.md` |
| 赵可 | 案类规则、测试问题、相关性标注 | `configs/case_type.yaml`、`eval/*.csv` |

两处需要共同完成：**法律 + 算法**确定哪些事实影响排序；**法律 + 产品**确定用户需要看到哪些信息。

## 📅 时间线

| 日期 | 节点 | 验收标准 | 状态 |
|---|---|---|---|
| 11/19 周四 | 案例库摸底；确定案类 | 真实查询能返回结果，并能打开一篇正文 | ⬜ |
| 11/20 周五 | 线下对齐 | 冻结案类、接口和 P0 范围 | ⬜ |
| 11/22 周日 | 第一个真实端到端版本 | 前端走完一次真实检索 | ⬜ |
| 11/23 周一 | 导师汇报 | 只接受小幅调整 | ⬜ |
| 11/25 周三 | 核心功能完成 | 直接检索、相似/差异、原文定位 | ⬜ |
| 11/26 周四 | **功能冻结** | 固定测试集跑出对比结果 | ⬜ |
| 11/28 周六 | 演练 | 录屏备份，replay 模式能离线演示 | ⬜ |
| 11/30 周一 | 提交 | — | ⬜ |

> 规则：11/22 还没跑通闭环就砍功能；11/26 之后不再加新功能。

## 🚀 本地运行

需要安装 [uv](https://docs.astral.sh/uv/)（`brew install uv`）。

```bash
cp .env.example .env      # 默认 CASE_SOURCE=mock，不用连内网
./scripts/dev.sh          # 打开 http://127.0.0.1:8000 ；接口文档在 /docs
```

```bash
cd backend && uv run pytest              # 测试
cd backend && uv run python ../eval/run_eval.py   # 评测
```

**配置大模型（Claude API）**：只需在 `.env` 里填一行，代码不用改。

```bash
ANTHROPIC_API_KEY=sk-ant-...     # 在 platform.claude.com 的 API Keys 页面创建
```

- 默认模型 `claude-opus-5-5`，可用 `LLM_MODEL` 更换；推理深度用 `LLM_EFFORT_PARSE` / `LLM_EFFORT_EXPLAIN` 调。
- 直连官方接口：`LLM_API_STYLE=anthropic`。走公司网关：填 `ANTHROPIC_BASE_URL`，并设 `LLM_API_STYLE=gateway`（网关不支持系统提示词和结构化输出，代码会自动改用兼容写法）。
- 不填 key 也能运行：要素抽取和类案解释会降级为规则方式，接口保留降级状态。
- 填好后打开 `/api/health`，`llm_configured` 为 `true` 就是生效了。
- 模型调用全部集中在 `backend/app/llm.py`，以后换模型或服务商只改这一个文件。

**三种数据模式**（在 `.env` 里改 `CASE_SOURCE`）：

| 模式 | 用途 | 需要内网 |
|---|---|---|
| `mock` | 日常开发，使用虚构演示数据 | 否 |
| `es` | 连接真实案例库，同时把响应缓存到本地 | 是 |
| `replay` | 只回放缓存过的真实结果，用于离线开发和**演示兜底** | 否 |

## 🔎 检索流程

```
案情 ──内部要素提取──▶ recall ──▶ 候选 ~100 篇 ──rerank──▶ 前 10 篇
                                                                       │
                                     点开某篇时 ◀──explain + cite──────┘
                                     相似点 / 差异点，每条附原文引用（经程序校验）
```

模型、重排服务不可用时自动降级，并在返回结果的 `degraded` 字段里注明。按11月19日界面要求，结果页不再常驻展示技术说明；实际请求失败仍提供错误与重试。

## 🔌 接口

| 接口 | 作用 |
|---|---|
| `POST /api/query/optimize` | 可选：一次短调用优化问题，先预览再使用 |
| `POST /api/query/parse` | 内部提取争点、事实、关键词、筛选条件，不展示确认页 |
| `POST /api/search` | 按内部要素检索，返回排序结果 |
| `GET /api/search/{search_id}/filters` | 本次返回结果的可用过滤选项 |
| `POST /api/search/filter` | 按12类条件过滤已保存结果快照 |
| `POST /api/search/answer` | 综合结论与裁判观点预留接口，策略未接入时返回 pending |
| `GET /api/cases/{id}` | 文书详情与段落（用于原文定位） |
| `POST /api/cases/{id}/explain` | 单篇的相似点和差异点（按需调用） |
| `POST /api/feedback` | 相关 / 不相关 + 原因 |
| `POST /api/reports` | 从报告篮中选定的案例生成可编辑报告 |
| `GET/PUT /api/reports/{id}` | 读取/保存编辑内容，列表为GET /api/reports |
| `GET /api/reports/{id}/download` | 下载最新保存的Word或PDF，format=docx/pdf |
| `GET /api/health` | 当前数据模式，模型和重排是否可用 |

字段以 `backend/app/schemas.py` 为准，完整定义见运行后的 `/docs` 页面或 `docs/openapi.json`。

## 📁 目录

```
frontend/          页面（原生 HTML/CSS/JS，无构建）；只通过 api.js 访问后端
backend/app/
  schemas.py       ★ 数据契约，前后端唯一标准
  api.py           路由
  pipeline/        parse → recall → rerank → explain → cite
  sources/         案例库适配：mock / es / replay
  llm.py           模型调用
  store.py         SQLite：检索记录、反馈、缓存
configs/           案类规则（赵可维护）
prompts/           提示词
eval/              测试问题、人工标注、评测脚本
docs/              数据审计、openapi.json
```

## 🤝 协作约定

- **分支 + PR**：从 `main` 拉短分支，一个 PR 只做一件事，至少一人看过再合并。
- **改接口先改 `schemas.py`**，再运行 `scripts/export_openapi.py`，并在群里说一声。
- **不进 Git**：`.env`、`var/`、真实文书、服务器地址、账号密码。示例数据只放虚构或脱敏的内容。
- **可信的底线**：案号、法院、链接不由模型生成；AI 归纳必须附原文引用；排序分不显示成可信度。
- 用 AI 写代码前，先让它读 `AGENTS.md`。
- UI 设计以 [design.md](design.md) 为准，共享外观维护在 `frontend/theme.css`；本轮前端审查与较大问题见 [UI 待办](docs/ui-review-2026-11-19.md)。

## ✅ 待办

**本周（→ 11/20）**
- [ ] 案例库连接验证，填写 `docs/data-audit.md` — 郑元龙
- [ ] 确定案类和核心争议，替换 `configs/case_type.yaml` 中的示例 — 赵可
- [x] 前端改为调用 `api.js`；使用 ES Modules 拆分页面、组件、路由与状态 — 徐可欣
- [ ] 申请 Claude API key，填写 `.env`；确认演示电脑能访问 API（不能直连就配网关） — 郑元龙
- [ ] **重排服务**：先沿用召回排序，重排接口留好配置项（`RERANK_URL`），等郑元龙确认后再接 — 郑元龙
- [ ] 确认仓库可见性（建议设为私有，或迁移到公司 GitLab） — 徐可欣

**下周**
- [ ] 按审计结果完善 `sources/es.py` 的字段映射
- [ ] 20–30 个测试问题 + 人工标注（`eval/*.csv`） — 赵可
- [x] 前端：直接检索、可选问题优化、处理进度自动收起、答复位置、相似/差异抽屉、原文定位
- [x] 结果区：右侧多文书 Tab、可选摘要契约、官方典型案例优先、12类过滤、列表/可视化切换；字段映射待案例库审计
- [x] 检索报告：加入案例/数量徽标、在线编辑、保存/继续编辑、Word/PDF下载；内容直接整理来源文书，详见 `docs/retrieval-reports.md`
- [ ] 团队确定综合答复策略后接入 `backend/app/pipeline/answer.py`；两部分均须带可核验引用
- [ ] 真实案例库接入后进行前后端联合验收；补齐缺失字段、服务超时与回放边界
- [ ] 跑基线对比，整理主要错误
- [ ] 简版检索报告（只整理已选结果，不重新生成观点）

## ⚠️ 风险与待决

| 事项 | 影响 | 应对 |
|---|---|---|
| 案例库字段是否完整、能否取到全文 | 决定能否兑现“原文可核验” | 11/19 前完成审计；取不到全文就调整对外表述 |
| 内网只能在公司网络访问 | 开发和演示受限 | 日常用 mock，演示准备 replay 和录屏 |
| 案类尚未确定 | 规则、标注都无法开始 | 11/20 必须冻结 |
| Claude API 的网络访问和额度 | 抽取、解释可能降级 | 规则降级已内置；尽早在演示电脑上验证 |
| 暂无重排服务 | 排序只靠关键词召回分数 | 已预留 `RERANK_URL`；评测时对比接入前后的效果 |
