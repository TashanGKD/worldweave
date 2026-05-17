# Mainline source decision (2026-05-16)

Policy: the two product boards use direct core APIs first. RSS/API supplements are admitted only when they support international risk or AI. Other accessible sources stay archived, not deleted.

## Core APIs

- International: world-monitor `/api/events`, `/api/outbreaks`, `/api/signal-markers`.
- AI: AIhot `/api/public/items?mode=selected` and `/api/public/daily`.

## Supplement counts

- International related supplements: 10 total, 10 RSS/Atom/XML, 0 JSON APIs.
- AI related supplements: 14 total, 11 RSS/Atom/XML, 3 JSON APIs.
- Other A/B accessible sources archived out of mainline: 23.

## Supplement quality

- International business grades: {"A":6,"B":4}; access grades: {"A":7,"B":3}.
- AI business grades: {"A":3,"B":11}; access grades: {"A":10,"B":4}.

## International supplements

| business | access | direction | kind | ms | collection | name | url |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| A 95 | A 90 | world-news-risk | rss | 4801 | shunyanet-world-core.txt | (unnamed) | http://rss.cnn.com/rss/cnn_topstories.rss |
| A 95 | A 90 | world-news-risk | rss | 4835 | shunyanet-iran-watch.txt | (unnamed) | https://www.thehindu.com/news/international/feeder/default.rss |
| A 87 | A 90 | world-news-risk | rss | 2327 | shunyanet-iran-watch.txt | (unnamed) | https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml |
| A 87 | A 90 | world-news-risk | rss | 2489 | shunyanet-world-core.txt | (unnamed) | https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml |
| A 85 | A 81 | world-news-risk | rss | 5478 | shunyanet-world-core.txt | (unnamed) | http://rss.cnn.com/rss/cnn_world.rss |
| A 85 | A 81 | world-news-risk | rss | 7986 | shunyanet-iran-watch.txt | (unnamed) | https://www.jpost.com//rss/rssfeedsheadlines.aspx |
| B 77 | A 81 | disaster-infra | rss | 7639 | shunyanet-world-core.txt | (unnamed) | https://www.spc.noaa.gov/products/spcrss.xml |
| B 65 | B 71 | world-news-risk | rss | 5553 | news-aggregation | Guardian World RSS | https://www.theguardian.com/world/rss |
| B 65 | B 71 | world-news-risk | rss | 6166 | climate-variant-full | Auto theguardian.com Rss | https://www.theguardian.com/environment/climate-crisis/rss |
| B 65 | B 71 | world-news-risk | rss | 6561 | news-aggregation | Google News RSS | https://news.google.com/rss/search?q=world |

## AI supplements

| business | access | direction | kind | ms | collection | name | url |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| A 83 | A 80 | ai-research | rss | 2222 | awesome-rss-feeds | NVIDIA AI Blog | http://feeds.feedburner.com/nvidiablog |
| A 83 | A 80 | ai-research | rss | 2611 | awesome-rss-feeds | The Berkeley Artificial Intelligence Research Blog | http://bair.berkeley.edu/blog/feed.xml |
| A 83 | A 80 | ai-research | atom | 4483 | awesome-rss-feeds | Google AI Blog | http://feeds.feedburner.com/blogspot/gJZg |
| B 77 | A 81 | ai-research | json | 5605 | Scientify | Unpaywall API | https://api.unpaywall.org/v2/10.1038/nature12373?email=research@openclaw.ai |
| B 77 | A 81 | ai-research | json | 6926 | Scientify | OpenAlex API | https://api.openalex.org/works?search=llm&per-page=1 |
| B 77 | B 71 | ai-research | json | 7024 | source-skill-candidates.md | (unnamed) | https://api.openalex.org/works |
| B 75 | A 90 | ai-research | rss | 1130 | awesome-rss-feeds | Sam Altman(@sama) | https://api.xgo.ing/rss/user/e30d4cd223f44bed9d404807105c8927 |
| B 75 | A 80 | ai-research | rss | 1809 | awesome-rss-feeds | OpenAI Developers(@OpenAIDevs) | https://api.xgo.ing/rss/user/971dc1fc90da449bac23e5fad8a33d55 |
| B 75 | A 80 | ai-research | rss | 3566 | awesome-rss-feeds | arXiv AI | https://rss.arxiv.org/rss/cs.AI |
| B 75 | A 80 | ai-research | rss | 4808 | awesome-rss-feeds | AWS Machine Learning | https://aws.amazon.com/blogs/machine-learning/feed |
| B 75 | A 80 | ai-research | atom | 4996 | awesome-rss-feeds | Sam Altman | http://blog.samaltman.com/posts.atom |
| B 65 | B 71 | health-science | rss | 5248 | awesome-rss-feeds | Science Daily AI News | https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml |
| B 65 | B 71 | ai-research | rss | 5926 | awesome-rss-feeds | JMLR recent papers | http://proceedings.mlr.press//feed.xml |
| B 65 | B 71 | ai-research | rss | 6166 | awesome-rss-feeds | Medium - Artificial Intelligence Magazine | https://becominghuman.ai/feed |

