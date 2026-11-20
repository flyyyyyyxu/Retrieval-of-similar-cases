# AI 协作约定

给 Codex / Claude Code 等 AI 助手读的规则。人也请遵守。项目说明见 README.md。

## UI 设计约定

- 修改前端样式或新增组件前，先阅读根目录 [design.md](design.md)。后续 UI 以该文件为准。
- `frontend/theme.css` 是统一 token 与共享外观入口；组件 CSS 保留结构/布局，新增外观复用 token，不另造相近色、圆角、阴影或重复 override。
- 不修改 vendor；报告正文格式与 UI 主题分别处理，保持编辑器和导出一致。

## 边界（不要打破）

1. **前端只调用 `frontend/api.js`**，不直接连 ES、模型或重排服务。
2. **`backend/app/schemas.py` 是唯一的数据契约**。改了字段 → 运行 `scripts/export_openapi.py` → 同步更新 `frontend/api.js` 的注释和调用处。
3. **底库字段名只能出现在 `backend/app/sources/`**。pipeline、API、前端只认识统一字段。
4. **pipeline 每一步是纯函数**，不读 HTTP 请求、不写数据库；API 和 eval 共用同一条链路。
5. **新增数据源** = 在 `sources/` 实现 `search()` 和 `get()`，并在 `sources/__init__.py` 注册。
6. **模型调用只在 `backend/app/llm.py`**（目前是 Claude API，官方 `anthropic` SDK）。pipeline 只用 `LLM.structured(提示词, 输入, Pydantic 输出模型)`，不直接 import SDK。

## 可信相关的硬规则

- 案号、法院、日期、链接只能来自数据源，**不能让模型生成或补全**；缺的字段放进 `missing_fields`。
- 模型给出的每条结论都必须带引用，并通过 `pipeline/cite.py` 校验；校验不过就丢弃。
- 区分 `origin="original"`（原文摘录）和 `origin="ai"`（模型归纳）。
- 排序分 `score` 只用于排序，**不能在界面上显示成可信度或百分比**。
- 任何降级（模型不可用、未重排、放宽查询）都要写进 `degraded`。按用户2026-11-19的要求，结果页和侧栏不再常驻展示数据模式或技术说明；接口/日志继续保留状态，实际请求失败仍需显示可操作的错误与重试。

## 数据安全

- 不提交 `.env`、`var/`、真实文书、服务器地址、账号密码。
- `backend/fixtures/` 只放虚构或脱敏数据。

## 改完之后

```bash
cd backend && uv run ruff check . && uv run pytest
```

- 改了接口：更新 `docs/openapi.json`。
- 改了检索或排序：跑 `uv run python ../eval/run_eval.py`，在 PR 里贴结果。
- 一个 PR 只做一件事，标题写清楚改了什么。
