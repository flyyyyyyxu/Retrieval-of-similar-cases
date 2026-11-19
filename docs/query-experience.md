# 直接检索与问题优化接入

## 已确定交互

1. 单一类案检索输入框，无功能选择Tab、必填字样、字数常驻提示或内层焦点框；保留外层焦点提示和错误时的输入校验。
2. “问题优化”为可选操作：一次模型调用 → 预览 → 用户采用/保留原文，不自动检索。
3. 提交即进入结果页。要素抽取仍作为现有检索链路的内部适配，不要求用户确认。
4. 问题下方展示真实请求阶段的进度摘要；完成后自动收起，可展开。不展示模型内部思维、不用预设长篇推理或计时器伪造检索过程。
5. 结论和裁判观点在一个段落内展示，分别允许带引用；当前只预留结构，未接入综合法律观点生成策略。

## 问题优化：选择短提示词，不增加运行时Skill/Agent

- 提示词：`prompts/optimize.md`。保留事实、否定条件与限制，中立改写为“事实＋争点”，不补造条文、案例或答案。
- 业务入口：`backend/app/pipeline/optimize.py`。
- 模型入口仍统一为 `backend/app/llm.py`；API工厂 `optimization_llm()` 选择独立模型配置。
- 可配置 `LLM_MODEL_OPTIMIZE`（留空复用主模型）、`LLM_OPTIMIZE_TIMEOUT_S=12`、`LLM_OPTIMIZE_MAX_TOKENS=900`。优化分支使用 low、禁用SDK重试和服务端自动换模型。
- `POST /api/query/optimize`：`{text}` → `{original_text, optimized_text, status, notice}`。
- 未配置、超时、非法结构时返回 unavailable 并原样保留输入；前端不把本地规则结果伪装成模型优化。
- 前端编辑输入、离开页面或开始检索时取消优化请求，迟到响应不能覆盖新输入。
- 提示词约束不等于已证明质量提升；真实接入后用含否定事实、时间地域限制、歧义关系的样例评价保真度、检索相关性和延迟。

Skill可用于团队维护和评估这些提示词，但本按钮无需每次动态加载Skill、多步工具调用或输出长篇思考。

## 综合答复接入点

- `POST /api/search/answer` 请求 `{search_id}`。
- 服务端从SQLite读取已保存的查询与候选，调用 `pipeline/answer.py::build_answer()`，不接受前端拼造候选。
- `SearchAnswer` 契约：`status: pending|ready`、`conclusion: Point|null`、`judicial_view: Point|null`。
- 两部分内容分别附 `Citation`；生成策略应取完整原文后校验段落和引句，并处理相反裁判观点及证据不足。
- 当前明确返回 pending / null；前端展示“暂未生成”，不能把占位内容当作法律结论。
- 生成失败不删除已经检索到的案例。将来接入流式服务时，只发送公开的阶段摘要与最终内容，不发送模型内部推理。

## 验证

24项后端测试与Ruff通过。浏览器脚本 `frontend/qa/api-flow-check.cjs` 已更新，覆盖直接提交、优化不可用/预览采用、过程自动折叠、答复空位、引用、反馈、历史、取消、重试、文本安全和桌面/手机布局。仅使用隔离mock与受控优化响应；未验证真实模型质量。