## Archived out of current mainline

| business | access | direction | kind | collection | name | url |
| --- | --- | --- | --- | --- | --- | --- |
| A 87 | A 100 | finance-market | json | tushare | Tushare API Root | http://api.tushare.pro/ |
| A 85 | A 81 | security | rss | inkwell-rss-snapshot | krebsonsecurity.com | https://krebsonsecurity.com/feed/ |
| A 85 | A 81 | finance-market | json | U.S. Treasury Fiscal Data | Treasury Debt To The Penny API | https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1 |
| A 83 | A 90 | security | atom | awesome-rss-feeds | Recent Commits to webappsec-csp:main | https://github.com/w3c/webappsec-csp/commits/main.atom |
| A 83 | A 90 | security | atom | awesome-rss-feeds | Recent Commits to webappsec-permissions-policy:main | https://github.com/w3c/webappsec-permissions-policy/commits/main.atom |
| A 83 | A 80 | finance-market | json | xvary-stock-research | SEC company_tickers | https://www.sec.gov/files/company_tickers.json |
| B 77 | A 81 | finance-market | json | open-skills-get-crypto-price | Coinbase Exchange Candles API | https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400 |
| B 77 | A 81 | finance-market | json | open-skills-get-crypto-price | CoinGecko Simple Price API | https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd |
| B 77 | A 81 | finance-market | json | financial-data-fetcher | Yahoo Finance Chart API | https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d |
| B 75 | A 80 | disaster-infra | json | open-skills-free-weather-data | Open-Meteo Archive API | https://archive-api.open-meteo.com/v1/archive?latitude=25.28&longitude=55.30&start_date=2026-04-01&end_date=2026-04-02&daily=temperature_2m_max,temperature_2m_min |
| B 75 | A 80 | health-science | rss | awesome-rss-feeds | Scientific American Content: Global | http://rss.sciam.com/ScientificAmerican-Global |
| B 75 | A 80 | health-science | rss | awesome-rss-feeds | Neuroscience News -- ScienceDaily | https://sciencedaily.com/rss/mind_brain/neuroscience.xml |
| B 75 | A 80 | finance-market | rss | awesome-rss-feeds | Nerd's Eye View / Kitces.com | http://feeds.feedblitz.com/kitcesnerdseyeview&x=1 |
| B 67 | A 80 | business-product-media | atom | awesome-rss-feeds | HBR.org | http://feeds.harvardbusiness.org/harvardbusiness |
| B 67 | A 80 | business-product-media | rss | awesome-rss-feeds | HBR IdeaCast | http://feeds.harvardbusiness.org/harvardbusiness/ideacast |
| B 65 | B 71 | health-science | rss | awesome-rss-feeds | 环球科学 | http://feedmaker.kindle4rss.com/feeds/ScientificAmerican.weixin.xml |
| B 65 | B 71 | finance-market | json | twelvedata-api | Twelve Data Earnings API | https://api.twelvedata.com/earnings?symbol=AAPL&apikey=demo |
| B 65 | B 71 | finance-market | json | twelvedata-api | Twelve Data Quote API | https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo |
| B 65 | B 71 | finance-market | json | twelvedata-api | Twelve Data Earnings Calendar API | https://api.twelvedata.com/earnings_calendar?start_date=2026-04-01&end_date=2026-04-07&apikey=demo |
| B 65 | B 71 | disaster-infra | json | open-skills-free-weather-data | Open-Meteo forecast API | https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&hourly=temperature_2m&forecast_days=1 |
| B 65 | B 71 | disaster-infra | json | open-skills-free-weather-data | Open-Meteo Forecast API | https://api.open-meteo.com/v1/forecast?latitude=25.28&longitude=55.30&hourly=temperature_2m,wind_speed_10m |
| B 65 | B 71 | finance-market | rss | awesome-rss-feeds | Learn To Trade The Market | https://www.learntotradethemarket.com/feed |
| B 65 | B 71 | finance-market | rss | awesome-rss-feeds | Millennial Money | https://millennialmoney.com/feed |