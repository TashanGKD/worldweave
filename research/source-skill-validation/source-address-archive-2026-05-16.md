# Source address archive and quality review (2026-05-16)

Policy: addresses are retained. Direct-access structured feeds/APIs are eligible for runtime use; failed, forbidden, rate-limited, and timeout addresses are archived for later retry instead of deleted.

## Totals

- Total checked addresses: 3233
- Accessible structured RSS/API addresses: 750
- Accessible but unstructured pages: 250
- Archived inaccessible addresses: 2233
- Runtime-eligible by business fit (A/B): 47

## Accessible structured directions

- long-tail-general: 436
- software-engineering: 141
- culture-lifestyle: 113
- ai-research: 13
- finance-market: 12
- business-product-media: 11
- world-news-risk: 9
- disaster-infra: 4
- health-science: 4
- security: 3
- uncategorized: 2
- utility-api: 2

## Link/access quality

- Grade A: 446
- Grade B: 304

## Business-fit quality

- Grade D: 355
- Grade C: 348
- Grade B: 32
- Grade A: 15

## Archived inaccessible breakdown

- timeout: 1797
- network_failed: 369
- auth_or_forbidden: 41
- not_found: 11
- rate_limited: 8
- other_status: 6
- server_error: 1

## Top inaccessible hosts

| host | count |
| --- | ---: |
| github.com | 102 |
| ximalaya.com | 57 |
| api.xgo.ing | 53 |
| feeds.feedburner.com | 31 |
| anchor.fm | 25 |
| feeds.fireside.fm | 21 |
| reddit.com | 17 |
| skills-hub.ai | 16 |
| skillsmp.com | 15 |
| agentskills.in | 14 |
| blog.mozilla.org | 11 |
| feed.xyzfm.space | 11 |
| feeds.bbci.co.uk | 10 |
| alphavantage.co | 9 |
| feeds.megaphone.fm | 9 |
| finnhub.io | 9 |
| medium.com | 9 |
| bsky.app | 8 |
| feeds.acast.com | 8 |
| feeds.simplecast.com | 8 |

## Best accessible candidates by business fit

