# World Skill Output Contract v2

更新时间：2026-04-14

目标：让虾的输出能够直接进入业务知识图谱，不需要第二层模型再解释一次。

## 必填核心

- `past_report`
- `current_analysis`
- `future_projection`
- `facts`
- `inference`
- `projection`
- `confidence`
- `invalidators`

## 新增关系字段

这些字段建议模型在“有把握时”显式给出。

- `thread_parent_report_id?: string`
  这次主要接续哪条旧演绎。
- `thread_relation?: "continue" | "upgrade" | "downgrade" | "branch" | "revise" | "echo"`
  这次和旧演绎的关系类型。
- `validation_target_report_ids?: string[]`
  本轮顺手验证、证伪或继续保留 pending 的旧演绎 ID。
- `projection_links?: Array<{ projection_index: number; fact_indices: number[]; invalidator_indices?: number[] }>`
  某条推演和哪些事实、哪些失效条件对应。

## 关系字段的使用规则

- 如果明显是在接一条旧演绎，尽量写 `thread_parent_report_id`。
- 如果只是泛泛参考历史，没有明确接续对象，可以不写 `thread_parent_report_id`。
- `thread_relation` 只能从下面 6 个值里选：
  - `continue`
  - `upgrade`
  - `downgrade`
  - `branch`
  - `revise`
  - `echo`
- 如果本轮已经判断某些旧演绎更接近 confirmed / falsified / pending，就同时写：
  - `validation_target_report_ids`
  - `validation_updates`

## 推荐判断标准

- `continue`
  旧判断基本延续，这次只是往前推进。
- `upgrade`
  新证据让风险、强度或确定性上升。
- `downgrade`
  新证据让风险、强度或确定性下降。
- `branch`
  还是同一区域或同一脉络，但已经分出新方向。
- `revise`
  不是简单升降，而是对旧判断框架做修正。
- `echo`
  更像旧主题的回响，不足以形成真正续写。

## 最小 JSON 示例

```json
{
  "past_report": "我这次要判断的是，这条线是在续压旧风险，还是已经出现改判证据。",
  "current_analysis": "我的看法是，这次更接近升级前夜，但还差第二来源或官方回应。",
  "future_projection": "接下来 24-72 小时只看第二来源、官方表态和相邻地区是否同步抬头。",
  "facts": [
    "地点和旧脉络一致。",
    "强度比上次高。",
    "原始链接仍可回看。"
  ],
  "inference": "这不是孤立回响，而是旧脉络上的续压。",
  "projection": [
    {
      "title": "升级确认",
      "summary": "如果再出现第二来源或官方回应，就把判断上调为升级。",
      "confidence": 0.72,
      "assumptions": ["当前信号不是单点误报"],
      "invalidators": ["后续 48 小时没有任何第二来源跟进"]
    }
  ],
  "confidence": 0.72,
  "invalidators": [
    "后续 48 小时没有任何第二来源跟进"
  ],
  "thread_parent_report_id": "report_xxx",
  "thread_relation": "upgrade",
  "validation_target_report_ids": ["report_xxx"],
  "projection_links": [
    {
      "projection_index": 0,
      "fact_indices": [0, 1],
      "invalidator_indices": [0]
    }
  ]
}
```
