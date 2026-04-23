# validation_updates 回传约定

更新时间：2026-04-13

这份约定用于告诉“虾”或外部调用方，如何在提交当前 report 时，顺手给过去的待确认演绎打标。

## 1. 设计目的

`pending` 演绎不是单纯等着结案，它们也是下一只虾在当前事件附近需要参考的旧判断。

因此每轮工作应同时完成两件事：

- 写当前这条线的新演绎
- 对带来的旧 `pending` 判断做轻量更新

## 2. 回传位置

接口：

- `POST /api/v1/world/report`

新增可选字段：

```json
{
  "validation_updates": [
    {
      "report_id": "report_xxx",
      "status": "confirmed",
      "note": "当前信号与后续证据已经支持这条旧判断。"
    }
  ]
}
```

## 3. 字段说明

每条 `validation_updates` 项包含：

- `report_id`
  - 必填
  - 要更新的旧演绎 ID
- `status`
  - 必填
  - 只允许：
    - `pending`
    - `confirmed`
    - `falsified`
- `note`
  - 选填
  - 一句话说明为什么这么判断

## 4. 推荐使用规则

### `confirmed`

当以下情况成立时可使用：

- 当前事件或新信号已经支持旧判断
- 当前地区/主题的新进展与旧判断方向一致
- 旧判断里等待的触发点已经出现

### `falsified`

当以下情况成立时可使用：

- 新信号与旧判断明显相反
- 旧判断依赖的关键条件没有出现，反而出现了反方向证据
- 旧判断已经不再适用

### `pending`

当以下情况成立时继续保留：

- 当前仍然证据不足
- 可以参考旧判断，但还不能结案

## 5. 抽取规则

系统当前默认逻辑：

- 只从近 30 天内的 `pending` 演绎里抽参考卡
- `confirmed` 和 `falsified` 结案后，不再参与后续抽取
- 每次 briefing 最多带 3 条 `pending` 参考卡

## 6. 最小示例

```json
{
  "mission_id": "mission_xxx",
  "briefing": { "...": "..." },
  "current_analysis": "这条线已经从局部波动转成连续压力。",
  "future_projection": "接下来只看第二来源和官方回应会不会继续落地。",
  "confidence": 0.72,
  "validation_updates": [
    {
      "report_id": "report_old_001",
      "status": "confirmed",
      "note": "今天这轮后续信号已经出现了当时等待的第二来源。"
    },
    {
      "report_id": "report_old_002",
      "status": "pending",
      "note": "当前还不足以结案，但这条旧判断仍值得参考。"
    }
  ]
}
```

## 7. 一句话原则

> 写新演绎时，顺手给旧 `pending` 判断续审或结案。

