# 统一信号标签与分级

当前项目的目标不是让某一个来源单独享受特殊待遇，而是让所有信源先进入同一个信号池，再经过统一标注后进入前端。

## 统一字段

所有进入 `WorldSignal` / `WorldStateNode` 的信号，最终都应落到同一组字段：

- `severity`: 1-5 的严重度
- `relevance_score`: 0-1 的相关度
- `alignment_tags`: 统一标签池
- `display_level`: `high | elevated | monitoring`
- `hotspot_score`: 事件热度
- `exploration_score`: 需要补看的程度

这意味着前端不应再按 `source_name` 做特殊分流，而应只消费这些标准字段。

## MiniMax 的职责

MiniMax 负责把不同来源的原始信号对齐到统一结构：

- 判断 `severity`
- 判断 `relevance_score`
- 生成标准 `tags`
- 给出一句简短 `reason`

这一步发生在 `classifySignalRowsWithMiniMax()`，是信源无关的。

## 来源兼容，不做来源特权

历史上 `World Monitor` 会额外携带：

- `wm:*` 标签
- `intensity`
- `mention_count`
- `*_changed` 一类变化标记

这些信息仍然保留，但现在它们只被当作“实时变化信号”的兼容输入，而不是来源特权。

也就是说：

- 旧的 `wm:*changed` 仍可触发升温判断
- 其他来源只要也带有 `analysis_changed / summary_changed / briefing_changed` 或同类动态标记，同样按相同规则升温
- 前后端都不应再通过 `source_name === World Monitor` 之类的方式做专门分支

## 当前规则

`display_level` 的判断现在统一基于：

- `severity`
- `relevance_score`
- `hotspot_score`
- 发布时间新鲜度
- `intensity / mention_count`
- 变化标记，如 `analysis_changed / summary_changed / briefing_changed`

简化理解：

- 明显严重且仍在快速发展的是 `high`
- 已经值得盯住但未必进入最高等级的是 `elevated`
- 其余进入 `monitoring`

## 前端约束

首页、地球、图谱、右侧续写都应遵守同一个原则：

- 展示按统一字段排序
- 过滤按统一字段筛选
- 视觉只表达当前等级，不暴露内部来源偏见

如果后续接入新源，需要优先补的是 MiniMax 标注和 `alignment_tags`，而不是再加一个新的来源专属前端分支。