| business | access | direction | kind | ms | collection | name | url |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| A 95 | A 90 | world-news-risk | rss | 4801 | shunyanet-world-core.txt |  | http://rss.cnn.com/rss/cnn_topstories.rss |
| A 95 | A 90 | world-news-risk | rss | 4835 | shunyanet-iran-watch.txt |  | https://www.thehindu.com/news/international/feeder/default.rss |
| A 87 | A 100 | finance-market | json | 939 | tushare | Tushare API Root | http://api.tushare.pro/ |
| A 87 | A 90 | world-news-risk | rss | 2327 | shunyanet-iran-watch.txt |  | https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml |
| A 87 | A 90 | world-news-risk | rss | 2489 | shunyanet-world-core.txt |  | https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml |
| A 85 | A 81 | world-news-risk | rss | 5478 | shunyanet-world-core.txt |  | http://rss.cnn.com/rss/cnn_world.rss |
| A 85 | A 81 | security | rss | 5714 | inkwell-rss-snapshot | krebsonsecurity.com | https://krebsonsecurity.com/feed/ |
| A 85 | A 81 | finance-market | json | 6913 | U.S. Treasury Fiscal Data | Treasury Debt To The Penny API | https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1 |
| A 85 | A 81 | world-news-risk | rss | 7986 | shunyanet-iran-watch.txt |  | https://www.jpost.com//rss/rssfeedsheadlines.aspx |
| A 83 | A 90 | security | atom | 577 | awesome-rss-feeds | Recent Commits to webappsec-csp:main | https://github.com/w3c/webappsec-csp/commits/main.atom |
| A 83 | A 90 | security | atom | 732 | awesome-rss-feeds | Recent Commits to webappsec-permissions-policy:main | https://github.com/w3c/webappsec-permissions-policy/commits/main.atom |
| A 83 | A 80 | ai-research | rss | 2222 | awesome-rss-feeds | NVIDIA AI Blog | http://feeds.feedburner.com/nvidiablog |
| A 83 | A 80 | ai-research | rss | 2611 | awesome-rss-feeds | The Berkeley Artificial Intelligence Research Blog | http://bair.berkeley.edu/blog/feed.xml |
| A 83 | A 80 | finance-market | json | 2878 | xvary-stock-research | SEC company_tickers | https://www.sec.gov/files/company_tickers.json |
| A 83 | A 80 | ai-research | atom | 4483 | awesome-rss-feeds | Google AI Blog | http://feeds.feedburner.com/blogspot/gJZg |
| B 77 | A 81 | ai-research | json | 5605 | Scientify | Unpaywall API | https://api.unpaywall.org/v2/10.1038/nature12373?email=research@openclaw.ai |
| B 77 | A 81 | ai-research | json | 6926 | Scientify | OpenAlex API | https://api.openalex.org/works?search=llm&per-page=1 |
| B 77 | A 81 | finance-market | json | 7627 | open-skills-get-crypto-price | Coinbase Exchange Candles API | https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400 |
| B 77 | A 81 | disaster-infra | rss | 7639 | shunyanet-world-core.txt |  | https://www.spc.noaa.gov/products/spcrss.xml |
| B 77 | A 81 | finance-market | json | 7773 | open-skills-get-crypto-price | CoinGecko Simple Price API | https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd |
| B 77 | A 81 | finance-market | json | 7984 | financial-data-fetcher | Yahoo Finance Chart API | https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d |
| B 77 | B 71 | ai-research | json | 7024 | source-skill-candidates.md |  | https://api.openalex.org/works |
| B 75 | A 90 | ai-research | rss | 1130 | awesome-rss-feeds | Sam Altman(@sama) | https://api.xgo.ing/rss/user/e30d4cd223f44bed9d404807105c8927 |
| B 75 | A 80 | ai-research | rss | 1809 | awesome-rss-feeds | OpenAI Developers(@OpenAIDevs) | https://api.xgo.ing/rss/user/971dc1fc90da449bac23e5fad8a33d55 |
| B 75 | A 80 | disaster-infra | json | 2289 | open-skills-free-weather-data | Open-Meteo Archive API | https://archive-api.open-meteo.com/v1/archive?latitude=25.28&longitude=55.30&start_date=2026-04-01&end_date=2026-04-02&daily=temperature_2m_max,temperature_2m_min |
| B 75 | A 80 | health-science | rss | 3046 | awesome-rss-feeds | Scientific American Content: Global | http://rss.sciam.com/ScientificAmerican-Global |
| B 75 | A 80 | ai-research | rss | 3566 | awesome-rss-feeds | arXiv AI | https://rss.arxiv.org/rss/cs.AI |
| B 75 | A 80 | health-science | rss | 4032 | awesome-rss-feeds | Neuroscience News -- ScienceDaily | https://sciencedaily.com/rss/mind_brain/neuroscience.xml |
| B 75 | A 80 | finance-market | rss | 4164 | awesome-rss-feeds | Nerd's Eye View / Kitces.com | http://feeds.feedblitz.com/kitcesnerdseyeview&x=1 |
| B 75 | A 80 | ai-research | rss | 4808 | awesome-rss-feeds | AWS Machine Learning | https://aws.amazon.com/blogs/machine-learning/feed |
| B 75 | A 80 | ai-research | atom | 4996 | awesome-rss-feeds | Sam Altman | http://blog.samaltman.com/posts.atom |
| B 67 | A 80 | business-product-media | atom | 2939 | awesome-rss-feeds | HBR.org | http://feeds.harvardbusiness.org/harvardbusiness |
| B 67 | A 80 | business-product-media | rss | 2976 | awesome-rss-feeds | HBR IdeaCast | http://feeds.harvardbusiness.org/harvardbusiness/ideacast |
| B 65 | B 71 | health-science | rss | 5248 | awesome-rss-feeds | Science Daily AI News | https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml |
| B 65 | B 71 | health-science | rss | 5441 | awesome-rss-feeds | 环球科学 | http://feedmaker.kindle4rss.com/feeds/ScientificAmerican.weixin.xml |
| B 65 | B 71 | world-news-risk | rss | 5553 | news-aggregation | Guardian World RSS | https://www.theguardian.com/world/rss |
| B 65 | B 71 | ai-research | rss | 5926 | awesome-rss-feeds | JMLR recent papers | http://proceedings.mlr.press//feed.xml |
| B 65 | B 71 | finance-market | json | 5940 | twelvedata-api | Twelve Data Earnings API | https://api.twelvedata.com/earnings?symbol=AAPL&apikey=demo |
| B 65 | B 71 | finance-market | json | 5961 | twelvedata-api | Twelve Data Quote API | https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo |
| B 65 | B 71 | finance-market | json | 6002 | twelvedata-api | Twelve Data Earnings Calendar API | https://api.twelvedata.com/earnings_calendar?start_date=2026-04-01&end_date=2026-04-07&apikey=demo |
| B 65 | B 71 | ai-research | rss | 6166 | awesome-rss-feeds | Medium - Artificial Intelligence Magazine | https://becominghuman.ai/feed |
| B 65 | B 71 | world-news-risk | rss | 6166 | climate-variant-full | Auto theguardian.com Rss | https://www.theguardian.com/environment/climate-crisis/rss |
| B 65 | B 71 | world-news-risk | rss | 6561 | news-aggregation | Google News RSS | https://news.google.com/rss/search?q=world |
| B 65 | B 71 | disaster-infra | json | 7069 | open-skills-free-weather-data | Open-Meteo forecast API | https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&hourly=temperature_2m&forecast_days=1 |
| B 65 | B 71 | disaster-infra | json | 7095 | open-skills-free-weather-data | Open-Meteo Forecast API | https://api.open-meteo.com/v1/forecast?latitude=25.28&longitude=55.30&hourly=temperature_2m,wind_speed_10m |
| B 65 | B 71 | finance-market | rss | 7312 | awesome-rss-feeds | Learn To Trade The Market | https://www.learntotradethemarket.com/feed |
| B 65 | B 71 | finance-market | rss | 7408 | awesome-rss-feeds | Millennial Money | https://millennialmoney.com/feed |
| C 61 | A 90 | software-engineering | atom | 427 | awesome-rss-feeds | Recent Commits to csswg-drafts:main | https://github.com/w3c/csswg-drafts/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 441 | awesome-rss-feeds | Recent Commits to url:main | https://github.com/whatwg/url/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 448 | awesome-rss-feeds | Recent Commits to ecma262:main | https://github.com/tc39/ecma262/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 457 | awesome-rss-feeds | Recent Commits to netinfo:gh-pages | https://github.com/WICG/netinfo/commits/gh-pages.atom |
| C 61 | A 90 | software-engineering | atom | 465 | awesome-rss-feeds | Recent Commits to fetch:main | https://github.com/whatwg/fetch/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 472 | awesome-rss-feeds | Recent Commits to using-aria:gh-pages | https://github.com/w3c/using-aria/commits/gh-pages.atom |
| C 61 | A 90 | software-engineering | atom | 473 | awesome-rss-feeds | Recent Commits to css-houdini-drafts:main | https://github.com/w3c/css-houdini-drafts/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 473 | awesome-rss-feeds | Recent Commits to web-share:main | https://github.com/w3c/web-share/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 478 | awesome-rss-feeds | Recent Commits to html-aria:gh-pages | https://github.com/w3c/html-aria/commits/gh-pages.atom |
| C 61 | A 90 | software-engineering | atom | 483 | awesome-rss-feeds | Recent Commits to fxtf-drafts:main | https://github.com/w3c/fxtf-drafts/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 488 | awesome-rss-feeds | Recent Commits to webidl:main | https://github.com/whatwg/webidl/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 490 | awesome-rss-feeds | Recent Commits to manifest-app-info:main | https://github.com/w3c/manifest-app-info/commits/main.atom |
| C 61 | A 90 | software-engineering | atom | 517 | awesome-rss-feeds | Recent Commits to background-fetch:gh-pages | https://github.com/WICG/background-fetch/commits/gh-pages.atom |

