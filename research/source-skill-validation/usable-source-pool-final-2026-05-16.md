# Usable source pool final inventory (2026-05-16)

Policy: World Monitor and AIhot are the two core API lanes. All public RSS/API addresses that pass direct-access structured probing enter the usable pool. Failed addresses are archived instead of deleted.

## Core API lanes

- World Monitor: 3/3 endpoints verified HTTP 200: `/api/events`, `/api/outbreaks`, `/api/signal-markers`.
- AIhot: selected and daily public APIs verified HTTP 200. In the latest selected sample, 100 items referenced 53 unique public sources.

## Full address audit

- Checked addresses: 3233
- Direct-accessible addresses: 1000
- Usable structured RSS/API addresses admitted to pool: 750
- RSS/Atom/XML: 729
- JSON APIs: 21
- Archived inaccessible addresses: 2233

## Usable source kinds

- rss: 553
- atom: 175
- json: 21
- xml: 1

## Top usable collections

- awesome-rss-feeds: 691
- inkwell-rss-snapshot: 21
- shunyanet-world-core.txt: 9
- news-aggregation: 3
- open-skills-free-weather-data: 3
- public-apis: 3
- shunyanet-iran-watch.txt: 3
- twelvedata-api: 3
- alphaear-search: 2
- open-skills-get-crypto-price: 2
- Scientify: 2
- climate-variant-full: 1
- financial-data-fetcher: 1
- open-skills-web-search-api: 1
- source-skill-candidates.md: 1
- tushare: 1
- U.S. Treasury Fiscal Data: 1
- xvary-stock-research: 1
- zai-cli: 1

## AIhot public source sample

- Selected sample size: 100
- Unique source names in sample: 53
- Categories: tip 37, ai-products 32, industry 16, ai-models 9, paper 6

| source | count |
| --- | ---: |
| X：Berry Xia (@berryxia) | 7 |
| IT之家（RSS） | 4 |
| OpenAI：官网动态（RSS · 排除企业/客户案例） | 4 |
| X：Kim (@kimmonismus) | 4 |
| X：Krea AI (@krea_ai) | 4 |
| Claude Code：GitHub Releases（RSS） | 3 |
| Claude：Blog（网页） | 3 |
| Hacker News 热门（buzzing.cc 中文翻译） | 3 |
| X：阿易 AI Notes (@AYi_AInotes) | 3 |
| X：宝玉 (@dotey) | 3 |
| X：Claude Devs (@ClaudeDevs) | 3 |
| X：Peter Steinberger (@steipete) | 3 |
| 蚂蚁 inclusionAI：HuggingFace 新模型 | 2 |
| Anthropic：Newsroom（网页） | 2 |
| Google Developers Blog（RSS） | 2 |
| Hugging Face：Blog（RSS） | 2 |
| HuggingFace Daily Papers（社区热门论文） | 2 |
| Tomer Tunguz 博客（VC 分析） | 2 |
| X：百度 Baidu (@Baidu_Inc) | 2 |
| X：可灵 Kling AI (@Kling_ai) | 2 |
| X：商汤 SenseTime (@SenseTime_AI) | 2 |
| X：小互 (@xiaohu) | 2 |
| X：cb_doge (@cb_doge) | 2 |
| X：Kimi.ai (@Kimi_Moonshot) | 2 |
| X：OpenRouter (@OpenRouter) | 2 |
| X：PixVerse (@PixVerse_) | 2 |
| xAI：News（网页） | 2 |
| Anthropic：Research（发表成果 · 网页） | 1 |
| CMU：Machine Learning Blog | 1 |
| Dwarkesh Patel：Podcast & Blog（RSS） | 1 |
| Gary Marcus：The Road to AI We Can Trust（RSS） | 1 |
| Runway：News（网页） | 1 |
| The Decoder：AI News（RSS） | 1 |
| X：阿里云 / Alibaba Cloud (@alibaba_cloud) | 1 |
| X：硅基流动 SiliconFlow (@SiliconFlowAI) | 1 |
| X：歸藏 (@op7418) | 1 |
| X：洪明 (@hongming731) | 1 |
| X：小北 (@frxiaobei) | 1 |
| X：小米 MiMo (@XiaomiMiMo) | 1 |
| X：Luma AI (@LumaLabsAI) | 1 |

## Archived inaccessible breakdown

- timeout: 1797
- network_failed: 369
- auth_or_forbidden: 41
- not_found: 11
- rate_limited: 8
- other_status: 6
- server_error: 1

## Top archived collections

- awesome-rss-feeds: 1306
- public-apis: 405
- source-skill-candidates.md: 85
- awesome-ai-in-finance: 73
- skill-aggregator-index.md: 46
- inkwell-rss-snapshot: 44
- shunyanet-world-core.txt: 30
- hk-ipo-research-assistant: 16
- shunyanet-iran-watch.txt: 15
- alphaear-news: 11
- source-link-registry.md: 11
- alpha-vantage: 8
- market-sizing-analysis: 8
- scientific-skills-fred-economic-data: 8
- worldmonitor-upstream: 8
- open-skills-get-crypto-price: 7
- competitive-intel: 6
- hedgefundmonitor: 6
- last30days-skill: 6
- news-aggregation: 6