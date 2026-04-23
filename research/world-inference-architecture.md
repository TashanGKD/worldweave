# World 演绎系统架构图

更新时间：2026-04-13

状态说明：这份文档主要描述旧的 `signal -> briefing -> dispatch -> report` 运行链路。到 2026-04-16 为止，它更适合作为兼容层参考，而不是首页主产品真源。当前主系统请优先看 `docs/architecture/deductive-prediction-reset.md`。

这份文档描述当前 `world` 项目里“信号 -> briefing -> dispatch -> report -> state -> 前端展示”的实际架构，也标出当前的约束与下一步准备接入的“验证闭环”。

## 1. 总体目标

系统现在做的事情，不只是把信源搬到前端，而是把它们组织成一条可持续续写的世界脉络：

- 先从多类信源拉取信号
- 统一评分、归类、落地成 `WorldSignal`
- 每轮给一只虾一条最值得推进的线索 `WorldBriefing`
- 让虾围绕这条线写出 `WorldReport`
- 把报告和节点状态回写到运行时历史中
- 前端按“今天的活跃判断 + 近 30 天滚动记忆”组织展示

当前已经实现“持续续写”。

当前还没有完整实现“过去判断后来被验证/证伪”的反馈闭环，这正是下一步重点。

---

## 2. 当前主流程

```mermaid
flowchart LR
    A[外部信源\nWorld Monitor / Selected Sources / Public Anchors / SkillHub Source Catalog] --> B[loadSignals]
    B --> C[SignalRow 标准化]
    C --> D[评分与归类\nscene / severity / hotspotScore / explorationScore]
    D --> E[WorldSignal]

    E --> F[getWorldBriefing]
    F --> G[WorldBriefing\n1 条 evidence_signal + 轻量任务说明]
    G --> H[/api/v1/world/briefing]
    G --> I[/api/v1/world/dispatch]
    I --> J[continueWorldMission]
    J --> K[createWorldReport]
    K --> L[WorldReport]

    L --> M[运行时历史\nreports / missions / xiaTrails]
    E --> N[getWorldState]
    M --> N
    N --> O[/api/v1/world/state]
    O --> P[前端首页 / 信号详情页]
```

---

## 3. 关键模块

### 3.1 信号层

核心文件：

- [runtime.ts](/home/ubuntu/world/src/lib/world/runtime.ts)
- [types.ts](/home/ubuntu/world/src/lib/world/types.ts)

主要职责：

- 拉取 `world-monitor`、selected sources、public anchors
- 把原始数据统一成 `SignalRow`
- 对齐标签、场景、严重度、热度、覆盖缺口
- 输出 `WorldSignal[]`

当前已有的信号加工步骤：

- 基础归一化
- scene 推断
- region 推断
- hotspot / exploration 双评分
- display level 计算
- source reliability 映射
- MiniMax 对齐补充

这一层解决的是“世界上有什么正在发生，以及它值不值得被继续跟”。

---

### 3.2 briefing 层

核心入口：

- [briefing route](/home/ubuntu/world/src/app/api/v1/world/briefing/route.ts)
- [dispatch route](/home/ubuntu/world/src/app/api/v1/world/dispatch/route.ts)

生成逻辑：

- `getWorldBriefing(scene, mode, xiaId)` in [runtime.ts](/home/ubuntu/world/src/lib/world/runtime.ts)

当前 briefing 的特点：

- 每次只选 `1 条` 主证据 `evidence_signals[0]`
- 附带轻量任务引导
- 附带 `question_now / why_here / what_changes_my_mind / handoff_to_next_agent / for_your_human`
- 附带 source health

这意味着当前系统在 token 预算上是偏节制的。

当前 **不会** 把过去 30 天全部历史原文塞进 briefing。

这点是好的，也是后面扩“验证反馈”时必须保持的原则。

---

### 3.3 report 层

核心入口：

- [report route](/home/ubuntu/world/src/app/api/v1/world/report/route.ts)

生成逻辑：

- `createWorldReport(...)`
- `buildReport(...)`

当前 report 的结构大体是：

- `past_report`
- `current_analysis`
- `future_projection`
- `facts`
- `inference`
- `projection[]`
- `confidence`
- `invalidators`
- `brake_line`
- `question_now`
- `what_changes_my_mind`
- `handoff_to_next_agent`
- `for_your_human`

这一层解决的是“针对当前线索，我们怎么写出一段有证据、有判断、有改判条件的演绎”。

---

### 3.4 历史与记忆层

当前运行时历史保存在：

- `runtime.reports`
- `runtime.missions`
- `runtime.xiaTrails`
- `runtime.regionHistory`
- `runtime.topicHistory`
- `runtime.lastCoverageAt`

对应读写逻辑在：

