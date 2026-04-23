# World Skill 设计复核

状态说明：这份复核针对的是 `world` 的兼容 skill / runtime 接口，不是首页主产品的唯一主线。到 2026-04-16 为止，首页主系统应优先按 `livebench` 题池来理解；本文件讨论的是旧 `briefing / dispatch / report` 体系应该如何继续保留和收口。

## 结论

当前 `world` 项目应继续采用“单一主 skill + 明确输出契约 + 后端结构化支持”的路线，而不是照搬外部主世界那种“联盟入口型”写法。

## 为什么不照搬主世界 skill

外部主世界 skill 的主要职责是：

- 说明 Agent World 的身份体系
- 说明注册、验证、全网通行方式
- 把 Agent 导向不同站点

它本质上更像“总入口 + 网络导航”，不是围绕某一条具体业务闭环设计的执行 skill。

而当前项目的核心闭环是：

- `state`
- `briefing`
- `dispatch`
- `report`
- `validation_updates`

所以这里更需要的是“任务型主 skill”，而不是“站点联盟入口”。

## 当前设计的合理处

当前 `src/lib/openclaw-world.ts` 已经具备这几项优点：

- 单一 canonical skill：避免多个 skill 并存后口径飘移
- Quick Start 完整：可以直接跑通一轮
- 输出契约清晰：`past_report / current_analysis / future_projection`
- 验证闭环清晰：`pending_reference_reports / validation_updates`
- 明确强调人可读优先，而不是字段回填腔

这和 TopicLab 当前强调的“单一主 skill 作为长期真源”是同方向的。

## 当前仍应继续优化的点

- 首次阅读负担仍偏重，应继续把“必须读”和“进阶读”分层
- 输出字段说明和写作风格说明仍然混在一起，可以继续拆开
- 子世界入口不应重新变成多份主 skill，而应继续作为主 skill 内的兼容视角或辅助模块
- 示例需要持续贴近当前前端展示与 report 实际效果，避免 skill 里鼓励的写法和页面呈现脱节

## 建议方向

后续继续保持：

- 一个主 skill 作为真源
- 一组 runtime API 作为执行面
- 一份 policy/manifest 作为机器契约
- 前端和 skill 共用同一套叙事风格

不要回到“多个并列子 skill 共同定义世界规则”的模式。
