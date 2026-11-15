# 纸上赶稿 · 需求与产品逻辑

这是「纸上赶稿」同人制品 DDL 倒推日历的独立文档目录。**仅主催使用**，其他参与者的信息由主催录入；项目不包括销售、库存和经营管理。

## 文档

- [产品逻辑总规范 v1.0](PRODUCT_LOGIC_v1.0.md) — 完整梳理：活动、制品、五种模板、参与者及个人进度、交稿节点/提前提醒、下印和物流倒排、三种日历视图、数据记录、v0.3.1 已知问题、15 组验收案例、尚待确定的事项。
- [排程引擎技术研究 v0.1](SCHEDULING_ENGINE_RESEARCH_v0.1.md) — P0 日期与依赖修正：倒排最晚允许日、顺推预计完成日、实际历史、约定交稿、延期诊断与 17 项独立测试结果。

**当前状态**：讨论用设计基线，并非已经实现的程序标准。文档内明确区分「已确定」「建议规则」「待决定」「现有缺陷」。下轮先确认原则，再修正日期算法及开发。
- [P0 JavaScript 排程实验及只读诊断](../../projects/fandom-ddl-calendar/p0/README.md) — 33 项单元测试、5 类旧模板适配，尚未替换正式日历。
- [v0.4 alpha｜P0 集成验证版](../../projects/fandom-ddl-calendar/v0.4-alpha/README.md) — 新建独立浏览器数据区、引入双向日期计算、原计划基线、约定交稿与实际完成记录；仍为测试版，不覆盖旧版。
- [P1 催稿与返修逻辑 v0.1](P1_FOLLOWUP_LOGIC_v0.1.md) — 联系历史、交稿状态、持续提醒、返修轮次与日期计算规则。

- [v0.6 信息架构与我的进度规则](INFORMATION_ARCHITECTURE_v0.6.md) — 合并日历、个人进度、待提醒与未来 14 天；明确不做自动发消息和旧数据迁移。
- [v0.6 Alpha 网页原型](../../projects/fandom-ddl-calendar/v0.6-alpha/README.md) — 独立新版本，不覆盖此前文件。
- [v0.7 交互重整与验收清单](INTERACTION_REDESIGN_v0.7_PLAN.md) — 恢复日历「全部 / 主催 / 我的」筛选、移除日历「今天」、明确四类卡片点击、个人进度与双列导航，以及 UI01–UI21 的测试标准。
- [v0.7 Alpha 可运行网页与说明](../../projects/fandom-ddl-calendar/v0.7-alpha/) — 日历筛选恢复、移除无效“今天”、日期弹窗按筛选显示、四色任务点击与双列导航修订。
- [v0.7 全交互与交叉流程审计（2026-11-15）](INTERACTION_AUDIT_v0.7_2026-11-15.md) — 61 个事件分发分支梳理，54 项交互/交叉测试（42 通过、12 未达预期），按优先级列出需修复问题及复现步骤。
- [v0.8 Alpha 修复记录](../../projects/fandom-ddl-calendar/v0.8-alpha/FIXES_v0.8.md) — v0.7 审计问题的修复范围、实际结果与验证边界。

- [水墨冷峻 UI v0.9](../../projects/fandom-ddl-calendar/v0.9-ink/README.md) — 在 v0.8 逻辑不变前提下的独立水墨风格界面；[直接查看 HTML](../../projects/fandom-ddl-calendar/v0.9-ink/index.html)。
