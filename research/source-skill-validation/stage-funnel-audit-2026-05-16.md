# World stage funnel audit (2026-05-16)

Log: .cache/world-start-5022-low-info-check.out.log
Cache: .cache/world-signal-cache-low-info-check.json

## Funnel

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 167 |  |  | all rows collected before source stability |
| source stability | 95 | 72 | 43.1 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 94 | 1 | 1.1 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 54 | 40 | 42.6 | archive decision by secondary scoring |
| exact dedupe | 54 | 0 | 0 | same URL/signature |
| event clustering | 53 | 1 | 1.9 | same-event fold; clusters=1 |

## All Refresh Runs

### Run 1

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 172 |  |  | all rows collected before source stability |
| source stability | 96 | 76 | 44.2 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 94 | 2 | 2.1 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 46 | 48 | 51.1 | archive decision by secondary scoring |
| exact dedupe | 46 | 0 | 0 | same URL/signature |
| event clustering | 45 | 1 | 2.2 | same-event fold; clusters=1 |

### Run 2

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 167 |  |  | all rows collected before source stability |
| source stability | 95 | 72 | 43.1 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 94 | 1 | 1.1 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 54 | 40 | 42.6 | archive decision by secondary scoring |
| exact dedupe | 54 | 0 | 0 | same URL/signature |
| event clustering | 53 | 1 | 1.9 | same-event fold; clusters=1 |


## Final Cache

```json
{
  "total_signals": 53,
  "by_scene": {
    "technology": 40,
    "global": 2,
    "finance": 11
  },
  "by_source_group": {
    "rss-api-pool": 53
  },
  "clustered_count": 1,
  "max_related_count": 1,
  "cluster_samples": [
    {
      "title": "Anthropic 首超 OpenAI，Codex 手机端上线，Grok Build 贴脸开大 Claude Code！| AI Weekly 5.11-5.17",
      "source_name": "AI信息Gap",
      "scene": "technology",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:1",
        "event:primary-source:ai信息gap"
      ]
    }
  ]
}
```