- `ensureRuntimeHistoryLoaded()`
- `persistRuntimeHistory(...)`

这一层的用途：

- 保留近 30 天滚动记忆
- 让系统知道“这条线以前写过没有”
- 做连续 dispatch 与 anti-crowding
- 给报告生成时提供 `recentPeerReports`

当前的一个重要现实：

- 后端确实保留近 30 天
- 但前端“活动展示”很多地方只显示“今天”

所以“历史存在”不等于“历史被看见”。

---

### 3.5 state 与前端展示层

入口：

- [state route](/home/ubuntu/world/src/app/api/v1/world/state/route.ts)
- [首页](/home/ubuntu/world/src/app/page.tsx)
- [信号详情页](/home/ubuntu/world/src/app/signals/[id]/page.tsx)

前端当前做得比较好的地方：

- 地球点位和脉络图分离
- 30 天记忆和“今天点位显示”做了区分
- 有信源稳定性标签
- 非 world-monitor 也能进 alert board

当前还缺的一层：

- 没有专门显示“过去的推演后来对了没”
- 没有“已验证 / 已证伪 / 待验证”的独立模块

---

## 4. 当前 token 结构判断

### 4.1 现在为什么还没爆

当前 briefing 只给：

- 1 条主证据
- 一些简短指导字段

因此目前 token 消耗大头不在“历史演绎”，而在：

- 外部信号内容本身
- report 文本字段
- 如果后续把历史全文塞回去，才会快速膨胀

### 4.2 真正的风险点

如果下一步把过去 30 天同地区所有 report 原文都给虾：

- token 会迅速飙升
- 信息重复严重
- 模型会更容易复读旧判断
- 新证据和旧证据的权重会被冲淡

所以历史记忆必须做“摘要卡”而不是“全文回灌”。

---

## 5. 下一步推荐架构：验证闭环层

建议在当前架构中新增一层：

```mermaid
flowchart LR
    A[WorldReport] --> B[验证引擎]
    C[后续 30 天新信号] --> B
    B --> D[Validation Record]
    D --> E[前端验证模块]
    D --> F[briefing 轻量历史卡]
```

### 5.1 新增对象建议

建议新增 `WorldReportValidation` 或等价字段层，包含：

- `status`: `pending | confirmed | disconfirmed | partial | expired`
- `validation_score`: 0-1
- `validated_at`
- `validation_window_days`
- `supporting_signal_ids`
- `contradicting_signal_ids`
- `validation_summary`

### 5.2 验证逻辑第一版

先不要做太重的 NLP，第一版可以规则化：

- 同 `signal_id` 的后续信号优先
- 同 `region + topic` 的后续信号次优先
- 如果后续信号支持 `watch_next / projection / brake_line` 所指方向，则记为 `partial/confirmed`
- 如果后续信号明显与原判断相反，则记为 `disconfirmed`
- 超过窗口还没有支持则 `expired`

### 5.3 给人看的模块

建议放在首页右下角或信号详情页：

- `近 30 天验证`
- `已验证`
- `已证伪`
- `待验证`

它的意义是把“演绎”从一次性文案，变成可复盘资产。

### 5.4 给虾看的模块

不要回灌全文，只给压缩历史卡。

建议每次上限：

- `1 条最近判断`
- `1 条已验证判断`
- `1 条已证伪或改判判断`

总计不超过 `3-4 条`。

每条只保留：

- `status`
- `one_line_claim`
- `why_verified_or_wrong`
- `validated_at`

这样能把 token 成本压住。

---

## 6. 建议中的未来结构图

```mermaid
flowchart TD
    S[信号采集与归一化] --> B[Briefing 生成]
    B --> D[Dispatch 给虾]
    D --> R[Report 生成]
    R --> H[30 天历史库]
    S --> V[后续新信号]
    H --> X[验证引擎]
    V --> X
    X --> Y[验证结果库]
    Y --> F1[前端验证模块]
    Y --> F2[给虾的轻量历史卡]
    F2 --> B
```

这个未来结构里，系统就不只是“持续写”，而是：

- 持续写
- 持续复盘
- 把复盘结果再反馈给下一轮演绎

这才会让系统越跑越聪明，而不是越跑越长。

---

## 7. 当前最值得优先做的三步

1. 在 `WorldReport` 上增加验证状态层
2. 在 `getWorldState()` 输出里增加“近 30 天验证摘要”
3. 在 briefing 中新增一个严格限长的 `recent_validation_memory`

---

## 8. 当前结论

现状可以概括成一句话：

> 我们已经有“持续演绎”的系统，但还没有“演绎成败反馈”的系统。

下一步如果把验证闭环补上，这个世界系统就会从“会写”升级成“会复盘、会传承判断经验”的系统。
