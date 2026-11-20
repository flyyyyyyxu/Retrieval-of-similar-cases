# Harvey / Legora 产品界面审计 · 2026-11-19

## 1. 审计范围与证据等级

本轮检查实际产品截图、使用教程、公开产品画面和可读取的视频帧。目的在于修正清案的版式、字体和状态体系，研究结果落实在根目录 [design.md](../design.md) 和 `frontend/theme.css`。

- **直接画面证据**：已打开并查看的截图/SVG/视频帧，可支持布局和相对视觉层级判断。
- **使用行为描述**：产品团队说明、大学图书馆的受控使用记录，可支持流程判断。
- **实现决策**：为清案选择的 rem、色值、圆角、断点；不声称是竞品私有 token。
- 上轮读取的官网 CSS 是营销页面实现；本轮降低其对应用工作区的指导权重。

## 2. 已查看的材料

| ID | 来源与画面 | 观察内容 | 使用边界 |
| --- | --- | --- | --- |
| H1 | [Harvey 官方设计文章](https://www.harvey.ai/blog/how-we-approach-design-at-harvey)，[执行过程图](https://cdn.sanity.io/images/07s0r5r6/production/34e58c2d7523fd9ffa346a043ceb88fe10d35320-1200x675.svg) | 白底过程轨迹、轻量文件项、局部词组 chip，步骤和细节层级明确 | 官方示意画面，不据此测量真实账号像素或执行延迟 |
| H2 | 同文[Review Tables 图](https://cdn.sanity.io/images/07s0r5r6/production/9de3021de0a872c076ca713814c40e85d61ff54e-1200x675.svg) | 文字和细线承担表格结构，彩色状态只出现在局部校验标签 | 不照搬其状态含义或建立清案未实现的审核工作流 |
| H3 | [斯坦福实际操作教程](https://ailearninghub.law.stanford.edu/harvey-ai-at-sls/documents-and-tables/)，[Vault 截图](https://ailearninghub.law.stanford.edu/assets/images/harvey-practice-vault.png) | 查询范围紧邻输入；辅助动作低强调；文件名、类型、时间、大小分层 | 页面标明观察日 2026-09-22；画面是深色主题，不据此强制清案改深色 |
| L1 | [Legora 项目首页教程](https://ailearninghub.law.stanford.edu/legora-at-sls/access-and-surfaces/)，[项目与输入截图](https://ailearninghub.law.stanford.edu/assets/images/legora-project-home-composer.png) | 标题与输入集中；输入区比首版清案紧凑；发送为黑色主动作；其他能力按需出现 | 页面标明观察日 2026-10-13；不复制多能力菜单到单一类案检索 |
| L2 | [引用操作教程](https://ailearninghub.law.stanford.edu/legora-at-sls/follow-the-citation/)，[引用分栏截图](https://ailearninghub.law.stanford.edu/assets/images/legora-citation-chain.png) | 左侧输出与右侧来源并排，小引用标记连到具体文字，顶部保留文书 Tab | 保留清案用户明确要求的多 Tab；不恢复其已否定的整段高亮框 |
| L3 | [范围选择教程](https://ailearninghub.law.stanford.edu/legora-at-sls/legal-research-scope/)，[范围层级截图](https://ailearninghub.law.stanford.edu/assets/images/legora-scope-tree.png) | 输入旁可读范围、层级选择、部分选中、独立的焦点环 | 页面标明观察日 2026-10-30；不引入国外法域或无真实库支持的来源选项 |
| L4 | [Legora Editor 产品页](https://legora.com/product/editor)，[上下文输入画面](https://framerusercontent.com/images/whb0QmOI7vajRbvFOrrrCCyfeE.png?height=1674&width=2790) | 辅助上下文占局部，输入文字和发送主动作更突出 | 有营销构图与背景，工作区只借鉴输入信息顺序 |
| V1 | Editor 页公开[演示短片资源](https://framerusercontent.com/assets/NrzuKF3OwN4NAFHQL1bVIJ1vo4.mp4) | 实际读取时长约 5.05 秒，抽看 0.5 / 2.5 / 4.0 秒；可见台上展示的文档+助手分栏 | 是舞台预览片，不是页面宣称的完整 7:01 演示；不据此推断详细操作 |

另查阅了 [Harvey Unified Assistant 演示入口](https://www.youtube.com/watch?v=FMha3RUi-g0)及 [Legora 第三方介绍视频入口](https://www.youtube.com/watch?v=QlYELRZYZ2E)。本次未获得可连续审阅的完整视频内容，不将标题/简介当作观看证据。另一个可读取的 Legora 短片是营销画面，排除出控件样式依据。

截图和视频帧仅用于本地审计，未复制到产品资源或 Git 仓库。这里保留公开来源链接，避免把临时文件路径当作长期证据。

## 3. 原版清案的问题与本轮改动

| 原版问题 | 易用度 / 美观度影响 | 对照后的修正 |
| --- | --- | --- |
| 问题、答复、列表都有明显外框 | 三个区块同等抢眼，阅读停顿过多 | 问题浅灰上下文；答复去框；参考资料细线分隔 |
| 绿案名、绿选中线、绿目录、绿图表标题 | 选中、引用、统计混在同一强调色 | 近黑操作、中性选中、灰蓝统计，颜色承担明确职责 |
| 根 Tab、每案字段、视图切换都用长下划线 | 同屏过多重复强调，尤其“可视化”像一条高亮横栏 | 主内容保留下划线；字段用小灰底；左右视图用白面分段 |
| 列表无衬线、原文宋体、品牌/数字又有其他字体 | 同一阅读流程字体性格跳变，难以形成稳定层级 | 应用统一系统无衬线，角色字号收敛为少量 rem token |
| 案名、摘要、小节和辅助字重接近 | 重点难扫读；元信息与内容争夺注意力 | 案名18/500、正文15/400、元信息13/400、小节14/600 |
| 每个原文/图表标题旁都有绿色竖条 | 装饰重复，段落与统计模块看起来同级 | 删除装饰条；只在阅读目录当前位置保留窄墨色定位线 |
| 环图厚、空白多、图例位置散 | 图形比法律资料更抢眼，数量较少时显得空 | 细环、小总数、并排图例；颜色收敛，数字对齐 |
| 地域横条直接用占比长度，样本均分时非常短 | 难比较数量差异，视觉信息弱 | 横条相对最大数量缩放；独立保留真实案件数与占比 |
| 案由树是固定宽 SVG，标签截短 | 窄屏只能看见连线，完整名称难读 | HTML 层级、父子聚合计数、完整标签自然换行 |

## 4. 哪些不能照搬

- Harvey/Legora 的模式、来源库、协作或审核入口与清案功能范围不同，不添加空按钮。
- 教程画面的高亮证明“定位到了文字”，不是对来源有效性的自动保证；清案仍遵守已有引用校验边界。
- 原始 PDF 自带衬线字体是文件内容，不能据此要求应用所有摘要和原文提取文本都用宋体。
- 当前库只有少量演示数据，图表不做全库统计暗示，也不借图表颜色表达参考等级高低。
- 报告金字塔属于可编辑/可导出的文档内容，本轮不只改屏幕颜色使导出不一致。

## 5. 本轮验收

- 7 组浏览器回归通过：新增 `product-style-check.cjs`，并通过既有检索、参考资料、工作区分栏、收藏范围、报告、UI审查六组回归。
- 实际计算值验证：案名18px > 摘要15px > 元信息13px；列表与阅读原文字体族一致。
- 选中状态验证：摘要和视图 Tab 无通栏伪元素高亮，图表标题无装饰边；键盘焦点独立保留。
- 数据验证：测试用4篇案例合并为父级4篇、两个叶级3篇/1篇；不存在虚构计数；标签正确转义。
- 窄屏与文字验证：320/390/768px 页面和案由树无横向溢出，200%文字后数量和入口保留。
- 原有搜索/筛选/收藏/原文多 Tab/报告编辑、保存及真实Word/PDF下载回归通过。
- Ruff 与55项后端测试通过；无接口、召回或排序变更。
- 应用验收使用本地 mock；真实案例库和模型效果仍按原待办联合验收。
