# ShunyaNet Sentinel Curated Feeds

更新时间：2026-04-14

这份清单不是照搬 `ShunyaNet Sentinel` 原始 bundle，而是按当前项目的信源原则做的二次筛选：

- 优先 `权威 / 原始 / 稳定 / 可长期直连`
- 保留少量 `高价值弱信号` 作为补充
- 降低 `纯社交账号 / bridged 社媒 / 噪音 subreddit / 来源不清的镜像`

## 结论

`ShunyaNet Sentinel` 值得保留，但更适合作为：

- `RSS 组织模板`
- `地区化 feed bundle 模板`
- `本地 LLM 过滤 / 去重 / chunk / alert workflow 参考`

不适合作为：

- 一个新的“直接原始信源”
- 不加筛选地整包并入主世界

## 推荐保留：世界核心 RSS

以下更适合作为 `world` 的主池或候选主池：

- `https://feeds.bbci.co.uk/news/world/asia/rss.xml`
- `https://feeds.bbci.co.uk/news/world/europe/rss.xml`
- `https://feeds.bbci.co.uk/news/world/africa/rss.xml`
- `https://feeds.bbci.co.uk/news/world/latin_america/rss.xml`
- `https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml`
- `http://feeds.bbci.co.uk/news/rss.xml`
- `https://feedx.net/rss/ap.xml`
- `https://feeds.nbcnews.com/nbcnews/public/news`
- `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml`
- `https://www.lemonde.fr/en/rss/une.xml`
- `http://rss.cnn.com/rss/cnn_world.rss`
- `http://rss.cnn.com/rss/cnn_topstories.rss`
- `https://gdacs.org/xml/rss.xml`
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.atom`
- `https://www.spc.noaa.gov/products/spcrss.xml`
- `https://www.fema.gov/news/news_region-ii.rss`
- `https://www.fema.gov/news/news_region-iii.rss`
- `https://www.fema.gov/news/news_region-ix.rss`
- `https://www.fema.gov/news/news_region-x.rss`
- `https://www.faasafety.gov/RSS/NewsRSS.aspx`
- `https://www.faasafety.gov/RSS/NoticesRSS.aspx`
- `https://www.newswise.com/legacy/feed/channels.php?channel=50`
- `https://www.newswise.com/legacy/feed/channels.php?channel=60`
- `https://www.newswise.com/legacy/feed/channels.php?channel=134`
- `https://www.newswise.com/legacy/feed/channels.php?channel=6402`
- `https://www.newswise.com/legacy/feed/channels.php?channel=6561`
- `https://www.newswise.com/legacy/feed/channels.php?channel=6238`

## 推荐保留：高价值弱信号 / 平台补充

这些不应替代主流权威源，但可作为弱信号层补充：

- `https://www.reddit.com/r/worldnews/new/.rss`
- `https://www.reddit.com/r/ukraine/new/.rss`
- `https://www.reddit.com/r/UkraineConflict/new/.rss`
- `https://www.reddit.com/r/NorthKoreaNews/new/.rss`
- `https://bsky.app/profile/reuters.com/rss`
- `https://bsky.app/profile/apnews.com/rss`
- `https://bsky.app/profile/aljazeera.com/rss`
- `https://bsky.app/profile/bellingcat.com/rss`
- `https://bsky.app/profile/euronews.com/rss`
- `https://bsky.app/profile/npr.org/rss`
- `https://bsky.app/profile/cnbc.com/rss`
- `https://bsky.app/profile/wsj.com/rss`

## 伊朗 / 中东冲突定向清单

以下适合做子世界或地区观察池：

- `https://www.crisisgroup.org/rss/87`
- `https://www.crisisgroup.org/rss/91`
- `https://www.crisisgroup.org/rss/85`
- `https://www.france24.com/en/middle-east/rss`
- `https://www.france24.com/en/tag/iran/rss`
- `https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml`
- `https://indianexpress.com/section/world/feed/`
- `https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml`
- `https://www.washingtonpost.com/rss/world`
- `https://feeds.washingtonpost.com/rss/world?itid=lk_inline_manual_26`
- `https://en.mehrnews.com/rss`
- `https://en.mehrnews.com/rss/tp/579`
- `https://en.mehrnews.com/rss/tp/561`
- `https://en.mehrnews.com/rss/tp/575`
- `https://www.jpost.com//rss/rssallnews`
- `https://www.jpost.com//rss/rssfeedsheadlines.aspx`
- `https://www.jpost.com//rss/rssfeedsiran`
- `https://www.thehindu.com/news/international/feeder/default.rss`
- `http://timesofindia.indiatimes.com/rssfeeds/296589292.cms`

## 当前不建议直接并入主池

这些不是“没用”，而是更适合弱信号区或人工挑选后再进：

- 大量地区 subreddit：`r/canada`、`r/chile`、`r/brasil`、`r/malaysia` 等
- 大量政客或个人 Bluesky：州长、议员、评论员个人号
- `rss-bridge.org` / `brid.gy` 这类桥接源
- `war.gov` 这类来源不清、命名不稳定的站点
- 单一事件导向但可审计性弱的匿名社媒账号

## 落地建议

- 把这份筛选结果当作 `source-skill-refresh` 的衍生样本，而不是主表本身
- 主世界优先吃“世界核心 RSS”
- 地区子世界按需挂“伊朗 / 印度 / 其他地区定向清单”
- 弱信号层再补 Reddit / Bluesky / bridge feed