## Archived inaccessible samples

| access | direction | collection | name | url | error |
| --- | --- | --- | --- | --- | --- |
| timeout | long-tail-general | awesome-rss-feeds | Aerotwist Blog | http://aerotwist.com/blog/feed | Error: timeout |
| network_failed | software-engineering | public-apis | Bay Area Rapid Transit | http://api.bart.gov/ | TypeError: fetch failed |
| timeout | long-tail-general | awesome-rss-feeds | 程序视界——聚焦程序员的职业规划与成长 | http://blog.csdn.net/foruok/rss/list | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Hubspot | http://blog.hubspot.com/CMS/UI/Modules/BizBlogger/rss.aspx?maxcount=25&moduleid=8441&tabid=6307 | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Mitchell's Blog | http://blog.lizardwrangler.com/feed | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Future Releases | http://blog.mozilla.com/futurereleases/feed | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Nathan's Blog | http://blog.mozilla.org/nfroyd/feed | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | RisingStack Engineering | http://blog.risingstack.com/rss | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Artem Sapegin’s Blog | http://blog.sapegin.me/atom.xml | Error: timeout |
| network_failed | long-tail-general | awesome-rss-feeds | 楚天乐的小站 | http://blog.shyclouds.net/feed | TypeError: fetch failed |
| network_failed | software-engineering | awesome-rss-feeds | Stack Overflow Blog | http://blog.stackoverflow.com/feed | TypeError: fetch failed |
| network_failed | long-tail-general | awesome-rss-feeds | 轉個彎日誌 | http://blog.turn.tw/?feed=rss2 | TypeError: fetch failed |
| timeout | software-engineering | awesome-rss-feeds | The IntelliJ IDEA Blog | http://blogs.jetbrains.com/idea/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Boxes and Arrows | http://boxesandarrows.com/rss | Error: timeout |
| timeout | utility-api | public-apis | Cep.la | http://cep.la/ | Error: timeout |
| network_failed | software-engineering | public-apis | Chronicling America | http://chroniclingamerica.loc.gov/about/api/ | TypeError: fetch failed |
| timeout | long-tail-general | awesome-rss-feeds | Consequence | http://consequenceofsound.net/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | in progress | http://cwilso.com/feed | Error: timeout |
| timeout | software-engineering | public-apis | Transport for Germany | http://data.deutschebahn.com/dataset/api-fahrplan | Error: timeout |
| timeout | utility-api | public-apis | Open Government, Romania | http://data.gov.ro/ | Error: timeout |
| timeout | software-engineering | public-apis | Transport for Paris, France | http://data.ratp.fr/api/v1/console/datasets/1.0/search/ | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Blog AI Paper Review David Stutz | http://davidstutz.de/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Dhananjay Kumar | http://debugmode.net/feed | Error: timeout |
| timeout | world-news-risk | public-apis | NPR One | http://dev.npr.org/api/ | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Distill | http://distill.pub/rss.xml | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Engineering Blog – Wealthfront | http://eng.wealthfront.com/feed | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Grab Tech | http://engineering.grab.com/feed.xml | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | KA Engineering | http://engineering.khanacademy.org/rss.xml | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Widen Engineering | http://engineering.widen.com/feed.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 小众软件 | http://feed.appinn.com/ | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 改变从这里开始 - 壹心理 | http://feed.xinli001.com/ | Error: timeout |
| timeout | business-product-media | awesome-rss-feeds | The Moz Blog | http://feedpress.me/mozblog | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Baymard Institute | http://feeds.baymard.com/baymard?_ga=1.110790726.2145183607.1414082693 | Error: timeout |
| timeout | long-tail-general | shunyanet-world-core.txt |  | http://feeds.bbci.co.uk/news/rss.xml | Error: timeout |
| timeout | world-news-risk | awesome-rss-feeds | BBC News - Science & Environment | http://feeds.bbci.co.uk/news/science_and_environment/rss.xml | Error: timeout |
| network_failed | world-news-risk | news-aggregation | BBC World RSS | http://feeds.bbci.co.uk/news/world/rss.xml | TypeError: fetch failed |
| timeout | culture-lifestyle | awesome-rss-feeds | BBC Sport - Cricket | http://feeds.bbci.co.uk/sport/cricket/rss.xml | Error: timeout |
| network_failed | world-news-risk | awesome-rss-feeds | BBC Sport - Sport | http://feeds.bbci.co.uk/sport/rss.xml | TypeError: fetch failed |
| network_failed | long-tail-general | awesome-rss-feeds | Danny Tuppeny | http://feeds.dantup.com/DanTup | TypeError: fetch failed |
| timeout | software-engineering | awesome-rss-feeds | Coding Horror | http://feeds.feedburner.com/codinghorror | Error: timeout |
| network_failed | culture-lifestyle | awesome-rss-feeds | One Big Photo | http://feeds.feedburner.com/OneBigPhoto | TypeError: fetch failed |
| network_failed | long-tail-general | awesome-rss-feeds | Paul Irish | http://feeds.feedburner.com/paul-irish | TypeError: fetch failed |
| network_failed | software-engineering | awesome-rss-feeds | Programming Throwdown | http://feeds.feedburner.com/ProgrammingThrowdown | TypeError: fetch failed |
| timeout | long-tail-general | awesome-rss-feeds | PsyBlog | http://feeds.feedburner.com/PsychologyBlog | Error: timeout |
| network_failed | culture-lifestyle | awesome-rss-feeds | Software Engineering Radio - The Podcast for Professional Software Developers | http://feeds.feedburner.com/se-radio | TypeError: fetch failed |
| timeout | long-tail-general | awesome-rss-feeds | IGN All | http://feeds.ign.com/ign/all | Error: timeout |
| timeout | culture-lifestyle | awesome-rss-feeds | Wisden Cricket Weekly | http://feeds.soundcloud.com/users/soundcloud:users:341034518/sounds.rss | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Radiolab | http://feeds.wnyc.org/radiolab | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Nick Fitzgerald | http://fitzgeraldnick.com/weblog/feeds/latest-atom | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Florian’s Blog | http://florian.rivoal.net/blog/feed.xml | Error: timeout |
| timeout | uncategorized | vnpy_ifind | iFinD Homepage | http://ft.10jqka.com.cn/ | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Engineering – The GitHub Blog | http://githubengineering.com/atom.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Gityuan | http://gityuan.com/feed.xml | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Better world by better software | http://glebbahmutov.com/blog/atom.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | GoodUI Blog Feed | http://goodui.org/blog/feed | Error: timeout |
| timeout | ai-research | awesome-rss-feeds | Google AI Blog | http://googleresearch.blogspot.com/atom.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Gregory Szorc's Digital Home | http://gregoryszorc.com/blog/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Guy Kawasaki | http://guykawasaki.com/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 海德沙龙（HeadSalon） | http://headsalon.org/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 心理師的口袋 | http://headshrinkerspocket.blogspot.com/feeds/posts/default?alt=rss | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Hacker News: Show HN | http://hnrss.org/show | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 王建硕 | http://home.wangjianshuo.com/cn/feed | Error: timeout |
| timeout | utility-api | public-apis | INEI | http://iinei.inei.gob.pe/microdatos/ | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | I'm TualatriX | http://imtx.me/feed/latest | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Joy the Baker | http://joythebaker.com/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | John Egan | http://jwegan.com/feed/rss | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Spotify Engineering | http://labs.spotify.com/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 胶片的味道 / 胶片的味道 | http://letsfilm.org/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 硕鼠的博客站 | http://lukefan.com/?feed=rss2 | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 罗磊的独立博客 | http://luolei.org/feed | Error: timeout |
| timeout | ai-research | awesome-rss-feeds | Machine Learning Mastery | http://machinelearningmastery.com/blog/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | MacTalk-池建强的随想录 | http://macshuo.com/?feed=rss2 | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Magenta | http://magenta.tensorflow.org/feed.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | In Pursuit of Laziness | http://manishearth.github.io/atom.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Mislav's blog | http://mislav.net/feeds/dev.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | 果果喵 | http://moe.xin/feed | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | mrale.ph | http://mrale.ph/atom.xml | Error: timeout |
| timeout | software-engineering | awesome-rss-feeds | Tech Notes | http://neugierig.org/software/blog/atom.xml | Error: timeout |
| timeout | long-tail-general | awesome-rss-feeds | Neuroscience News | http://neurosciencenews.com/feed | Error: timeout |
| timeout | ai-research | awesome-rss-feeds | MIT News - Artificial intelligence | http://news.mit.edu/rss/topic/artificial-intelligence2 | Error: timeout |

Full machine-readable archive: research/source-skill-validation/source-address-archive-2026-05-16.json