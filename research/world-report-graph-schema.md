# World Report -> Graph Schema

更新时间：2026-04-14

目标：不额外增加一层大模型推导，尽量直接使用当前虾的结构化输出，把 `signal / report / validation` 写成持续增长的业务图谱。

## 1. 当前已经能直接落图的字段

这些字段已经存在于 `WorldReport`，可以直接映射成节点、属性或边。

### 1.1 标识与归属

- `report_id`
  用作演绎节点主键。
- `mission_id`
  用作一次任务批次或一次观察会话的归属标识。
- `signal_id`
  直接把演绎节点挂到对应事件节点上。
- `xia_id`
  用作“由哪只虾写出”的作者或观察者属性。

### 1.2 空间与场景

- `scene`
  直接挂到场景节点，例如 `global / war / finance`。
- `region`
  直接挂到地区节点。
- `topic`
  主题规范 key，可作为主题节点的稳定 key。
- `topic_label`
  主题展示名。

### 1.3 演绎主体

- `facts: string[]`
  可直接拆成多个事实节点，边类型为 `report-supports-fact`。
- `inference`
  可直接作为“判断节点”或演绎节点正文。
- `projection: WorldProjection[]`
  每一条 projection 都已经是结构化对象，包含：
  - `title`
  - `summary`
  - `confidence`
  - `assumptions`
  - `invalidators`
- `confidence`
  可直接作为演绎节点总置信度。
- `invalidators: string[]`
  可直接拆成“证伪条件”节点。
- `brake_line`
  可作为主要刹车线属性。

### 1.4 任务语义

- `question_now`
  可作为本轮演绎的入口问题。
- `why_here`
  可作为“为什么落在这里”的说明属性。
- `why_now`
  可作为“为什么现在值得看”的说明属性。
- `watch_next`
  可拆成“下一观察点”节点。
- `signal_stage`
  可作为阶段标签。
- `report_kind`
  可作为演绎类型标签。
- `report_kind_note`
  可作为演绎类型说明。

### 1.5 验证闭环

- `validation_status`
  直接形成验证状态节点或演绎节点状态。
- `validated_at`
  验证时间。
- `validation_note`
  验证说明。
- `validated_by_xia_id`
  哪只虾做了验证更新。
- `validation_signal_id`
  用哪个后续 signal 触发了验证。
- `validation_updated_at`
  验证状态最后更新时间。

### 1.6 时间

- `created_at`
  演绎节点产生时间。

## 2. 当前就能稳定生成的图谱结构

在不增加任何新字段的情况下，当前已经可以稳定生成下面这套图。

### 2.1 主链

- `scene -> region`
- `region -> signal`
- `signal -> report`
- `report -> validation`

### 2.2 演绎内部子结构

- `report -> fact`
- `report -> inference`
- `report -> projection`
- `projection -> assumption`
- `projection -> invalidator`
- `report -> watch_next`

### 2.3 归档与过滤维度

- 按 `scene` 过滤
- 按 `region` 过滤
- 按 `topic / topic_label` 聚类
- 按 `xia_id` 看不同虾的观察链
- 按 `validation_status` 看待确认 / 已验证 / 已证伪
- 按 `created_at` 和 `validated_at` 看时间推进

### 2.4 现有字段可派生的关系

下面这些关系虽然不是显式字段，但只靠当前结构就能相对稳地派生：

- 同一 `signal_id` 的 report 之间，可连 `same-signal-followup`
- 同一 `region + topic` 的 report 之间，可连 `same-thread-followup`
- `validation_signal_id -> report`
  表示“这个后续事件验证了/证伪了该演绎”
- 同一 `xia_id` 的 report 之间，可连 `same-observer-chain`

## 3. 当前不够稳的部分

下面这些不是完全做不到，而是如果只靠现有字段，容易出现歧义。

### 3.1 演绎之间的精确关系类型

现在我们能知道“是相关续写”，但不稳定知道它到底是：

- 延续
- 升级
- 降级
- 分叉
- 修正
- 重复回响

这类关系如果没有明确字段，只能靠文本猜，容易漂。

### 3.2 事实与推演之间的精确支撑关系

当前有：

- `facts[]`
- `projection[]`

但还没有显式字段说明：

- 哪几个 fact 支撑哪条 projection
- 哪个 invalidator 对应哪条 projection

如果后面要做“点击一条推演，只高亮它的支撑事实”，这里会不够细。

### 3.3 与旧演绎的明确引用

当前可以通过：

- 同 `signal_id`
- 同 `region + topic`

来近似判断“接的是旧脉络”，但没有显式字段说明：

- 这次具体接的是哪一条旧 report

所以“虾参考了过去哪些演绎”这件事，目前只能近似，不够硬。

## 4. 最小缺失字段集

如果后面要通过 skill 收紧输出，我建议只补这几个最小字段，不再额外引入第二层模型。

### 4.1 必补优先级 P0

- `thread_parent_report_id?: string`
  明确这次演绎主要接续哪条旧演绎。
- `thread_relation?: "continue" | "upgrade" | "downgrade" | "branch" | "revise" | "echo"`
  明确这次和旧演绎是什么关系。
- `validation_target_report_ids?: string[]`
  如果这次同时对多个旧演绎做验证/证伪，明确目标。

### 4.2 建议补充优先级 P1

- `projection_links?: Array<{ projection_index: number; fact_indices: number[]; invalidator_indices?: number[] }>`
  把某条 projection 和哪些 facts / invalidators 对上。
- `primary_entities?: string[]`
  本次演绎涉及的核心实体，便于图谱去地名化。
- `spillover_regions?: string[]`
  如果存在跨区外溢，直接给出目标区域。

## 5. 建议的收紧原则

如果后面通过 skill 约束虾输出，我建议只加这三个原则：

- 先保留当前 `WorldReport` 主体结构，不重做大 schema。
- 只补“关系字段”，不要补新的长文本段落。
- 任何新字段都必须让前端图谱能直接用，不增加二次解释层。

## 6. 结论

结论很明确：

- 当前 `WorldReport` 已经足够支撑第一版业务知识图谱。
- 第一版完全不需要额外大模型推导。
- 真正缺的不是“再解释一遍 report”，而是少量关系字段。
- 所以后续最优路线是：先按现有字段直接建图，再通过 skill 只补 `parent / relation / validation_target` 这一小组字段。
