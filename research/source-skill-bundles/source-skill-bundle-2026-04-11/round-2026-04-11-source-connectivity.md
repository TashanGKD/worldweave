# 2026-04-11 信源链接提取与中国互联网可连通性测试

## 本轮目标

把当前高价值信源 skill 中已经能落到具体 URL 的源站、RSS、API 和公告入口抽出来，并在当前环境里做一次批量可达性实测。

## 判定方法

1. 用脚本直接对每条 URL 发起真实 `GET` 请求，而不是只看文档说明。
2. `200-399` 归为 `direct`；`4xx/5xx` 归为 `unstable`；超时、DNS、TLS、连接重置归为 `blocked_or_unknown`。
3. 这代表当前出口环境下的实测结果，可作为中国网络代理判断，但不是全国全运营商的绝对结论。

## 本轮汇总

- 共提取并探测 `281` 条具体信源链接
- `direct`: `194`
- `unstable`: `72`
- `blocked_or_unknown`: `15`

## 直接可达样本

- `Reddit public search JSON`: `https://www.reddit.com/search.json?q=openai&sort=relevance&t=month&limit=1` (`200`, `1148.2ms`, 来自 `last30days-skill`)
- `X`: `https://x.com/` (`200`, `1239.7ms`, 来自 `last30days-skill`)
- `Polymarket public search API`: `https://gamma-api.polymarket.com/markets?limit=1` (`200`, `797.1ms`, 来自 `last30days-skill`)
- `Hacker News item page`: `https://news.ycombinator.com/item?id=1` (`200`, `1466.9ms`, 来自 `last30days-skill`)
- `YouTube`: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (`200`, `1111.8ms`, 来自 `last30days-skill`)
- `TikTok`: `https://www.tiktok.com/` (`200`, `3036.0ms`, 来自 `last30days-skill`)
- `Instagram`: `https://www.instagram.com/` (`200`, `985.9ms`, 来自 `last30days-skill`)
- `arXiv API`: `https://export.arxiv.org/api/query?search_query=all:llm&start=0&max_results=1` (`200`, `1379.1ms`, 来自 `Scientify`)

## 不稳定或疑似受限样本

- `ScrapeCreators Reddit API`: `https://api.scrapecreators.com/v1/reddit` (`404`, `1423.7ms`, 来自 `last30days-skill`)
- `Bluesky public search API`: `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=openai&limit=1` (`403`, `850.4ms`, 来自 `last30days-skill`)
- `Truth Social search API`: `https://truthsocial.com/api/v2/search?q=openai` (`403`, `787.4ms`, 来自 `last30days-skill`)
- `SEC company_tickers`: `https://www.sec.gov/files/company_tickers.json` (`403`, `1277.4ms`, 来自 `xvary-stock-research`)
- `SEC EDGAR Search`: `https://www.sec.gov/edgar/search/` (`403`, `786.7ms`, 来自 `researchers-financial`)
- `Financial Times Markets`: `https://www.ft.com/markets` (`403`, `1007.5ms`, 来自 `researchers-financial`)
- `Bloomberg Markets`: `https://www.bloomberg.com/markets` (`403`, `1388.4ms`, 来自 `researchers-financial`)
- `Finnhub Quote API`: `https://finnhub.io/api/v1/quote?symbol=AAPL` (`401`, `1035.7ms`, 来自 `finnhub-api`)
- `Reuters World RSS`: `https://feeds.reuters.com/Reuters/worldNews` (`URLError(gaierror(11001, 'getaddrinfo failed'))`, `11494.9ms`, 来自 `news-aggregation`)
- `AP Top News RSS`: `https://feeds.apnews.com/apnews/topnews` (`URLError(gaierror(11001, 'getaddrinfo failed'))`, `768.4ms`, 来自 `news-aggregation`)
- `FRED Homepage`: `https://fred.stlouisfed.org/` (`TimeoutError('The read operation timed out')`, `18798.5ms`, 来自 `scientific-skills-fred-economic-data`)
- `FRED API Docs`: `https://fred.stlouisfed.org/docs/api/fred/` (`TimeoutError('The read operation timed out')`, `19218.9ms`, 来自 `scientific-skills-fred-economic-data`)
- `ALFRED Vintage Data`: `https://alfred.stlouisfed.org/` (`TimeoutError('The read operation timed out')`, `18767.7ms`, 来自 `scientific-skills-fred-economic-data`)
- `GeoFRED Maps`: `https://geofred.stlouisfed.org/` (`TimeoutError('The read operation timed out')`, `20027.1ms`, 来自 `scientific-skills-fred-economic-data`)
- `FRED Release Calendar`: `https://fred.stlouisfed.org/releases/calendar` (`URLError(TimeoutError('timed out'))`, `18452.7ms`, 来自 `scientific-skills-fred-economic-data`)
- `TradeSmart`: `https://www.tradesmart.com.hk/en/` (`URLError(gaierror(11001, 'getaddrinfo failed'))`, `11629.5ms`, 来自 `hk-ipo-research-assistant`)

## 本轮判断

1. 公开 RSS、公开 JSON/API、政府/金融权威站点可以形成一批更适合 `虾报道` 的首选信源底板。
2. 社交平台、部分海外媒体、部分加密和另类数据站点的可达性波动更大，适合作为补层而不是唯一信源。
3. 这轮已经把“skill 名称 -> 具体 source URL -> 当前网络可达性”的链条串起来了，后续可以让虾直接围绕这些 URL 做复测。

## 产物

- `research/source-link-registry.md`
- `research/source-skill-validation/probe-2026-04-11-source-connectivity.json`
