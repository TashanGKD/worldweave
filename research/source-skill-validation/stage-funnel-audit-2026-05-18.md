# World stage funnel audit (2026-05-18)

Log: .cache/world-start-5016-cluster-check.out.log
Cache: .cache/world-signal-cache-cluster-check.json

## Funnel

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 1035 |  |  | all rows collected before source stability |
| source stability | 930 | 105 | 10.1 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 930 | 0 | 0 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 830 | 100 | 10.8 | archive decision by secondary scoring |
| exact dedupe | 758 | 72 | 8.7 | same URL/signature |
| event clustering | 727 | 31 | 4.1 | same-event fold; clusters=18 |

## All Refresh Runs

### Run 1

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 300 |  |  | all rows collected before source stability |
| source stability | 199 | 101 | 33.7 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 199 | 0 | 0 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 115 | 84 | 42.2 | archive decision by secondary scoring |
| exact dedupe | 115 | 0 | 0 | same URL/signature |
| event clustering | 115 | 0 | 0 | same-event fold; clusters=0 |

### Run 2

| stage | remaining | removed | removed % vs previous | note |
| --- | ---: | ---: | ---: | --- |
| raw emitted | 1035 |  |  | all rows collected before source stability |
| source stability | 930 | 105 | 10.1 | per-source burst/literature/source-feed policy |
| publishable after model/low-info | 930 | 0 | 0 | model alignment plus low-info/source snapshot cleanup |
| intake scoring kept | 830 | 100 | 10.8 | archive decision by secondary scoring |
| exact dedupe | 758 | 72 | 8.7 | same URL/signature |
| event clustering | 727 | 31 | 4.1 | same-event fold; clusters=18 |


## Final Cache

```json
{
  "total_signals": 727,
  "by_scene": {
    "war": 232,
    "global": 374,
    "health": 13,
    "technology": 87,
    "finance": 18,
    "capacity": 3
  },
  "by_source_group": {
    "world-monitor": 610,
    "rss-api-pool": 95,
    "public-anchor": 4,
    "aihot": 18
  },
  "clustered_count": 18,
  "max_related_count": 5,
  "cluster_samples": [
    {
      "title": "Manhattan, New York, United States",
      "source_name": "thebusinessjournal.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:5",
        "event:source-count:6",
        "event:primary-source:thebusinessjournal-com"
      ]
    },
    {
      "title": "Democratic Republic of the Congo",
      "source_name": "World Monitor",
      "scene": "health",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:world-monitor"
      ]
    },
    {
      "title": "South Dakota, United States",
      "source_name": "www.yahoo.com",
      "scene": "global",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-yahoo-com"
      ]
    },
    {
      "title": "Broward County, Florida, United States",
      "source_name": "www.wrdw.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-wrdw-com"
      ]
    },
    {
      "title": "Abuja, Abuja Federal Capital Territory, Nigeria",
      "source_name": "www.eluniversal.com.mx",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:2",
        "event:source-count:3",
        "event:primary-source:www-eluniversal-com-mx"
      ]
    },
    {
      "title": "Franklin County, Arkansas, United States",
      "source_name": "www.4029tv.com",
      "scene": "global",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-4029tv-com"
      ]
    },
    {
      "title": "Douglas County, Colorado, United States",
      "source_name": "www.9news.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:4",
        "event:source-count:4",
        "event:primary-source:www-9news-com"
      ]
    },
    {
      "title": "Lashkar, North-West Frontier, Pakistan",
      "source_name": "www.orissapost.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-orissapost-com"
      ]
    },
    {
      "title": "South Carolina, United States",
      "source_name": "www.cbs58.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-cbs58-com"
      ]
    },
    {
      "title": "Mclennan County, Texas, United States",
      "source_name": "www.kcentv.com",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:5",
        "event:source-count:6",
        "event:primary-source:www-kcentv-com"
      ]
    },
    {
      "title": "Sydney, New South Wales, Australia",
      "source_name": "www.aurora-israel.co.il",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:1",
        "event:source-count:2",
        "event:primary-source:www-aurora-israel-co-il"
      ]
    },
    {
      "title": "Nevinnomyssk, Stavropol'skiy Kray, Russia",
      "source_name": "www.dailystar.co.uk",
      "scene": "war",
      "event_tags": [
        "event:clustered",
        "event:related-count:2",
        "event:source-count:3",
        "event:primary-source:www-dailystar-co-uk"
      ]
    }
  ]
}
```
