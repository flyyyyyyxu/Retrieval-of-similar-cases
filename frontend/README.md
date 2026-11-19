# 清案前端

原生 HTML / CSS / JavaScript ES Modules，无构建步骤。沿用墨绿与暖白界面，通过 `api.js` 调用同源 FastAPI 服务，不再读取前端虚构案例或拼装文书。

## 运行

在仓库根目录配置 `.env` 后运行 `./scripts/dev.sh`，访问 http://127.0.0.1:8000 。前端依赖同源 `/api`，不能双击 HTML 或单独使用静态服务器完成检索。`CASE_SOURCE=mock` 使用后端虚构样例；模型 Key 留空时使用规则方式，接口保留降级状态。

## 页面和接口

- `#/`：产品入口和民间借贷示例输入。
- `#/search`：单一类案检索输入框，左下角可选“问题优化”、右下角直接提交。不展示解析/确认页。
- 输入框下方可选地域、起止年份、法院层级。手选范围在召回前生效；手选年份作为完整区间覆盖自动提取的年份，支持仅限起始/截止。修改问题、失败重试和历史回填保留范围；新建检索重置。
- 问题优化：`POST /api/query/optimize`，仅在点击时调用，优化结果先预览，不自动替换或检索；不可用时保留原文。
- `#/results`：内部提取检索线索后调用 `POST /api/search`。问题下方展示真实接口阶段的处理摘要；完成后自动收起，可重新展开。这里不展示模型内部推理，也不用定时器模拟进度。
- 综合答复：`POST /api/search/answer` 返回 `conclusion` 与 `judicial_view`，前端在同一段落内呈现，两部分均需有已核验引用。当前策略预留返回 pending，只展示空位，不生成预设法律观点。
- 案例对照：点击时调用 `POST /api/cases/{id}/explain`，原生 dialog 右侧抽屉展示；仅显示有已核验引用的内容，可提交相关性反馈。
- 定位原文：普通点击在右侧分栏打开；多篇文书保留顶部 Tab 与各自滚动位置，可关闭当前文书或收起整栏。纵向目录可收起，正文按案件标题、元信息、案由、文书抬头、部分标题分层；不显示内部段落ID、整段高亮框、全屏阅读或复制引用按钮。手机采用整屏阅读布局；独立正文路由仍可作为深链兼容入口。
- 案件摘要：`CaseDetail.content_sections` 决定可见分栏，缺失项不补齐；`null` 暂按可识别原文段落展示，`[]` 不展示摘要。典型案例由数据源明确返回 `source_type="typical"` 后显示标签并优先排列。
- 过滤条件：`GET /api/search/{search_id}/filters` 获取选项，`POST /api/search/filter` 提交12类条件；当前只筛选本次已返回的案例快照。列表/可视化左右切换，图表统计当前筛选结果。
- `#/case/{id}/{paragraph_id}`：`GET /api/cases/{id}` 返回的真实段落结构，目录、引用定位、收藏与复制引用。段落 ID 不再是旧原型的数字索引。
- `#/history`：最多20次本地检索快照；恢复快照不会重新查询。不同数据模式的记录不混用。
- `#/saved`：按收藏夹查看当前模式的收藏元信息，支持新建收藏夹；收藏弹窗必须选择收藏夹，可新建、调整归属或取消收藏。相关案例保留收藏和加入报告两个独立按钮。旧收藏自动归入默认收藏夹，收藏夹保存在当前浏览器；全文与解释仅保存在内存中。
- `#/reports` / `#/reports/{id}`：我的报告和在线编辑。相关案例可加入报告篮，生成图标显示数量；保存后可继续编辑，Word/PDF下载使用最新保存内容。详见 `docs/retrieval-reports.md`。

历史和收藏保存在当前浏览器。存储失败会提示；旧原型的历史与收藏不导入，避免与后端结果混淆。来源字段缺失时不补造。引用法规从 `CaseDetail.law_references` 读取，提供法规名称、版本、机构、发布/实施日期、条文与引用案例；没有数据时展示空状态。详见 `docs/result-library-2026-11-19.md`。

## 代码边界

```text
app.js              事件、请求编排与页面协调
api.js              唯一 HTTP 入口，支持取消请求
router.js           hash 路由与编码
store.js            状态、收藏和结果快照
ui.js               文本转义、图标和状态文案
views/              首页、输入、结果、正文、历史/收藏
components/         工作区、筛选、案例卡片、解释抽屉
styles.css          沿用原型视觉
integration.css     API 流程与通用样式
search-flow.css     直接检索输入框、问题优化、处理进度和综合答复
result-library.css  相关案例/引用法规Tab、分栏、批量操作与法规条文列表
workspace-panels.css 原文阅读分栏、过滤浮层、列表/可视化与图表布局
```

后端契约以 `backend/app/schemas.py` / `docs/openapi.json` 为准。错误不会自动切换到虚构结果。`replay` 的完整性限制见 `docs/review-2026-11-18.md`。

## 验证

使用隔离的 mock 后端，不调用付费模型、不连接内网；不要在含真实数据的服务上执行清空历史等验收操作。

```sh
# backend/ 中启动，环境变量显式覆盖 .env
ANTHROPIC_API_KEY='' CASE_SOURCE=mock RERANK_URL='' DB_PATH=/tmp/qingan-qa.db \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8027

# 仓库根目录；先安装 Playwright，或指定已安装的 PLAYWRIGHT_MODULE 路径
QINGAN_URL=http://127.0.0.1:8027 node frontend/qa/api-flow-check.cjs
QINGAN_URL=http://127.0.0.1:8027 node frontend/qa/reference-library-check.cjs
QINGAN_URL=http://127.0.0.1:8027 node frontend/qa/workspace-panels-check.cjs
QINGAN_URL=http://127.0.0.1:8027 node frontend/qa/report-check.cjs
QINGAN_URL=http://127.0.0.1:8027 node frontend/qa/scope-reader-favorites-check.cjs
```

脚本默认使用本机 Chrome；可通过 `CHROME_PATH` 指定浏览器。截图写入 `frontend/qa/`（Git 忽略）。覆盖内部解析、直接检索、优化预览/不可用回退、进度自动收起、答复空位、解释、引用、反馈、历史、重试、取消与响应式布局。优化成功及未来答复策略使用受控响应验证，不调用付费模型。

reference-library、workspace-panels脚本还覆盖法规版本、批量操作、多文书 Tab/滚动恢复、可选摘要、典型案例优先、12类过滤及当前结果图表。典型标记、摘要与法规版式使用受控响应验证，不修改正式 mock 文书，不代表已完成内网字段映射。

报告验收会在隔离mock服务上生成保存记录，并将实际下载的Word/PDF放入qa/report-generated/（Git忽略）；不要在真实数据服务运行这些验收脚本。

`qa/` 中旧的 inspect/anchor/visual/refinement 脚本是纯原型阶段的参考，不作为当前 API 版验收入口。
