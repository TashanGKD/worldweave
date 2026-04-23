# Source Knowledge Runtime

更新时间：2026-04-18

## 当前单一主链

现在项目的主链应该统一理解为：

1. `skillhub / source catalog` 发现候选 source skill
2. runtime 按稳定性把信源分成 `stable / watchlist / blocked`
3. 近 30 天信源完成中文化、标签化和 embedding
4. `zvec` 承担信源知识库主检索
5. 外部预测题进入题池，由主持人 / 正反 / 虾消费同一批核心证据
6. 平台结果回写，进入已结算与质量对比

一句话说：主系统已经不是“图谱”或“旧 report 流”，而是“稳定信源驱动的 zvec 知识底座”。

## 现在各模块的职责

### `src/lib/world/source-catalog.ts`

负责：

- 读取 research 中整理好的 skillhub / source catalog 产物
- 计算 `runtime-ready / context / weak-signal / blocked`
- 提供 `next_batch` 候选

### `src/lib/world/runtime.ts`

负责：

- 真实拉取世界信源
- 维护失败冷却与 source health
- 聚合 `source_knowledge` / `livebench_arena` / `state`
- 暴露 source governance

### `src/lib/world/source-knowledge.ts`

负责：

- 把 source knowledge 快照和 source catalog 治理信息合并
- 输出知识库状态接口

### `src/lib/world/livebench.ts`

负责：

- 外部题池同步
- 题目状态切分
- 证据召回
- 主持人 / 正反 / 投票 / 已结算榜单

它现在是“消费信源知识库”的层，不是信源底座本身。

## 运行时接口主线

最重要的接口现在应理解为：

- `/api/v1/world/source-knowledge/status`
- `/api/v1/world/source-knowledge/sync`
- `/api/v1/world/source-knowledge/governance`
- `/api/v1/world/livebench/questions`
- `/api/v1/world/livebench/vote`
- `/api/v1/world/state`

其中：

- `source-knowledge/*` 是底座
- `livebench/*` 是题池消费层
- `state` 是聚合读接口

## 归零时应该清什么

归零的目标不是删除研究资料，而是清掉运行时残留：

- `.cache/world-source-knowledge-state.json`
- `.cache/world-source-knowledge-graphs/`
- `.cache/world-source-knowledge-zvec/`
- `.cache/world-livebench-state.json`
- `.cache/world-livebench-graphs/`
- `.cache/world-livebench-arena-cache.json`
- 旧 graphify 残留和 tmp 文件

保留：

- world signal cache
- translation cache
- alignment cache
- research 下的 skillhub/source catalog 资料

## 稳态建议

推荐把系统拆成两种节奏：

1. 高速层

- `source-knowledge sync`
- 建议每 15 分钟跑一次
- 只做近 30 天信源增量和向量库更新

2. 低速层

- source monitoring / governance
- 建议每天 1 次
- 负责失败源降权、优质源上架、`next_batch` 更新

## 当前最重要的工程原则

- 题目不是知识库，信源才是知识库
- `zvec` 是主检索，不再依赖额外图谱主链
- `livebench` 只消费知识库，不单独发明另一套证据底座
- 运行态缓存必须允许“清零后重建”，不能再依赖旧脏状态续命

## 一句结论

这个项目现在最该守住的不是更多能力，而是更清楚的边界：

- `skillhub/source catalog -> 稳定信源 -> zvec source knowledge` 是主底座
- `livebench` 是题池消费层
- 归零应该优先清缓存和旧产物，而不是推倒研究资料
