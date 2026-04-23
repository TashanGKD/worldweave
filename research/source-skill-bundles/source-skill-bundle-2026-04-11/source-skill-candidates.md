# 高价值信源 Skill 调研表

更新时间：2026-04-09  
说明：本表服务于 `虾报道` 后续信源扩展。重点不是“这个 skill 好不好用”，而是“它背后能不能反向挖出真实信源入口、网页、API 或数据流”。

## 统一字段说明

- `domestic_ip_access`：`direct | unstable | blocked_or_unknown`
- `data_mode`：`rss | webpage | api | market-terminal | mixed | unknown`
- `reuse_value_for_xia_report`：`high | medium | low`

## TopicLab 内部基座与外部高价值候选

| name | source_platform | url | domestic_ip_access | skill_type | content_access | visible_sources | hidden_sources_or_upstreams | data_mode | reuse_value_for_xia_report | risk_notes | next_action |
|---|---|---|---:|---|---|---|---|---|---:|---|---|
| research-dream | TopicLab SkillHub | https://github.com/TashanGKD/Research-Dream | direct | memory / workflow | SkillHub fulltext + GitHub repo | 本地记忆文件、长期研究上下文 | 无显式外部信源，更多是记忆汇聚层 | unknown | low | 不是信源 skill，本身不产出外部 feed | 仅保留作“长期记忆层”参考，不做信源接入 |
| ai-research-vllm | TopicLab SkillHub / Orchestra | https://github.com/Orchestra-Research/AI-Research-SKILLs | direct | tooling / model infra | TopicLab 测试中可读全文；GitHub README 可读 | vLLM、推理工程文档 | 上游偏官方 repo / issue / docs，不是新闻信源 | mixed | low | 更像工程 skill，不直接供世界信号使用 | 保留作“技术专题子世界”候选，不进主信源池 |
| claude-scientific-networkx | TopicLab SkillHub / K-Dense | https://github.com/K-Dense-AI/claude-scientific-skills | direct | tooling / analysis | TopicLab 测试中可读全文；GitHub docs 可读 | NetworkX、图分析工作流 | 偏算法库与教程，不是原始信源 | mixed | low | 对图谱建模有用，但不是 feed 来源 | 可为后续关系演绎层提供工具，不进信源池 |
| claude-scientific-astropy | TopicLab SkillHub / K-Dense | https://github.com/K-Dense-AI/claude-scientific-skills | direct | tooling / astronomy | TopicLab 测试中可读全文；GitHub docs 可读 | Astropy、天文数据分析 | 可能依赖 NASA/SDSS/SIMBAD 等数据库，但当前证据在总 docs 级 | mixed | low | 太偏垂直，不适合作为主世界通用信源 | 仅在科学专题场景启用 |
| claude-scientific-transformers | TopicLab SkillHub / K-Dense | https://github.com/K-Dense-AI/claude-scientific-skills | direct | tooling / model research | TopicLab 测试中可读全文；GitHub docs 可读 | Hugging Face Transformers | 主要是模型工程文档与示例 | mixed | low | 非信源入口 | 不进入信源清单 |
| claude-scientific-alpha-vantage | TopicLab SkillHub / K-Dense | https://github.com/K-Dense-AI/claude-scientific-skills | direct | finance / data access | TopicLab 测试明确存在该 slug；总 docs 明确列出 Alpha Vantage | Alpha Vantage、经济/金融数据库 | 可顺带联到 FRED、BEA、BLS、ECB、US Treasury 等 | api | high | 需要确认具体 API key、频率限制与条目映射 | 优先拉取实际全文内容，评估是否单独做金融/宏观信号接入 |
| last30days-skill | GitHub | https://github.com/mvanhorn/last30days-skill | unstable | news / social research | `SKILL.md`、README、docs、源码可读 | Reddit、X、YouTube、TikTok、Instagram、Hacker News、Polymarket、Bluesky、Truth Social | 已确认上游含 `api.scrapecreators.com`、`POST https://api.openai.com/v1/responses`、`POST https://api.x.ai/v1/responses`、`reddit.com/.../.json`，并可选 Brave / Perplexity / OpenRouter | mixed | high | 多源抓取依赖较多，部分平台要 token；中国出口下部分平台可达性不稳 | 适合作为“热点发现器”样本，优先抽它的源适配思路 |
| 集思谱 Skill | TopicLab apps catalog / official docs | https://www.giiisp.com/SKILL.md | direct | literature / patent / preprint search | TopicLab app catalog 有文档链接；当前直连 `SKILL.md` 返回 404 | 集思谱文献库、专利库、预印本库、站内 filestore PDF | 官网与 filestore 已可直连，老 `SKILL.md` 路径失效，但主站、登录页与 `filestore.giiisp.com/arxiv/...pdf` 已可验证 | mixed | high | 官方文档路径疑似已变，真实能力面更多藏在站内与 filestore 链路里 | 继续补官方现行 docs 或搜索接口，再评估能否拆成文献/专利/预印本三类信源 |
| Scientify | GitHub + 官方站 | https://github.com/tsingyuai/scientify | direct | research tracking / automation | GitHub README、skills、源码、官网可读 | 持续文献跟踪、研究假设生成、实验验证 | 已确认上游含 `https://export.arxiv.org/api/query`、`https://api.openalex.org/works`、`https://api.unpaywall.org/v2/{doi}`，并支持 arXiv source/PDF 下载 | mixed | high | 主要偏科研世界，不适合主世界全量接入，但对科技/AI 子世界价值很高 | 适合研究“多轮跟踪与记忆”机制，也适合直接复用文献源 |
| pywencai | GitHub | https://github.com/zsrl/pywencai | direct | market query / unofficial data access | README 可读 | 同花顺问财数据 | Cookie 登录后的问财网页接口、浏览器会话、JS 执行 | webpage | high | 非官方，强依赖 cookie，策略调整频繁；法律和商用风险需单独评估 | 优先纳入“专业金融信源”候选，但默认走低频与人工确认 |
| qstock | GitHub | https://github.com/tkfy920/qstock | direct | market data / quant research | README 可读 | 东方财富、同花顺、新浪财经、问财 | 问财功能依赖 pywencai；同时整合多家网页公开数据 | mixed | high | 来源混杂、稳定性不一、部分能力需会员或额外依赖 | 适合作为 A 股/板块/财务/新闻快速汇总层，建议拆源分模块接入 |
| vnpy_ifind | GitHub | https://github.com/vnpy/vnpy_ifind | direct | market-terminal bridge | README 可读 | 同花顺 iFinD、期货/股票/ETF 期权历史 K 线 | iFinDPy 付费数据服务、同花顺终端授权体系 | market-terminal | high | 账号与采购门槛高，偏机构路线 | 若后续要接专业终端数据，这是比网页抓取更正规的路线 |
| tsrs-mcp-server | GitHub | https://github.com/hanxuanliang/tsrs-mcp-server | direct | MCP / market data | README 可读 | TuShare、同花顺 App 热榜、开盘啦概念、资金流 | TuShare token、同花顺热榜数据、开盘啦概念板块数据 | api | high | 依赖第三方 token 与国内数据平台策略；需要核实商业许可 | 很适合提取“热榜 + 题材 + 资金流”维度，优先做国内市场热点补充 |
| Database Lookup | K-Dense scientific skills | https://github.com/K-Dense-AI/claude-scientific-skills | unstable | multi-database lookup | 总 docs 可读 | NASA、NIST、SDSS、PubChem、ChEMBL、DrugBank、FDA、USPTO、SEC EDGAR、FRED、World Bank、US Treasury、Alpha Vantage 等 100+ 数据库 | 本质是一个多数据库入口 skill，可拆成几十条公共 API 上游 | api | high | 非单一来源，适合拆源而不是整 skill 引入 | 先拆出和 `虾报道` 最相关的经济、监管、专利、环境、天气几条 API |
| Literature Search | K-Dense scientific skills | https://github.com/K-Dense-AI/claude-scientific-skills | unstable | literature search | 总 docs 可读 | OpenAlex、Crossref、Semantic Scholar、CORE、Unpaywall、bioRxiv、medRxiv、arXiv | 文献检索与开放获取链路可直接拆用 | mixed | high | 更偏学术世界，但对科技/AI 子世界很有价值 | 可直接形成“科技/AI 信源子层” |
| U.S. Treasury Fiscal Data | K-Dense scientific skills / skills-hub.ai Scientific Skills | https://github.com/K-Dense-AI/claude-scientific-skills | unstable | macro / fiscal data | 总 docs + skills-hub.ai detail 可读 | U.S. Treasury Fiscal Data API | 美国财政部公开 REST API；skills-hub.ai 详情进一步明确 `54 datasets`、`182 data tables`、`Debt to the Penny`、`Daily Treasury Statements`、`Monthly Treasury Statements`、`Treasury auctions`、`interest rates`、`exchange rates`、`savings bonds` 且 `no API key required` | api | high | 偏宏观财政，需要和地区性叙事结合 | 可作为宏观金融与地缘经济演绎的权威底层信源 |
| AI Research Skills / autoresearch | Orchestra Research | https://github.com/Orchestra-Research/AI-Research-SKILLs | unstable | research orchestration | README 可读 | 官方 repo、issues、文档、研究流程 | 上游更像知识与工程经验，而不是单条信源 feed | mixed | medium | 适合拆“研究 orchestration 方法”，不适合直接做信源源头 | 作为 skill 设计参考保留 |
| ak-rss-24h-brief | VoltAgent awesome-openclaw-skills / ClawHub ecosystem | https://github.com/VoltAgent/awesome-openclaw-skills | unstable | rss briefing / monitoring | awesome list / registry 描述可读 | RSS、Atom、OPML 导入的新闻与博客 feed | 直接消费 RSS/Atom 源，按最近 24 小时抓文并生成中文分类简报 | rss | high | 更像“通用 feed 汇聚器”，需要额外做源去重与可信度规则 | 很适合作为 `虾报道` 的基础 RSS 发现层样本 |
| blogwatcher | VoltAgent awesome-openclaw-skills / ClawHub / ClawSkills | https://clawskills.sh/skills/steipete-blogwatcher | unstable | blog / rss monitor | awesome list + ClawSkills detail 可读 | 博客、RSS、Atom feeds | 持续监控博客与 feed 更新，偏公开网页和 feed 的轻量监测 | mixed | medium | 更偏博客监测而非世界事件，但对科技/AI 子世界有价值 | 可作为技术博客/研究博客监测层候选 |
| news-aggregation | OpenClaw community skill corpus / skills-hub.ai Open Skills | https://gist.github.com/alperyilmaz/027cb9d08fa8cecc7ff252b6bb4256df | unstable | news aggregation | public gist + skills-hub.ai detail 可读 | Reuters World RSS、AP Top News RSS、BBC World RSS、Al Jazeera RSS、Guardian World RSS、NPR RSS、Google News RSS、Bing News RSS、Hacker News RSS、Reddit `/r/news/.rss` | gist 已确认多源新闻聚合与去重窗口，skills-hub.ai 详情进一步点名 Reuters/AP/BBC/Al Jazeera/Guardian/NPR/Google/Bing/HN/Reddit 等公开 feed | rss | high | 当前一部分证据来自 gist、一部分来自 skills-hub.ai 镜像页；正式仓库入口还可继续追到 Open Skills 原仓 | 很适合做“无 key 新闻聚合”最小实现参考，也适合补齐权威国际新闻 RSS 列表 |
| News Monitor Skill | SkillsMP | https://skillsmp.com/skills/claude-office-skills-skills-news-monitor-skill-md | unstable | news / monitoring | SkillsMP detail page 可读 | news monitoring tools、RSS feeds | 明确建议用 RSS 持续监控新闻并形成跟踪流程 | rss | medium | 当前更像监测框架而非完整抓取器 | 可作为“按主题持续盯新闻”的技能模板 |
| aggregating-crypto-news | SkillsMP | https://skillsmp.com/zh/skills/jeremylongshore-claude-code-plugins-plus-skills-plugins-crypto-crypto-news-aggregator-skills-aggregating-crypto-news-skill-md | unstable | crypto / news aggregation | SkillsMP detail page 可读 | 50+ crypto authoritative sources via RSS | 明确使用 50+ 权威来源 RSS 聚合加密货币新闻 | rss | high | 偏加密货币垂类，但非常像可直接复用的信源聚合模式 | 可做垂直金融/风险子世界样本 |
| daily-news-report | LobeHub Skills Marketplace / Antigravity Awesome Skills / CLSkills.in | https://lobehub.com/zh/skills/rookie-ricardo-erduo-skills-daily-news-report | direct | news / daily report | LobeHub detail page + Antigravity SKILL.md + sources.json + CLSkills raw SKILL.md 可读 | Hacker News、HuggingFace Papers、One Useful Thing、Paul Graham Essays、预设 URL 列表、网页与 RSS 源 | Antigravity 源码确认网页/RSS 抓取、去重、语言检测、主题匹配、质量评分与结构化日报输出；CLSkills.in 还能直接提供 raw `daily-news-report.md` | mixed | high | 当前偏技术新闻日报，但模式非常适合迁移到其他主题 | 很适合作为“可审计新闻日报”样本 |
| financial-analysis | SkillsMP | https://skillsmp.com/skills/geogons-skill-financial-analyst-skill-md | unstable | finance / analysis | SkillsMP detail page 可读 | 14+ free APIs、20+ RSS feeds | 明确聚合 14+ 金融 API 与 20+ RSS，生成股票分析、评级和目标价 | mixed | high | 偏证券分析，不完全等于世界信号，但上游很清晰 | 很适合作为国际金融市场子世界样本 |
| financial-data-fetcher | SkillsMP | https://skillsmp.com/skills/gracefullight-stock-checker-agents-skills-financial-data-fetcher-skill-md | unstable | finance / market data | SkillsMP detail page 可读 | Alpaca market data、Yahoo Finance/yfinance、financial news、fundamental data | skills-rank / playbooks 镜像页已明确点名 `alpaca-trade-api`、`yfinance`、`requests`，并展示了 market data + news + fundamentals 组合形态 | mixed | high | 仍需继续区分新闻层到底是 Bloomberg 示例还是独立新闻 API，但行情主链路已经清楚 | 适合做金融数据抓取型 skill 的下一轮深挖对象 |
| finance-data | SkillsMP | https://skillsmp.com/skills/austinjunyuli-austins-skills-skills-finance-data-skill-md | unstable | macro / finance data access | SkillsMP detail page 可读 | FRED、U.S. Treasury Fiscal Data、SEC EDGAR、OFR Hedge Fund Monitor、Alpha Vantage | 把公开宏观、财政、监管披露、对冲基金监测和市场数据统一到一个技能面 | mixed | high | 非常像“宏观金融 front door”，但需要后续拆清各上游的频率和限制 | 极适合作为国际宏观金融子世界入口 |
| finnhub-api | Agent Skills CLI Marketplace | https://www.agentskills.in/ja/marketplace/%40adaptationio/finnhub-api | unstable | financial API / market data | Agent Skills detail page 可读 | Finnhub、stocks、forex、crypto、market news、fundamentals、company profiles、financial statements、insider trading、earnings calendars | 详情明确围绕 Finnhub financial data API，覆盖实时行情、公司资料、财务报表、内幕交易、财报日历和市场新闻；已补出 `quote / stock/candle / company-news / calendar/earnings` canonical endpoint 家族 | api | high | 依赖 Finnhub key/配额，且新闻与基本面字段需要后续细分用途 | 很适合作为金融实时行情、公司资料、事件日历与市场新闻的统一 API 样本 |
| twelvedata-api | Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace/%40adaptationio/twelvedata-api | unstable | financial API / time series data | Agent Skills detail page 可读 | Twelve Data、stocks、forex、crypto、ETFs、time series、technical indicators、real-time streaming quotes | 详情明确围绕 Twelve Data financial API，覆盖时间序列、技术指标、基本面和实时流式报价；已补出 `quote / time_series / earnings / earnings_calendar` canonical endpoint 家族 | api | high | 依赖 Twelve Data key/配额；更偏行情与技术分析层，新闻与事件能力不如 Finnhub 完整 | 很适合作为跨资产时间序列与技术指标的直接数据源样本 |
| hedgefundmonitor | Agent Skills CLI Marketplace | https://www.agentskills.in/zh-CN/marketplace/%40K-Dense-AI/hedgefundmonitor | unstable | macro / hedge fund systemic risk data | Agent Skills detail page 可读 | OFR Hedge Fund Monitor API、SEC Form PF aggregated statistics、CFTC Traders in Financial Futures、FICC Sponsored Repo、FRB SCOOS | 详情明确围绕 OFR Hedge Fund Monitor API，覆盖对冲基金规模、杠杆、对手方、流动性、复杂度与风险管理时间序列，且无需 API key 或注册 | api | high | 偏美国金融稳定与对冲基金监测垂类，主题较窄但公共性很强 | 很适合作为宏观风险与杠杆监测子层样本，也能反向补强 `finance-data` 的 OFR 路线 |
| wrds | Agent Skills CLI Marketplace | https://www.agentskills.in/ja/marketplace/%40edwinhu/wrds | unstable | institutional financial database access | Agent Skills detail page 可读 | WRDS、Compustat、CRSP、Form 4 insider data、ISS compensation、SEC EDGAR、ExecuComp、Capital IQ、FISD、PitchBook、SDC、FJC | 详情明确面向 WRDS PostgreSQL / SAS ETL 工作流，并点名 Wharton WRDS、证券诉讼、基金、债券、新股与并购等多类机构数据库 | market-terminal | high | 强依赖 WRDS 订阅、院校/机构授权与数据使用合规，无法作为开放信源直接普及 | 适合作为机构级金融研究路线样本，优先作“方法与源系参考”，必要时再桥接合规接入 |
| tushare | Agent Skills CLI Marketplace | https://www.agentskills.in/zh-CN/marketplace/%40openclaw/tushare | unstable | china market data / macro indicators | Agent Skills detail page 可读 | Tushare API、中国股票行情、期货数据、公司基本面、宏观指标、实时行情、资金流向、GDP/CPI/PPI | 详情明确支持 `stock_basic`、`daily`、`weekly`、`monthly`、`realtime`、`moneyflow`、`company`、`fut_basic`、`fut_daily`、`fut_holding`、`gdp`、`cpi`、`ppi`，需 `TUSHARE_TOKEN`；已补出 `api.tushare.pro` 与官方文档入口 | api | high | 依赖 Tushare token 与其商业/积分体系，部分字段和频率有门槛 | 很适合作为 A 股/期货/宏观子层的标准 API 样本，也能与 `pywencai / qstock / iFinD` 形成对照 |
| fmp-api | Agent Skills CLI Marketplace | https://www.agentskills.in/ja/marketplace/%40adaptationio/fmp-api | unstable | financial API / filings + ownership data | Agent Skills detail page + embedded examples 可读 | Financial Modeling Prep、stocks、fundamentals、SEC filings、institutional holdings (13F)、congressional trading、financial statements、ratios、DCF、insider ownership、earnings calendar | 详情与示例代码明确围绕 FMP API，已确认 `/sec-filings`、`/earnings-calendar`、历史价格、公司搜索与财务/估值/持股相关能力；并已补出 `quote / quote-short / search-symbol / profile / earnings-transcript-list` 这组 canonical endpoint | api | high | 依赖 FMP key/配额；部分字段与历史深度随套餐变化 | 很适合作为财报、13F、国会议员交易、估值与公司研究的一体化 API 样本 |
| openinsider | Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace/%40openclaw/openinsider | unstable | sec insider trading / form 4 | Agent Skills detail page 可读 | OpenInsider、SEC Form 4、Directors、CEOs、Officers、corporate insider buying/selling | 详情页 meta description 已明确这是围绕 OpenInsider 抓取 SEC Form 4 董监高内幕交易数据的技能，用于追踪 corporate insider buying/selling signals | webpage | high | OpenInsider 属于再包装站而非 SEC 官方直连；使用时需注意与 EDGAR/Form 4 原始披露核对 | 很适合作为内幕交易与高管买卖信号的轻量直观入口样本 |
| quiver | Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace/%40openclaw/quiver | unstable | alternative financial data / political trading | Agent Skills detail page 可读 | Quiver Quantitative、Congress trading、Lobbying、Government Contracts、Insider transactions | 详情页 meta description 已明确围绕 Quiver Quantitative 的另类金融数据，覆盖国会议员交易、游说、政府合同与内幕交易，用于追踪 politician trades 和 unconventional market signals | api | high | 依赖 Quiver Quantitative 数据口径与套餐；其中部分数据本身也是聚合层而非最终原始披露 | 很适合作为政策-市场联动、另类数据和事件驱动信号的样本 |
| cninfo-to-notebooklm | Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace/%40NeverSight/cninfo-to-notebooklm | unstable | china filings / annual report ingestion | Agent Skills detail page 可读 | CNINFO、年度报告、季报、半年报、PDF、NotebookLM | 详情页嵌入内容已明确会从 cninfo 下载最近五年年报与当年季报/半年报/Q3 报告，再上传到 NotebookLM 做 A 股公司研究，核心上游是巨潮资讯 PDF 披露 | mixed | high | 后半段依赖 NotebookLM 工作流；实际抓取稳定性和公告命名规则仍需继续验证 | 很适合作为中国公司公告、年报季报与 PDF 研究流的专题样本 |
| knowledgelm-nse | Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace/%40eggmasonvalue/knowledgelm-nse | unstable | india company filings / investor documents | Agent Skills detail page 可读 | NSE India、company filings、transcripts、investor presentations、credit ratings、annual reports、NotebookLM | 详情页 meta description 已明确支持批量下载 `NSE India` 上的公司公告材料，包括 transcripts、investor presentations、credit ratings 和 annual reports，并可选接入 NotebookLM | mixed | high | 后半段依赖 NotebookLM；目前主要确认到 NSE 侧材料下载，BSE 或其他印度披露镜像尚未补齐 | 很适合作为印度市场公告、年报和投资者材料的专题样本，也补上了非中美市场的披露入口 |
| market-data | SkillsMP | https://skillsmp.com/skills/joellewis-finance-skills-plugins-data-integration-skills-market-data-skill-md | unstable | market data architecture / vendor evaluation | SkillsMP detail page 可读 | Bloomberg、Refinitiv、SIP、direct feeds、Level 2/3 market data | 更偏市场数据源选择与接入架构，而不是单一 API；适合反向识别专业数据商和交易所 feed | market-terminal | medium | 偏数据架构与供应商选择，不是直接抓公开信源 | 可作为机构级市场数据路线参考 |
| global-stock-analysis | SkillsMP | https://skillsmp.com/skills/alphavantage-alpha-vantage-mcp-skills-global-stock-analysis-skill-md | unstable | global equities / market analysis | SkillsMP detail page 可读 | Alpha Vantage、US/China/EU stocks、technicals、fundamentals | 明确绑定 Alpha Vantage 这条官方/准官方市场数据路线 | api | high | 偏证券分析，但上游明确、覆盖全球市场 | 可作为国际股票与宏观情绪视图样本 |
| alpha-vantage | SkillsMP / Antigravity ecosystem / skills-hub.ai Scientific Skills / CLSkills.in | https://skillsmp.com/skills/sickn33-antigravity-awesome-skills-skills-alpha-vantage-skill-md | unstable | global market data | SkillsMP detail + skills-hub.ai instructions + CLSkills raw SKILL.md 可读 | Alpha Vantage equities、options、forex、crypto、commodities、economic indicators、news sentiment、earnings call transcript、insider transactions | SkillsMP 已确认 Alpha Vantage 是全球市场数据总入口，skills-hub.ai 进一步补出 `GLOBAL_QUOTE`、`TIME_SERIES_*`、`NEWS_SENTIMENT`、`EARNINGS_CALL_TRANSCRIPT`、`TREASURY_YIELD`、`CPI`、`GDP` 与 `ALPHAVANTAGE_API_KEY` 接法；CLSkills.in 还直接提供 raw `alpha-vantage.md` | api | high | 依赖 Alpha Vantage key 与配额，但上游极其明确 | 很适合作为全球市场与宏观数据总入口样本 |
| alphaear-news | SkillsMP / skills-hub.ai Finance Skills (CN/EN) | https://skillsmp.com/skills/rkiding-awesome-finance-skills-skills-alphaear-news-skill-md | unstable | finance / news signal | SkillsMP detail + skills-hub.ai detail 可读 | Weibo、Zhihu、WallstreetCN、Polymarket finance market data | SkillsMP 已确认金融新闻与财报相关信息流，skills-hub.ai 详情进一步点名 `Weibo`、`Zhihu`、`WallstreetCN` 与 `Polymarket` 聚合 | mixed | high | 中文金融社媒与预测市场的稳定性、采样偏差和合规边界需要单独标注 | 可作为中文金融热点与情绪层补充样本，也适合作为预测市场辅助源 |
| mm-company-desk | SkillsMP | https://skillsmp.com/skills/shinygua-marketmind-alphaengine-claude-skills-mm-company-desk-skill-md | unstable | company intelligence / catalyst tracking | SkillsMP detail page 可读 | company news、SEC filings、catalyst calendar、NewsAPI、web search、EDGAR | 明确把公司新闻、EDGAR 与事件日历串在一起，适合公司级跟踪 | mixed | high | 需要核实 NewsAPI 等付费/速率限制 | 很适合公司/标的跟踪子世界 |
| earnings-calendar | SkillsMP | https://skillsmp.com/skills/quantumiodb-quantwise-plugins-trading-skills-skills-earnings-calendar-skill-md | unstable | earnings / event calendar | SkillsMP detail page 可读 | FMP API earnings data | 明确使用 Financial Modeling Prep API 获取财报日历和结构化事件数据 | api | high | 依赖 FMP API，可达性和配额需后续确认 | 适合事件驱动型金融子世界 |
| market-analysis | SkillsMP | https://skillsmp.com/skills/akhilgurrapu-kubera-claude-skills-market-analysis-skill-md | unstable | market analysis | SkillsMP detail page 可读 | yfinance、Alpha Vantage、market news | 结合行情 API 与新闻，形成分析报告 | mixed | medium | 偏分析层，信源层面不如 finance-data 明确 | 可作为中层分析模板保留 |
| industry-research | SkillsMP | https://skillsmp.com/skills/rkreddyp-investrecipes-claude-skills-industry-research-skill-md | unstable | industry / research | SkillsMP detail page 可读 | industry trends、market players、market dynamics、industry news | 强调行业新闻跟踪、市场结构、未来展望，偏“行业研究框架 + 新闻输入” | mixed | medium | 更偏研究方法，不一定有固定结构化源 | 适合作为产业链/行业研究子世界模板 |
| arxiv-viewer | LobeHub Skills Marketplace | https://lobehub.com/skills/actionbook-actionbook-arxiv-viewer | direct | literature / arxiv | LobeHub detail page 可读 | arXiv papers | 明确围绕 arXiv 浏览与查看论文信息 | api | high | 偏论文浏览，不一定自动跟踪，但信源明确 | 适合作为 AI/科技子世界的文献入口样本 |
| academic-research | SkillsMP | https://skillsmp.com/skills/joshuaroll-research-skills-skills-academic-research-skill-md | unstable | literature / academic research | SkillsMP detail page 可读 | Semantic Scholar、ArXiv | 明确把 Semantic Scholar 与 ArXiv 作为学术研究输入源 | api | high | 偏研究分析层，但上游源非常清晰 | 可作为文献检索与论文影响力分析子层样本 |
| 10k-10q-earnings-report-summarizer | Claude SkillHub | https://claudeskillhub.com/skills/10k-10q-earnings-report-summarizer | unstable | sec filings / earnings report | Claude SkillHub detail page 可读 | SEC filings、10-K、10-Q、earnings reports | 明确把 100-300 页 SEC filings 转成投资者摘要，含风险、红绿旗、财务分析 | webpage | high | 需要继续确认是否直接抓 EDGAR 还是用户上传 filing/transcript | 可作为 SEC 披露摘要型 skill 样本 |
| earnings-call-transcript-analyzer | Claude SkillHub | https://claudeskillhub.com/skills/earnings-call-transcript-analyzer | unstable | earnings transcript analysis | Claude SkillHub detail page 可读 | earnings call transcripts、forward guidance、management tone、analyst questions | 明确围绕 30-50 页财报电话会 transcript 提取投资信号 | webpage | high | 上游 transcript 站点未细化，仍需确认来源 | 可作为公司事件与管理层语气分析样本 |
| macro-trend-beneficiary-finder | Claude SkillHub | https://claudeskillhub.com/skills/macro-trend-beneficiary-finder | unstable | macro / equity screening | Claude SkillHub detail page 可读 | macro trends、publicly-traded companies、value chain analysis | 基于宏观趋势识别受益上市公司与价值链暴露层级 | mixed | medium | 更偏研究框架，上游具体宏观数据源未点名 | 可作为宏观主题向公司池传导的研究模板 |
| xvary-stock-research | Antigravity Awesome Skills / CLSkills.in | https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/xvary-stock-research | unstable | equity research / SEC + market data | SKILL.md、edgar guide、market.py、edgar.py 源码 + CLSkills raw SKILL.md 可读 | SEC EDGAR、Yahoo Finance、Finviz、Stooq | 源码确认 EDGAR company_tickers、companyfacts、submissions，以及 Yahoo -> Finviz -> Stooq 行情 fallback；CLSkills.in 还直接提供 raw `xvary-stock-research.md` | mixed | high | 公开源路线清晰，但需遵守 SEC User-Agent 与 rate limit | 极适合公司级金融研究和公开市场数据 PoC |
| hugging-face-papers | Antigravity Awesome Skills / VoltAgent awesome-agent-skills | https://officialskills.sh/huggingface/skills/hugging-face-paper-pages | unstable | literature / AI papers | Antigravity SKILL.md + officialskills detail 可读 | Hugging Face Paper Pages、arXiv、HF Hub paper URLs | 明确读取 HF paper pages 与 arXiv paper URLs，并关联模型、数据集、Spaces、GitHub/project page | api | high | 主要偏 AI 论文世界，需限定到科技/AI 子世界 | 适合作为 AI 论文热榜与论文-模型-数据集关联源 |
| apify-market-research | Antigravity Awesome Skills / CLSkills.in | https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/apify-market-research | unstable | market research / web data extraction | SKILL.md + CLSkills raw SKILL.md 可读 | Google Maps、Google Trends、Facebook Marketplace、Instagram、Booking.com、TripAdvisor | 明确通过 Apify Actors / mcpc 调用多平台 actor 做市场密度、区域兴趣、价格和需求研究；CLSkills.in 还直接提供 raw `apify-market-research.md` | mixed | high | 依赖 APIFY_TOKEN，且部分平台抓取有合规与可达性风险 | 适合作为行业/地理/消费行为信源扩展样本 |
| market-sizing-analysis | Antigravity Awesome Skills / CLSkills.in | https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/market-sizing-analysis | unstable | market sizing / industry research | SKILL.md + data-sources.md + CLSkills raw SKILL.md 可读 | Gartner、Forrester、IDC、McKinsey、Statista、CB Insights、PitchBook、Grand View Research、ZoomInfo | data-sources.md 已列出行业研究报告、市场规模站与行业数据库来源；现已进一步落到 `Gartner / Forrester / IDC / McKinsey / Statista / CB Insights / PitchBook / Grand View Research / ZoomInfo` 具体站点并完成一轮可达性实测 | mixed | medium | 多为付费或报告型来源，不适合直接自动抓全量；但可作为人工核验与专题研究的重要底图 | 可作为产业研究来源地图和人工验证参考 |
| binance-trading-signal | VoltAgent awesome-agent-skills / officialskills | https://officialskills.sh/binance/skills/trading-signal | unstable | crypto / on-chain trading signals | officialskills detail page 可读 | Binance Web3、Smart Money signals、Solana、BSC | 明确抓取 Binance Web3 on-chain Smart Money 买卖信号、触发价、现价、最大收益与退出率 | api | high | 加密资产高波动，需注意 Binance API 账号/区域和合规限制 | 可作为 crypto 市场风险与链上资金信号样本 |
| binance-spot | VoltAgent awesome-agent-skills / officialskills | https://officialskills.sh/binance/skills/spot | unstable | crypto / market data and trading | officialskills detail page 可读 | Binance REST API、spot orders、market data、account info | 明确通过 Binance REST API 下单、查询市场数据与账户信息 | api | medium | 交易型能力风险高，接入 `虾报道` 时只建议只读 market data，不启用交易 | 可作为 crypto 行情只读数据源参考 |
| notion-research-documentation | VoltAgent awesome-agent-skills / officialskills | https://officialskills.sh/openai/skills/notion-research-documentation | unstable | internal knowledge / research documentation | officialskills detail page 可读 | Notion pages、source-page citations | 明确搜索 Notion 页面并生成带引用的 briefs、summaries、comparisons、reports | api | medium | 不是公共信源，更适合接组织内部知识库 | 可作为“内部信源/组织知识”适配参考 |
| finance-news | ClawSkills | https://clawskills.sh/skills/kesslerio-finance-news | unstable | finance / news briefing | ClawSkills detail page 可读 | market news briefings | 明确围绕 market news briefings 与 AI summaries，具体源站仍待继续拆 | mixed | medium | 当前上游还没细化到具体媒体或 API | 可作为金融新闻摘要层候选 |
| academic-research-hub | ClawSkills | https://clawskills.sh/skills/anisafifi-academic-research-hub | unstable | literature / academic research | ClawSkills detail page 可读 | academic papers、research documents、citations | 明确围绕学术论文搜索、文档下载、引文抽取，具体学术源仍待继续拆 | mixed | medium | 当前未细化到 OpenAlex/arXiv 等具体上游 | 可作为文献研究流程型样本 |
| rss-digest | ClawSkills | https://clawskills.sh/skills/odysseus0-rss-digest | unstable | rss digest | ClawSkills detail page 可读 | RSS feeds、feed CLI | 明确写出基于 feed CLI 的 agentic RSS digest | rss | high | 更像通用 RSS 汇聚器，仍需补具体 feed 接入约束 | 很适合作为轻量 RSS 监测样本 |
| arxiv-watcher | ClawSkills | https://clawskills.sh/skills/rubenfb23-arxiv-watcher | unstable | literature / arxiv monitoring | ClawSkills detail page 可读 | ArXiv papers | 明确围绕 arXiv 检索与论文摘要 | api | high | 和 arxiv-viewer 邻近，但更偏持续监看 | 可作为文献跟踪型样本 |
| bbc-news | ClawSkills | https://clawskills.sh/skills/ddrayne-bbc-news | unstable | news / media feed | ClawSkills detail page 可读 | BBC News stories、sections、regions | 明确从 BBC News 不同栏目与地区抓取新闻故事 | webpage | high | 单一媒体源，适合做垂直来源样本 | 可作为单媒体新闻源参考 |
| stock-analysis | ClawSkills | https://clawskills.sh/skills/udiedrichsen-stock-analysis | unstable | equities / crypto analysis | ClawSkills detail page 可读 | stocks、cryptocurrencies、Yahoo Finance | 明确绑定 Yahoo Finance 数据路线 | api | medium | 偏分析层，但上游明确 | 可作为公开市场数据的轻量样本 |
| fda-database | AgentSkillsIndex | https://agentskillsindex.com/en/skills/davila7-claude-code-templates-fda-database | unstable | public database / FDA lookup | AgentSkillsIndex detail + SKILL.md 全文可读 | FDA database、regulatory records、medical product safety data | 明确围绕 FDA 数据库检索、监管记录、药品/医疗器械/安全事件信息 | api | high | 偏医疗/监管垂类，接入时需要避免医疗建议化，只做公开监管信号 | 可作为公共监管数据库与健康产业信号样本 |
| jina-reader | SkillKit | https://skillkit.io/skills/claude-code/jina-reader | unstable | web extraction / search / grounding | SkillKit detail + SKILL.md 全文可读 | Jina AI Reader API、URL-to-Markdown、web search、fact grounding | 明确支持 read/search/ground 三种模式，可把网页与搜索结果转成可引用内容 | api | high | 依赖 Jina 服务与配额，作为聚合层要标注二次抓取和事实核查边界 | 很适合作为网页全文抽取与搜索增强层 PoC |
| batch-research | AgentSkillsIndex | https://agentskillsindex.com/en/skills/wshobson-agents-batch-research | unstable | parallel web research | AgentSkillsIndex detail page 可读 | web research、parallel agent search、citation collection | 明确是并行研究代理/技能，用来批量检索、归纳与引用网页证据 | mixed | medium | 更偏研究编排层，不一定固定绑定单一上游源 | 可作为多虾并行搜证和汇总方法参考 |
| hugging-face-paper-publisher | AgentSkillsIndex / Hugging Face Skills / CLSkills.in | https://agentskillsindex.com/en/skills/huggingface/skills | unstable | HF paper publishing / paper graph | AgentSkillsIndex detail + SKILL.md 全文 + CLSkills raw SKILL.md 可读 | Hugging Face Paper Pages、arXiv、HF Hub models/datasets/spaces | 明确从 arXiv ID 建 Hugging Face paper page，并把论文与模型、数据集、Spaces 互联；CLSkills.in 还直接提供 raw `hugging-face-paper-publisher.md` | api | high | 偏发布与关联，不是纯发现；需要 HF_TOKEN 和写权限时不能默认自动执行 | 可作为 AI 论文-模型-数据集图谱关系样本 |
| reddit-fetch | AgentSkillsIndex | https://agentskillsindex.com/en/skills/ykdojo/claude-code-tips | unstable | reddit access workaround | AgentSkillsIndex detail + SKILL.md 全文可读 | Reddit pages、Gemini CLI web access | 明确在 Reddit WebFetch 403/blocked 时借 Gemini CLI 读取 Reddit 查询结果 | webpage | medium | 是绕过访问失败的工作流，不是稳定 API；需要标明二级代理与可复核性 | 可作为 Reddit 可达性异常时的人工/代理 fallback 方法 |
| exa-ai-search-automation | MCPMarket Agent Skills | https://mcpmarket.com/tools/skills/exa-ai-search-automation-2 | unstable | neural search / web data retrieval | MCPMarket detail page 可读 | Exa AI Search、Rube MCP、Composio | 明确用 Exa 做实时 web search、neural data retrieval、content extraction | api | high | 依赖 Rube MCP / Composio / Exa，需处理账号、配额与引用透明度 | 可作为高精度网页搜索与研究增强候选 |
| scrapingbee-automation | MCPMarket Agent Skills | https://mcpmarket.com/tools/skills/scrapingbee-web-scraping-automation | unstable | web scraping / extraction | MCPMarket detail page 可读 | ScrapingBee、Rube MCP、Composio | 明确用 ScrapingBee proxy / headless browser 做网页抓取与结构化抽取 | api | medium | 抓取类合规风险较高，不能默认绕过反爬；更适合受控站点或人工确认 | 作为网页抓取工具路线参考，不作为首批默认源 |
| stormglass-io-automation | MCPMarket Agent Skills | https://mcpmarket.com/tools/skills/stormglass-io-automation-3 | unstable | marine weather / environmental data | MCPMarket detail page 可读 | Stormglass IO API、marine weather、tides、wave heights、solar data | 明确通过 Stormglass IO 获取海洋天气、潮汐、波浪和环境数据 | api | high | 垂类强，需 API key/配额；适合航运、能源、灾害场景而非通用主世界 | 可作为航运/能源/环境风险子层候选 |
| market-research-agent | MCPMarket Agent Skills | https://mcpmarket.com/tools/skills/market-research-agent | unstable | market research / competitive intelligence | MCPMarket detail page 可读 | recent data、competitive analysis、source-backed claims | 明确要求 source-backed claims、竞争分析、TAM/SAM/SOM、投资人尽调与反证 | mixed | medium | 主要是研究框架，未点名固定上游 API；不应当作直接信源 | 可作为行业研究报告结构和证据校验模板 |
| zai-cli | n-skills | https://github.com/numman-ali/n-skills/tree/main/skills/tools/zai-cli/skills/zai-cli | unstable | web search / reader / GitHub code search | repo-collection SKILL.md 全文可读 | Z.AI real-time web search、Reader、GitHub code search、ZRead | 明确提供实时 web search、网页转 Markdown、GitHub 代码搜索与读取能力 | mixed | high | 依赖 `Z_AI_API_KEY`，作为搜索/阅读代理需要记录二级来源和模型侧引用边界 | 可作为网页搜索、网页阅读和 GitHub 源码检索的通用工具层候选 |
| goplaces | Agent-Skills.md | https://agent-skills.md/skills/steipete/clawdis/goplaces | unstable | places / local intelligence | Agent-Skills.md detail page 可读 | Google Places API、local places search | 明确围绕 Google Places 查询餐厅、咖啡馆等地点，并通过本地代理调用 | api | high | 地点数据需 API key/代理；适合地理与本地商业信号，不适合无边界抓取 | 可作为地理实体、区域活跃度和本地商业信号样本 |
| tavily | Agent-Skills.md | https://agent-skills.md/skills/steipete/clawdis/tavily | unstable | web search / content extraction | Agent-Skills.md index/detail 可读 | Tavily web search、content extraction、research | 明确围绕 Tavily web search、内容抽取和研究型检索 | api | high | 依赖 Tavily key/配额；作为聚合搜索层需要保留引用与检索时间 | 可作为搜索增强层候选，与 Jina / Exa / ZAI 做对照 |
| research | Agent Skills CLI Marketplace | https://www.agentskills.in/ja/marketplace/%40SherifEldeeb/research | unstable | research / monitoring | detail page + embedded SKILL.md 可读 | NVD API、MITRE ATT&CK、CISA US-CERT alerts RSS、NVD RSS、Krebs on Security、Schneier、Threatpost | 明确支持网页抽取、API 查询、RSS/Atom 聚合与安全情报汇总 | mixed | medium | 偏安全/威胁情报子域，不适合作为主世界通用入口，但方法和上游结构很清楚 | 可作为“专题子世界的信源研究 skill”保留，并为 RSS/API 双栈验证提供样本 |
| researchers-financial | Agent Skills CLI Marketplace / MCPMarket | https://www.agentskills.in/vi/marketplace/%40bitwize-music-studio/researchers-financial | unstable | financial research / sec + market narratives | detail page + mirrored marketplace evidence 可读 | SEC EDGAR、earnings call transcripts、analyst reports、company investor relations、stock exchange filings、bankruptcy court documents、financial journalism、stock price history | 详情明确给出 EDGAR company search、SEC full-text search、公司 IR、交易所披露、WSJ/FT/Bloomberg、股价历史等分层来源 | mixed | high | 偏人工研究与叙事重构，不是标准化 API-only skill；不同来源的版权和可复用边界要单独标注 | 适合作为 SEC / 财报电话会 / 市场反应 三层组合的金融调查样本 |
| scientific-skills-fred-economic-data | skills-hub.ai / Scientific Skills | https://skills-hub.ai/skills/scientific-skills-fred-economic-data | unstable | macro / economic data | detail page 内嵌 instructions 可读 | FRED API、ALFRED、GeoFRED、St. Louis Fed release calendar | 明确给出 `api.stlouisfed.org/fred`、`fred.stlouisfed.org`、`alfred.stlouisfed.org`、`geofred.stlouisfed.org`、`fred.stlouisfed.org/releases/calendar` 与 releases / sources / tags / categories 端点 | api | high | 需要 `FRED_API_KEY`，但属于权威公开宏观数据链路，稳定性较强 | 很适合作为宏观金融、区域经济与政策叙事的权威底层信源 |
| finance-skills-yfinance-data | skills-hub.ai / Finance Skills | https://skills-hub.ai/skills/finance-skills-yfinance-data | unstable | market data / yahoo finance | detail page 内嵌 instructions 可读 | yfinance、Yahoo Finance quotes、history、options、earnings calendar、analyst targets、institutional holders | 明确围绕 `yfinance` 的 price / financials / options / earnings / analyst / holders / news 接口组织公开市场数据 | mixed | high | `yfinance` 依赖 Yahoo 非官方封装，速率和字段稳定性需单独标注 | 适合作为国际股票、期权、分析师预期和公司级市场信号的快速抓取层 |
| alphaear-search | skills-hub.ai / Finance Skills (CN/EN) | https://skills-hub.ai/skills/finance-skills-cn-alphaear-search | unstable | finance search / retrieval | detail page 内嵌 instructions 可读 | Jina、DuckDuckGo、Baidu、本地 `daily_news` RAG | 明确给出 `jina / ddg / baidu / local` 四类金融检索入口，并支持聚合搜索与本地新闻库检索 | mixed | high | 搜索层不是最终权威源，需要和具体网页或公告源一起使用 | 很适合作为金融检索扩展层、中文搜索补层和本地新闻库检索入口 |
| alphaear-stock | skills-hub.ai / Finance Skills (CN/EN) | https://skills-hub.ai/skills/finance-skills-cn-alphaear-stock | unstable | stock lookup / price history | detail page 内嵌 instructions 可读 | A-share / HK / US stock tickers、OHLCV、akshare、yfinance、EastMoney 直连 API | 详情明确给出 `search_ticker` 与 `get_stock_price` 能力，并点名 `akshare` 与 `yfinance` 作为 A/HK/US 股票检索和历史价格数据依赖 | mixed | high | `akshare` 和 `yfinance` 都是聚合/封装层，底层网页或接口可能变化 | 很适合作为中文股票检索与跨市场价格历史补层 |
| alphaear-sentiment | skills-hub.ai / Finance Skills (CN/EN) | https://skills-hub.ai/skills/finance-skills-cn-alphaear-sentiment | unstable | finance text sentiment | detail page 内嵌 instructions 可读 | FinBERT、本地新闻数据库、LLM sentiment prompt | 详情明确给出基于 `FinBERT` 的本地金融文本情绪分析与 `LLM` 补充分析流程，并可把结果写回 news sentiment 数据库 | mixed | medium | 它更偏分析层而不是原始信源层，本身不提供外部 feed | 很适合作为中文金融新闻情绪加工层和其他信源后的二次分析层 |
| octagon-finance-prediction-markets-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-prediction-markets-analysis | unstable | prediction market analysis workflow | detail page 内嵌 instructions 可读 | Kalshi、prediction_markets_history、octagon-prediction-markets-agent | 明确围绕 Kalshi 实时市场数据、历史 resolution 跟踪、bid/ask/volume/open interest 与 model probability 对比做研究报告，说明 Polymarket 即将支持；现已补出 `https://kalshi.com/markets/` 具体入口并完成可达性测试 | mixed | medium | 仍是 Octagon MCP 工作流层，当前主要绑定 Kalshi，底层模型概率与外部事件证据链需后续继续拆解 | 很适合作为预测市场与事件驱动研究 workflow 样本 |
| octagon-finance-sec-10k-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-sec-10k-analysis | unstable | sec filing analysis workflow | detail page 内嵌 instructions 可读 | SEC 10-K filings、octagon-sec-agent、octagon-financials-agent | 明确围绕 `10-K` 年报分析，输出 financial metrics、risk factors、business overview、MD&A 与 source citations | mixed | medium | 更像 Octagon MCP 编排层，真实底层数据仍需通过 Octagon agent 侧进一步拆源 | 可作为 SEC 年报分析 workflow 样本，适合补公司披露研究方法层 |
| octagon-finance-sec-10q-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-sec-10q-analysis | unstable | sec quarterly filing analysis workflow | detail page 内嵌 instructions 可读 | SEC 10-Q filings、octagon-sec-agent、octagon-financials-agent | 明确围绕 `10-Q` 季报分析，输出 quarterly metrics、segment breakdown、operating margins、interim updates 与 source citations | mixed | medium | 仍是 Octagon MCP 工作流层，底层 SEC 数据与财务指标抽取仍需通过 Octagon agent 侧继续拆解 | 可作为公司季度披露、环比趋势与分部表现研究 workflow 样本 |
| octagon-finance-sec-8k-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-sec-8k-analysis | unstable | sec current report analysis workflow | detail page 内嵌 instructions 可读 | SEC 8-K filings、octagon-sec-agent | 明确围绕 material events、corporate changes、M&A、leadership changes、earnings releases 与 1.01/1.02/1.03/1.05/2.01/2.02/4.01/4.02/5.01/5.02/5.07 等 item taxonomy 做 current report 分析 | mixed | medium | 仍是 Octagon workflow 层，底层 SEC 抓取和结构化增强路径仍封装在 agent 内 | 适合作为事件驱动公司披露与突发公司变化监测 workflow 样本 |
| octagon-finance-sec-proxy-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-sec-proxy-analysis | unstable | sec proxy / governance analysis workflow | detail page 内嵌 instructions 可读 | SEC DEF 14A、octagon-companies-agent、octagon-sec-agent、octagon-web-search-agent | 明确围绕 executive compensation、governance、shareholder voting matters、board composition 与 proxy statement 研究 | mixed | medium | 仍偏 Octagon workflow 层，治理与薪酬分析的外部富化路径仍需继续拆解 | 适合作为治理、薪酬与股东权利子线的 workflow 样本 |
| octagon-finance-earnings-call-analysis | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-earnings-call-analysis | unstable | earnings transcript analysis workflow | detail page 内嵌 instructions 可读 | earnings call transcripts、guidance extraction、transcript page citations | 明确围绕 earnings call transcript 分析 forward guidance、strategic initiatives、supply chain insights 与 follow-up questions | mixed | medium | 偏 transcript 工作流，上游 transcript 供应方仍未在详情中点名 | 可作为财报电话会研究与问答跟进 workflow 样本 |
| octagon-finance-stock-quote | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-stock-quote | unstable | real-time stock quote workflow | detail page 内嵌 instructions 可读 | real-time stock quotes、day range、52-week range、volume、market cap、moving averages、octagon-stock-data-agent | 明确围绕公开股票行情常用字段组织 quote 工作流，并给出多股票和技术位分析模式 | mixed | medium | 仍是 Octagon MCP 封装层，详情未直接点名底层市场数据供应商 | 可作为实时报价与技术位置分析 workflow 样本 |
| octagon-finance-analyst-estimates | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-analyst-estimates | unstable | sell-side consensus / estimate workflow | detail page 内嵌 instructions 可读 | analyst revenue estimates、EPS estimates、octagon-financials-agent | 明确围绕 revenue / EPS low-high-average estimates、analyst coverage counts 与 forward expectations 做一致预期分析 | mixed | medium | 属于卖方一致预期衍生层，底层券商或供应商 feed 未在详情中点名 | 适合作为市场预期、预期修正和一致预期跟踪 workflow 样本 |
| octagon-finance-price-target-summary | skills-hub.ai / Octagon Finance | https://skills-hub.ai/skills/octagon-finance-price-target-summary | unstable | analyst price target workflow | detail page 内嵌 instructions 可读 | StreetInsider、TheFly、Benzinga、octagon-stock-data-agent | 明确围绕 analyst price target summary、target trend、upside/downside potential 与 consensus expectations 组织分析，并点名聚合 StreetInsider / TheFly / Benzinga | mixed | medium | 仍是 Octagon workflow 层，但已经能点名具体卖方新闻/聚合上游 | 适合作为分析师目标价和卖方观点变化的 workflow 样本 |
| open-skills-get-crypto-price | skills-hub.ai / Open Skills | https://skills-hub.ai/skills/open-skills-get-crypto-price | unstable | crypto / market data | detail page 内嵌 instructions 可读 | CoinGecko API、Binance REST API、Coinbase spot / Exchange candles API | 详情明确给出 CoinGecko simple price / market chart、Binance ticker / klines、Coinbase spot / candles 的无登录公开接口 | api | high | 加密货币价格类接口速率限制和交易所地域可达性需额外标注 | 很适合作为 crypto 市场信号与价格确认的直接源层 |
| open-skills-free-weather-data | skills-hub.ai / Open Skills | https://skills-hub.ai/skills/open-skills-free-weather-data | unstable | weather / environmental data | detail page 内嵌 instructions 可读 | Open-Meteo forecast API、Open-Meteo archive API、wttr.in | 详情明确给出 forecast、archive 与 wttr.in 两条公开天气链路，适合现时与历史天气补证 | api | medium | 更偏环境背景源，不是主世界事件源；但对航运、灾害、农业和能源叙事有辅助价值 | 可作为天气扰动、海运天气和区域环境背景的辅助信源层 |
| open-skills-web-search-api | skills-hub.ai / Open Skills | https://skills-hub.ai/skills/open-skills-web-search-api | unstable | web search / retrieval | detail page 内嵌 instructions 可读 | SearXNG、searx.space instances.json、公开 SearXNG instances | 明确给出 `searx.space` 实例列表与多个公开 SearXNG 搜索实例，可作为无专有 key 的网页检索入口 | mixed | high | 公共实例稳定性与结果质量差异较大，需要实例轮换与可信源过滤 | 很适合作为 `虾报道` 的网页检索补层和低成本证据扩展入口 |
| competitive-intel | Agent Skills Directory (dmgrok) / nginity | https://raw.githubusercontent.com/alirezarezvani/claude-skills/main/c-level-advisor/competitive-intel/SKILL.md | unstable | competitive intelligence / market monitoring | raw SKILL.md 可读 | Crunchbase、TechCrunch、G2/Capterra、Twitter/X、LinkedIn、Indeed、press releases、Facebook Ad Library、Google Ad Library | 明确把产品变动、融资、招聘、合作、客户案例、广告与官网文案变化串成持续跟踪来源层；现已补出并实测 `Crunchbase / TechCrunch / G2 / Capterra / LinkedIn / Indeed / Facebook Ads Library / Google Ads Transparency Center` 这组具体入口 | mixed | medium | 多数是公开网页与商业平台页面，不是结构化 API；更适合做行业/公司长期监测而不是即时热点 | 可作为行业研究与公司竞争态势跟踪样本，适合补“市场动作层” |
| a-share-real-time-data | ClawHub / VoltAgent | https://clawhub.ai/wangdinglu/a-share-real-time-data | unstable | china equities / real-time market data | ClawHub detail page 可读 | A 股实时行情、bars、逐笔成交、实时 quotes | 明确写出 `mootdx/TDX protocol` 与 TDX 行情链路 | market-terminal | high | 偏国内股票专业数据，依赖非官方协议与行情链路稳定性 | 适合作为 A 股实时市场信号子层样本 |
| stock-data-collector | ClawHub | https://clawhub.ai/wang-junjian/stock-data-collector | unstable | china / hk historical market data | ClawHub detail + bundled readme 可读 | akshare、yfinance、A股历史数据、港股历史数据、CSV 导出 | ClawHub 详情与 bundled readme 已确认 A 股使用 `akshare`、港股使用 `akshare + yfinance`，支持批量采集和日/周/月/分钟等历史周期 | mixed | high | 偏历史行情收集与本地导出，不是实时监测；分钟级实现与文档存在轻微不一致 | 很适合作为 A 股/港股历史价格与回看层样本，也能和 `tushare / qstock` 形成互补 |
| hk-ipo-research-assistant | ClawHub | https://clawhub.ai/marvae/hk-ipo-research-assistant | unstable | hk ipo / allotment research | ClawHub detail + bundled readme 可读 | AiPO、AAStocks、HKEX、Futu、TradeSmart、Jisilu、ETNet、Tencent/Sina 行情 | ClawHub 安全分析与 bundled readme 已确认脚本适配 `aipo.myiqdii.com`、`AAStocks`、`HKEX`、`Futu`、`TradeSmart`、`Jisilu`、`ETNet` 以及 `sinajs/qt.gtimg` 等公开站点/接口，覆盖孖展、基石、暗盘、配售与保荐人数据 | mixed | high | 会写本地用户画像与缓存，且偏港股 IPO 垂类；第三方网页抓取稳定性需持续观察 | 很适合作为港股新股、配售、暗盘与券商热度的专题子世界样本 |
| dexter | ClawHub / sundial | https://clawhub.ai/igorhvr/dexter | unstable | financial research / filings | ClawHub detail page 可读 | stock analysis、financial statements、metrics、prices、SEC filings、crypto data | 把股票分析、公司财报、SEC 披露与 crypto 数据串在一起 | mixed | high | 更偏金融研究代理，需要继续确认具体上游 API 与配额 | 适合作为公司跟踪与多源金融研究样本 |
| arxiv-search-collector | ClawHub / VoltAgent | https://clawhub.ai/xukp20/arxiv-search-collector | unstable | literature / arxiv collection | ClawHub detail page 可读 | arXiv metadata、language-aware filtering、dedupe merge | 明确围绕 arXiv 元数据获取、语言筛选、相关性过滤与去重 | api | high | 偏文献收集流程，不一定直接做跟踪，但源很清楚 | 适合作为科技文献子世界的收集层样本 |
| topic-monitor | ClawHub / sundial | https://clawhub.ai/fardeenxyz/topic-monitor | unstable | topic monitoring / alerts | ClawHub detail page 可读 | topic monitoring、alerts、important developments | 更偏监控与预警框架，具体上游仍待继续拆 | mixed | medium | 当前上游信源未细化到具体站点/API | 可作为“按主题长期盯盘”的方法型样本 |
| EdgarTools AI Skill | GitHub / agent-skill ecosystem / skills-hub.ai Scientific Skills | https://github.com/dgunning/edgartools | direct | sec filings / finance research | README 与 skills-hub.ai detail 可读 | SEC EDGAR、XBRL、10-K、10-Q、8-K、Form 4、13F、DEF 14A、company filings | 通过 Python SDK 与 AI skill 安装，把 10-K、10-Q、8-K、Form 4、13F、DEF 14A、company screening 等 SEC 数据接成 agent skill，并要求规范配置 `EDGAR_IDENTITY` | api | high | 偏美股监管与财报世界，需要 `EDGAR_IDENTITY` 等规范配置 | 很适合金融监管与公司披露子世界 |
| sec-edgar-agentkit | GitHub | https://github.com/stefanoamorelli/sec-edgar-agentkit | direct | sec filings / agent toolkit | README 可读 | SEC EDGAR、financial statements、insider trading、company filings | 通过 agent toolkit / MCP / smolagents 等接法消费 SEC 数据 | api | high | 更像 toolkit 而非单 skill，但上游信源清晰且权威 | 可作为 EDGAR 方向的第二条正规路线 |
| SkillsMP marketplace feed | Agent Skills CLI Marketplace Docs / SkillsMP | https://www.agentskills.in/docs/marketplace | unstable | marketplace / meta-source | Docs fulltext 可读 | SkillsMP marketplace、Anthropic official skills、GitHub skill URLs | 文档明确写 `market-list`、`market-search`、`install-url`，并说明 SkillsMP 是 primary marketplace、legacy GitHub 是备用源 | mixed | medium | 这是“找 skill 的 skill”，不是直接信源，但对批量发现信源型 skill 非常关键 | 作为后续自动化抓取主市场样本的重要入口 |

## 第一批验证状态视图

| name | hub_origin | validation_status | validation_evidence | usable_for_xia_report | source_specificity | candidate_role_for_xia_report | integration_shape | priority_for_poc |
|---|---|---|---|---|---|---|---|---|
| last30days-skill | GitHub / prior research | verified | README + docs + CHANGELOG + 源码已确认 ScrapeCreators、OpenAI、xAI、Reddit JSON 等上游 | yes | named_upstreams | hotspot-discovery | aggregator-layer | p0 |
| ak-rss-24h-brief | VoltAgent / ClawHub | partially_verified | awesome list / registry 描述已确认 RSS、Atom、OPML 与 24h briefing 模式 | yes | broad_pattern | hotspot-discovery | aggregator-layer | p0 |
| news-aggregation | OpenClaw community corpus / skills-hub.ai Open Skills | partially_verified | gist 已确认 Google News RSS、多源聚合、去重与时间窗口；skills-hub.ai 详情进一步点名 Reuters/AP/BBC/Al Jazeera/Guardian/NPR/Google/Bing/HN/Reddit RSS | yes | named_upstreams | hotspot-discovery | aggregator-layer | p0 |
| blogwatcher | VoltAgent / ClawHub / ClawSkills | partially_verified | collection 描述 + ClawSkills 详情已确认博客/RSS/Atom 监控能力 | maybe | broad_pattern | tech-research | aggregator-layer | p2 |
| News Monitor Skill | SkillsMP | partially_verified | SkillsMP 详情已确认 RSS 驱动的持续新闻监控模式 | yes | broad_pattern | hotspot-discovery | aggregator-layer | p2 |
| aggregating-crypto-news | SkillsMP | partially_verified | SkillsMP 详情已确认 50+ crypto RSS 来源 | yes | named_upstreams | market-signal | aggregator-layer | p1 |
| daily-news-report | LobeHub / Antigravity / CLSkills.in | verified | LobeHub 详情 + Antigravity SKILL.md + sources.json 已确认 HN、HuggingFace Papers、One Useful Thing、Paul Graham Essays 等网页/RSS 源；CLSkills.in 还直接暴露 raw `daily-news-report.md` | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| finance-data | SkillsMP | verified | SkillsMP 详情已明确 FRED、Treasury Fiscal Data、SEC EDGAR、OFR、Alpha Vantage | yes | directly_usable | macro-regulatory | direct-source | p0 |
| financial-analysis | SkillsMP | verified | SkillsMP 详情已明确 14+ APIs、20+ RSS | yes | directly_usable | market-signal | aggregator-layer | p1 |
| financial-data-fetcher | SkillsMP | verified | SkillsMP + skills-rank / playbooks 镜像页已确认 `alpaca-trade-api` 与 `yfinance`，并补出 Alpaca / Yahoo Finance 直连入口 | yes | named_upstreams | market-signal | aggregator-layer | p1 |
| global-stock-analysis | SkillsMP | verified | SkillsMP 详情已明确 Alpha Vantage 路线 | yes | named_upstreams | market-signal | direct-source | p1 |
| alpha-vantage | SkillsMP / Antigravity / skills-hub.ai Scientific Skills / CLSkills.in | partially_verified | SkillsMP 与 skills-hub.ai 详情已确认 Alpha Vantage 覆盖 equities、options、forex、crypto、commodities、economic indicators、news sentiment、earnings call transcript、insider transactions，并给出 `ALPHAVANTAGE_API_KEY` 与核心函数名；CLSkills.in 还直接暴露 raw `alpha-vantage.md` | yes | named_upstreams | market-signal | direct-source | p1 |
| alphaear-news | SkillsMP / skills-hub.ai Finance Skills (CN/EN) | partially_verified | SkillsMP 详情已确认金融新闻与财报相关事件流；skills-hub.ai 详情进一步点名 Weibo、Zhihu、WallstreetCN 与 Polymarket | yes | named_upstreams | market-signal | aggregator-layer | p1 |
| mm-company-desk | SkillsMP | verified | SkillsMP 详情已确认 company news、EDGAR、NewsAPI、catalyst calendar | yes | named_upstreams | company-tracking | aggregator-layer | p1 |
| earnings-calendar | SkillsMP | verified | SkillsMP 详情已确认 Financial Modeling Prep API | yes | named_upstreams | company-tracking | direct-source | p1 |
| a-share-real-time-data | ClawHub / VoltAgent | partially_verified | ClawHub 详情已确认 A 股实时行情、逐笔成交与 mootdx/TDX protocol | yes | named_upstreams | market-signal | direct-source | p1 |
| stock-data-collector | ClawHub | partially_verified | ClawHub 详情与 bundled readme 已确认 `akshare` + `yfinance`，覆盖 A 股/港股历史数据批量采集与 CSV 导出 | yes | named_upstreams | market-signal | direct-source | p1 |
| hk-ipo-research-assistant | ClawHub | partially_verified | ClawHub 详情、bundled readme 与安全分析已确认 AiPO、AAStocks、HKEX、Futu、TradeSmart、Jisilu、ETNet、sinajs/qt.gtimg 等港股 IPO 相关上游 | yes | named_upstreams | company-tracking | aggregator-layer | p1 |
| dexter | ClawHub / sundial | partially_verified | ClawHub 详情已确认 stock analysis、financial statements、SEC filings、crypto data | yes | broad_pattern | company-tracking | aggregator-layer | p1 |
| arxiv-search-collector | ClawHub / VoltAgent | partially_verified | ClawHub 详情已确认 arXiv metadata 抓取、语言过滤、去重合并 | yes | named_upstreams | tech-research | direct-source | p1 |
| topic-monitor | ClawHub / sundial | partially_verified | ClawHub 详情已确认 topic monitoring 与重要变化预警，但具体上游仍待拆 | maybe | broad_pattern | hotspot-discovery | tooling-reference | p2 |
| EdgarTools AI Skill | GitHub / agent-skill ecosystem / skills-hub.ai Scientific Skills | verified | README 与 skills-hub.ai 详情已确认 SEC EDGAR、XBRL、10-K、10-Q、8-K、Form 4、13F、DEF 14A、company screening 与 `EDGAR_IDENTITY` 配置要求 | yes | directly_usable | macro-regulatory | direct-source | p0 |
| sec-edgar-agentkit | GitHub | verified | README 已确认 SEC EDGAR、financial statements、insider trading | yes | directly_usable | macro-regulatory | tooling-reference | p1 |
| tsrs-mcp-server | GitHub | verified | README 已确认 TuShare、同花顺热榜、开盘啦题材、资金流 | yes | directly_usable | market-signal | direct-source | p0 |
| pywencai | GitHub | verified | README 与生态已确认同花顺问财网页接口与 cookie 路线 | yes | named_upstreams | market-signal | direct-source | p1 |
| qstock | GitHub | verified | README 已确认东方财富、同花顺、新浪财经、问财组合 | yes | directly_usable | market-signal | aggregator-layer | p1 |
| vnpy_ifind | GitHub | verified | README 已确认 iFinD 终端授权与历史 K 线接口 | maybe | directly_usable | market-signal | direct-source | p2 |
| claude-scientific-alpha-vantage | K-Dense / TopicLab | partially_verified | docs 已明确 Alpha Vantage slug 和能力，但还未拆到独立 skill 内容 | yes | named_upstreams | market-signal | direct-source | p0 |
| U.S. Treasury Fiscal Data | K-Dense scientific skills / skills-hub.ai Scientific Skills | partially_verified | 总 docs 已明确 Treasury Fiscal Data API；skills-hub.ai 详情进一步确认 `54 datasets`、`182 data tables`、`Debt to the Penny`、`Daily Treasury Statements`、`Monthly Treasury Statements`、`Treasury auctions`、`interest rates`、`exchange rates`、`savings bonds` 且无需 API key | yes | named_upstreams | macro-regulatory | direct-source | p0 |
| Scientify | GitHub + 官方站 | verified | 源码已确认 arXiv、OpenAlex、Unpaywall 等具体 API | yes | directly_usable | tech-research | direct-source | p0 |
| Literature Search | K-Dense scientific skills | partially_verified | docs 已明确 OpenAlex、Crossref、Semantic Scholar、CORE、Unpaywall、bioRxiv、medRxiv、arXiv | yes | directly_usable | tech-research | direct-source | p0 |
| arxiv-viewer | LobeHub | partially_verified | LobeHub 详情已确认 arXiv 浏览入口 | yes | named_upstreams | tech-research | direct-source | p1 |
| academic-research | SkillsMP | partially_verified | SkillsMP 详情已确认 Semantic Scholar 与 ArXiv 双源输入 | yes | named_upstreams | tech-research | direct-source | p1 |
| 10k-10q-earnings-report-summarizer | Claude SkillHub | partially_verified | Claude SkillHub 详情已确认 SEC filings、10-K、10-Q 与 earnings report 摘要 | yes | named_upstreams | macro-regulatory | tooling-reference | p1 |
| earnings-call-transcript-analyzer | Claude SkillHub | partially_verified | Claude SkillHub 详情已确认 earnings call transcripts、guidance、management tone、analyst questions | yes | named_upstreams | company-tracking | tooling-reference | p1 |
| macro-trend-beneficiary-finder | Claude SkillHub | partially_verified | Claude SkillHub 详情已确认宏观趋势到上市公司价值链暴露分析 | maybe | broad_pattern | market-signal | tooling-reference | p2 |
| xvary-stock-research | Antigravity Awesome Skills / CLSkills.in | verified | Antigravity 源码已确认 SEC EDGAR company_tickers/companyfacts/submissions 与 Yahoo/Finviz/Stooq fallback 行情工具；CLSkills.in 还直接暴露 raw `xvary-stock-research.md` | yes | directly_usable | company-tracking | direct-source | p0 |
| hugging-face-papers | Antigravity / VoltAgent officialskills | verified | SKILL.md 与 officialskills 详情已确认 Hugging Face Papers、arXiv、模型/数据集/Spaces 关联 | yes | directly_usable | tech-research | direct-source | p0 |
| apify-market-research | Antigravity Awesome Skills / CLSkills.in | verified | Antigravity SKILL.md 已确认 Apify Actors 覆盖 Google Maps、Google Trends、Facebook Marketplace、Instagram、Booking.com、TripAdvisor；CLSkills.in 还直接暴露 raw `apify-market-research.md` | yes | named_upstreams | industry-research | aggregator-layer | p1 |
| market-sizing-analysis | Antigravity Awesome Skills / CLSkills.in | partially_verified | data-sources.md 已列出 Gartner、Forrester、IDC、McKinsey、Statista、CB Insights、PitchBook、Grand View Research 与 ZoomInfo；当前已对这些具体站点完成一轮连通性实测，其中 `Forrester / IDC / Statista / CB Insights / Grand View Research` 可直连，`Gartner / PitchBook / ZoomInfo` 为策略受限，`McKinsey` 当前出口下超时 | maybe | named_upstreams | industry-research | tooling-reference | p2 |
| binance-trading-signal | VoltAgent awesome-agent-skills / officialskills | verified | officialskills 详情已确认 Binance Web3 Smart Money signals、Solana、BSC、买卖方向、触发价和收益指标 | yes | directly_usable | market-signal | direct-source | p1 |
| binance-spot | VoltAgent awesome-agent-skills / officialskills | partially_verified | officialskills 详情已确认 Binance REST API、spot orders、market data、account info | maybe | named_upstreams | market-signal | direct-source | p2 |
| notion-research-documentation | VoltAgent awesome-agent-skills / officialskills | partially_verified | officialskills 详情已确认 Notion pages 搜索与带 source-page citations 的 briefs/reports | maybe | named_upstreams | tech-research | tooling-reference | p2 |
| finance-news | ClawSkills | partially_verified | ClawSkills 详情已确认 market news briefings 与 AI summaries | maybe | broad_pattern | market-signal | aggregator-layer | p2 |
| academic-research-hub | ClawSkills | partially_verified | ClawSkills 详情已确认 academic papers 搜索、文档下载、引文抽取 | maybe | broad_pattern | tech-research | tooling-reference | p2 |
| rss-digest | ClawSkills | partially_verified | ClawSkills 详情已确认基于 feed CLI 的 RSS digest | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| arxiv-watcher | ClawSkills | partially_verified | ClawSkills 详情已确认 ArXiv 搜索与摘要 | yes | named_upstreams | tech-research | direct-source | p1 |
| bbc-news | ClawSkills | partially_verified | ClawSkills 详情已确认从 BBC News 不同栏目与地区抓取新闻故事 | yes | named_upstreams | hotspot-discovery | direct-source | p1 |
| stock-analysis | ClawSkills | partially_verified | ClawSkills 详情已确认使用 Yahoo Finance 数据分析股票与加密货币 | yes | named_upstreams | market-signal | direct-source | p2 |
| fda-database | AgentSkillsIndex | partially_verified | AgentSkillsIndex 详情与 SKILL.md 已确认 FDA database、regulatory records、medical product safety data | yes | named_upstreams | macro-regulatory | direct-source | p1 |
| jina-reader | SkillKit | verified | SkillKit 详情与 SKILL.md 已确认 Jina AI Reader API 的 read/search/ground 三种网页抽取与检索模式 | yes | directly_usable | hotspot-discovery | aggregator-layer | p0 |
| batch-research | AgentSkillsIndex | partially_verified | AgentSkillsIndex 详情已确认 parallel web research、搜证和 citation collection，但仍需继续拆具体搜索源 | maybe | broad_pattern | hotspot-discovery | tooling-reference | p2 |
| hugging-face-paper-publisher | AgentSkillsIndex / Hugging Face Skills / CLSkills.in | verified | AgentSkillsIndex 详情与 SKILL.md 已确认 Hugging Face Paper Pages、arXiv 与模型/数据集/Spaces 关联；CLSkills.in 还直接暴露 raw `hugging-face-paper-publisher.md` | yes | directly_usable | tech-research | direct-source | p1 |
| reddit-fetch | AgentSkillsIndex | partially_verified | AgentSkillsIndex 详情与 SKILL.md 已确认 Reddit blocked 时借 Gemini CLI 获取 Reddit 内容的 fallback 工作流 | maybe | broad_pattern | hotspot-discovery | tooling-reference | p2 |
| exa-ai-search-automation | MCPMarket Agent Skills | partially_verified | MCPMarket 详情已确认 Exa AI Search、Rube MCP、Composio、web search 与 content extraction | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| scrapingbee-automation | MCPMarket Agent Skills | partially_verified | MCPMarket 详情已确认 ScrapingBee、proxy/headless browser 抓取与 Rube MCP | maybe | named_upstreams | hotspot-discovery | tooling-reference | p2 |
| stormglass-io-automation | MCPMarket Agent Skills | partially_verified | MCPMarket 详情已确认 Stormglass IO API、marine weather、tides、wave/solar data | yes | named_upstreams | industry-research | direct-source | p1 |
| market-research-agent | MCPMarket Agent Skills | partially_verified | MCPMarket 详情已确认 source-backed claims、market sizing、competitive analysis 与 recent data 要求 | maybe | broad_pattern | industry-research | tooling-reference | p2 |
| zai-cli | n-skills | verified | repo-collection SKILL.md 已确认 Z.AI real-time web search、Reader、GitHub code search、ZRead | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| goplaces | Agent-Skills.md | partially_verified | Agent-Skills.md 详情已确认 Google Places API 与 local places search | yes | named_upstreams | industry-research | direct-source | p1 |
| tavily | Agent-Skills.md | partially_verified | Agent-Skills.md 目录/详情已确认 Tavily web search、content extraction、research | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| research | Agent Skills CLI Marketplace | partially_verified | 详情页与内嵌 SKILL.md 已确认 NVD API、MITRE ATT&CK、CISA/NVD/Krebs/Schneier/Threatpost RSS feeds | maybe | named_upstreams | hotspot-discovery | aggregator-layer | p2 |
| researchers-financial | Agent Skills CLI Marketplace / MCPMarket | partially_verified | Agent Skills 与 MCPMarket 两侧详情已确认 SEC EDGAR、earnings calls、analyst reports、IR、exchange filings、bankruptcy docs 与 market data 层次 | yes | named_upstreams | company-tracking | aggregator-layer | p1 |
| finnhub-api | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情已确认 Finnhub financial data API 覆盖 stocks、forex、crypto、news、fundamentals、company profiles、financial statements、insider trading 与 earnings calendars；并已补出 `quote / stock/candle / company-news / calendar/earnings` 直连路径 | yes | named_upstreams | market-signal | direct-source | p1 |
| twelvedata-api | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情已确认 Twelve Data financial API 覆盖 stocks、forex、crypto、ETFs、time series、technical indicators 与 real-time streaming quotes；并已补出 `quote / time_series / earnings / earnings_calendar` 直连路径 | yes | named_upstreams | market-signal | direct-source | p1 |
| hedgefundmonitor | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情已确认 OFR Hedge Fund Monitor API、SEC Form PF aggregated statistics、CFTC TFF、FICC Sponsored Repo 与 FRB SCOOS，并注明无需 API key | yes | named_upstreams | macro-regulatory | direct-source | p1 |
| wrds | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情已确认 WRDS、Compustat、CRSP、Form 4、ISS、SEC EDGAR、ExecuComp、Capital IQ、FISD、PitchBook、SDC 与 WRDS PostgreSQL/SAS ETL 路线 | maybe | named_upstreams | company-tracking | direct-source | p2 |
| tushare | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情已确认 Tushare API 覆盖中国股票、期货、公司基本面、实时行情、资金流向与 GDP/CPI/PPI 等宏观指标，并要求 `TUSHARE_TOKEN`；已补出 `api.tushare.pro` 与官方文档入口 | yes | named_upstreams | market-signal | direct-source | p1 |
| fmp-api | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情与示例代码已确认 Financial Modeling Prep API 覆盖 SEC filings、13F institutional holdings、congressional trading、financial statements、ratios、DCF、historical prices 与 earnings calendar；已补出 `quote / quote-short / search-symbol / profile / earnings-transcript-list` 直连路径 | yes | named_upstreams | company-tracking | direct-source | p1 |
| openinsider | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情页已确认 OpenInsider 与 SEC Form 4，覆盖 directors、CEOs、officers 等 corporate insider buying/selling signals | yes | named_upstreams | company-tracking | aggregator-layer | p1 |
| quiver | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情页已确认 Quiver Quantitative、Congress trading、Lobbying、Government Contracts 与 Insider transactions | yes | named_upstreams | market-signal | aggregator-layer | p1 |
| cninfo-to-notebooklm | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情页已确认 CNINFO/巨潮资讯下载最近五年年报与当年季报/半年报/Q3 报告 PDF，再接 NotebookLM 做公司研究 | yes | named_upstreams | macro-regulatory | aggregator-layer | p1 |
| knowledgelm-nse | Agent Skills CLI Marketplace | partially_verified | Agent Skills 详情页已确认 NSE India 公司 filings、transcripts、investor presentations、credit ratings 与 annual reports 的批量下载，并可选接 NotebookLM | yes | named_upstreams | macro-regulatory | aggregator-layer | p1 |
| scientific-skills-fred-economic-data | skills-hub.ai / Scientific Skills | partially_verified | skills-hub.ai 详情已确认 FRED API、ALFRED、GeoFRED、release schedule、release calendar 页面与 sources 端点 | yes | named_upstreams | macro-regulatory | direct-source | p1 |
| finance-skills-yfinance-data | skills-hub.ai / Finance Skills | partially_verified | skills-hub.ai 详情已确认 yfinance / Yahoo Finance 的 quotes、history、financials、options、earnings calendar、analyst、holders、news 接口 | yes | named_upstreams | market-signal | direct-source | p1 |
| alphaear-search | skills-hub.ai / Finance Skills (CN/EN) | partially_verified | skills-hub.ai 详情已确认 Jina、DDG、Baidu 与本地 daily_news RAG 搜索入口 | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| alphaear-stock | skills-hub.ai / Finance Skills (CN/EN) | partially_verified | skills-hub.ai 详情已确认 `search_ticker`、`get_stock_price`、A/HK/US ticker 检索、`akshare`、`yfinance` 依赖，并在源码中发现东方财富直连接口（Kline/List）作为降级路径 | yes | named_upstreams | market-signal | aggregator-layer | p1 |
| alphaear-sentiment | skills-hub.ai / Finance Skills (CN/EN) | partially_verified | skills-hub.ai 详情已确认 FinBERT 本地情绪分析、LLM sentiment prompt 与 news sentiment 数据库更新流程 | maybe | broad_pattern | market-signal | tooling-reference | p2 |
| octagon-finance-prediction-markets-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 Kalshi 实时 prediction market 数据、`prediction_markets_history`、model probability 对比、bid/ask/volume/open interest 与 Polymarket soon 提示；并已补测 `kalshi.com/markets/`，当前为 `429`，说明链路可达但有限流 | maybe | named_upstreams | market-signal | tooling-reference | p2 |
| octagon-finance-sec-10k-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 SEC 10-K 分析 workflow、`octagon-sec-agent`、`octagon-financials-agent` 与 source citations | maybe | named_upstreams | macro-regulatory | tooling-reference | p2 |
| octagon-finance-sec-10q-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 SEC 10-Q 分析 workflow、`octagon-sec-agent`、`octagon-financials-agent`、quarterly metrics 与 source citations | maybe | named_upstreams | macro-regulatory | tooling-reference | p2 |
| octagon-finance-sec-8k-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 SEC 8-K material event workflow、corporate changes、M&A、leadership changes 与 `octagon-sec-agent` | maybe | named_upstreams | macro-regulatory | tooling-reference | p2 |
| octagon-finance-sec-proxy-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 DEF 14A、executive compensation、governance、shareholder voting，以及 `octagon-companies-agent` / `octagon-sec-agent` / `octagon-web-search-agent` | maybe | named_upstreams | macro-regulatory | tooling-reference | p2 |
| octagon-finance-earnings-call-analysis | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 earnings call transcript 分析、guidance extraction、supply chain insights 与 transcript page citations | maybe | broad_pattern | company-tracking | tooling-reference | p2 |
| octagon-finance-stock-quote | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 real-time stock quote workflow、52-week range、volume、market cap 与 moving averages 输出 | maybe | broad_pattern | market-signal | tooling-reference | p2 |
| octagon-finance-analyst-estimates | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 revenue/EPS low-high-average estimates、analyst counts 与 `octagon-financials-agent` | maybe | broad_pattern | market-signal | tooling-reference | p2 |
| octagon-finance-price-target-summary | skills-hub.ai / Octagon Finance | partially_verified | skills-hub.ai 详情已确认 price target summary，并点名 `octagon-stock-data-agent` 聚合 StreetInsider、TheFly、Benzinga 等来源 | maybe | named_upstreams | market-signal | tooling-reference | p2 |
| open-skills-get-crypto-price | skills-hub.ai / Open Skills | partially_verified | skills-hub.ai 详情已确认 CoinGecko、Binance REST、Coinbase 现价与 K 线接口 | yes | named_upstreams | market-signal | direct-source | p1 |
| open-skills-free-weather-data | skills-hub.ai / Open Skills | partially_verified | skills-hub.ai 详情已确认 Open-Meteo forecast/archive 与 wttr.in 公开天气接口 | maybe | named_upstreams | industry-research | direct-source | p2 |
| open-skills-web-search-api | skills-hub.ai / Open Skills | partially_verified | skills-hub.ai 详情已确认 SearXNG、`searx.space` 实例列表与多个公开搜索实例 | yes | named_upstreams | hotspot-discovery | aggregator-layer | p1 |
| competitive-intel | Agent Skills Directory (dmgrok) / nginity | partially_verified | raw SKILL.md 已确认 Crunchbase、TechCrunch、G2/Capterra、X/LinkedIn、Indeed、press releases、Ad Library 等跟踪来源；并已完成一轮具体站点实测，其中 `Crunchbase / TechCrunch / LinkedIn / Google Ads Transparency Center` 可直连，`G2 / Capterra / Indeed / Facebook Ads Library` 为策略受限 | maybe | named_upstreams | industry-research | tooling-reference | p2 |
| 集思谱 Skill | apps catalog / official docs | verified | 官网、登录页与 `filestore.giiisp.com/arxiv/...pdf` 已确认主站和预印本镜像链路存在，但旧 `SKILL.md` 文档入口失效 | yes | named_upstreams | tech-research | direct-source | p1 |
| industry-research | SkillsMP | partially_verified | SkillsMP 详情已确认行业新闻、趋势、格局、展望输入 | maybe | broad_pattern | industry-research | tooling-reference | p1 |
| SkillsMP marketplace feed | Agent Skills CLI Marketplace Docs | verified | Docs 已确认 market-list / market-search / install-url 与 primary marketplace 角色 | maybe | directly_usable | hotspot-discovery | tooling-reference | p2 |

## 按 Hub 挂载扫描执行状态

| hub | mounted_status | source_skill_yield | summary |
|---|---|---:|---|
| ClawHub | scanned | 6 | 已确认 `a-share-real-time-data`、`stock-data-collector`、`hk-ipo-research-assistant`、`dexter`、`arxiv-search-collector`、`topic-monitor`；其中新增两条分别补上 `akshare + yfinance` 历史数据链路和 `AiPO / HKEX / AAStocks / Futu / Jisilu` 的港股 IPO 源簇。 |
| VoltAgent awesome-openclaw-skills | scanned | 4 | 已稳定产出 `ak-rss-24h-brief`、`blogwatcher`，并把 ClawHub 明细条目引出到候选表。 |
| sundial awesome-openclaw-skills | scanned | 2 | 当前以 `dexter`、`topic-monitor` 这类精选条目为主。 |
| SkillsMP | scanned | 9 | 本轮仍然是金融 / 宏观 / 行业研究产出最强的 hub。 |
| LobeHub Skills Marketplace | scanned | 3 | 已覆盖 `arxiv-viewer`、`daily-news-report` 等明确的文献与新闻流样本。 |
| SKILLS.re | scanned_light | 0 | Registry 可达，但本轮尚未抽出明确高价值信源 skill。 |
| Coze Gallery | scanned_light | 0 | 页面可达，但当前可见内容更偏办公模版与生成式模版，本轮暂无高价值信源 skill。 |
| 魔搭 ModelScope Studios | scanned_light | 0 | 页面可达，但当前入口文案更偏创空间与技术资讯集合，本轮暂无明确信源型 skill。 |
| 腾讯元器 Market | scanned_light | 0 | 页面可达，但当前更像智能体开放平台入口，本轮暂无明确信源型 skill。 |
| Claude SkillHub | scanned | 3 | 已补出 `10k-10q-earnings-report-summarizer`、`earnings-call-transcript-analyzer`、`macro-trend-beneficiary-finder`。 |
| Skills.lc | scanned_light | 0 | 目录规模很大，但当前落到的是宏观目录入口，本轮尚未抽出明确高价值信源型条目。 |
| Anthropic Skills | scanned_light | 0 | 官方目录质量高，但当前更偏通用能力 skill。 |
| OpenAI Skills Catalog | scanned_light | 0 | 当前更偏通用编码与工作流 skill。 |
| ClawSkills | scanned | 6 | 已补出 `finance-news`、`rss-digest`、`arxiv-watcher`、`bbc-news`、`stock-analysis` 等明确条目。 |
| SkillScan Registry | scanned_light | 0 | 页面与安全验证定位清晰，但当前更偏安全扫描，不是信源主轴。 |
| Agent Skills Marketplace | scanned_light | 0 | 大型 curated marketplace 成立，但本轮还没落到带明确上游源的单条信源 skill。 |
| CowAgent Skill Hub | scanned_light | 0 | 当前环境下 TLS 握手异常，暂只能记录可达性问题。 |
| SkillsBot SkillHub | scanned_light | 0 | 当前环境下连接被远端重置，暂只能记录可达性问题。 |
| n-skills | scanned | 1 | repo-collection 深扫补出 `zai-cli`，明确提供实时 web search、Reader、GitHub code search 与 ZRead。 |
| Agent Skill Index | scanned_light | 0 | 更像路由到 SkillsMP 与 live directory 的入口，本轮无新增。 |
| CodeAgentSkills | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏通用开发技能市场。 |
| SkillHQ | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏通用付费技能市场。 |
| Skillstore | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏通用 AI skills marketplace。 |
| SkillsZoo | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，未落到单条高价值信源 skill。 |
| SkillX | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，未落到单条高价值信源 skill。 |
| SkillsForge | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏开发 workflow skill。 |
| AI Skills Marketplace | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 GitHub skill 聚合。 |
| SkillsAI | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 verified marketplace。 |
| Bogen Skills | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏营销与业务自动化技能。 |
| SkillReg | scanned_light | 0 | 目录结构成立，但当前更偏企业私有 registry，不是信源主轴。 |
| SkillsGate | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏开放式技能市场。 |
| Agent Skills Hub | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏安全校验型 marketplace。 |
| Skillgate | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 team / pack 导向技能市场。 |
| Open Agent Skill | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，未落到单条高价值信源 skill。 |
| LLMSkills | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏通用 Claude / agent skills 市场。 |
| AgentSkillsRepo | scanned_light | 0 | 当前环境下详情不可稳定读取，暂未完成稳定挂载。 |
| SKILLS.pub | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 Claude skills 在线目录。 |
| Agent Skills Club | scanned_light | 0 | 当前环境下详情不可稳定读取，暂未完成稳定挂载。 |
| AgentPowers | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 MCP-first 通用技能市场。 |
| Skillery | scanned_light | 0 | registry 结构成立，但当前仍主要停留在目录级信息。 |
| AgentSkillsIndex | scanned | 4 | 新补入主表；已补出 `fda-database`、`batch-research`、`hugging-face-paper-publisher`、`reddit-fetch`，并确认 Research / Data & AI 分类可继续深挖。 |
| MCPMarket Agent Skills | scanned | 4 | 新补入主表；已补出 `exa-ai-search-automation`、`scrapingbee-automation`、`stormglass-io-automation`、`market-research-agent`。 |
| SkillKit | scanned | 1 | 新补入主表；已补出 `jina-reader`，并确认 Data & AI 分类与单条 SKILL.md 全文可读。 |
| Agent-Skills.md | scanned | 2 | 新补入主表；已补出 `goplaces`、`tavily`，并确认详情页与安装命令可读。 |
| Agent Skills CLI Marketplace | scanned | 12 | 已补出 `research`、`researchers-financial`、`finnhub-api`、`twelvedata-api`、`hedgefundmonitor`、`wrds`、`tushare`、`fmp-api`、`openinsider`、`quiver`、`cninfo-to-notebooklm`、`knowledgelm-nse`，覆盖安全 RSS/API、SEC/财报电话会/市场调查、金融实时/时间序列 API、OFR 对冲基金监测、WRDS 机构数据库、中国市场数据 API、FMP 财报/持股/国会交易、OpenInsider Form 4、Quiver 另类数据、中国 CNINFO 公告以及印度 NSE 披露材料路线。 |
| SkillHub.club | scanned_light | 0 | 新补入主表；目录结构成立，但本轮尚未落到单条高价值信源 skill。 |
| AwesomeSkills.net | scanned_light | 0 | 新补入主表；目录结构成立，偏跨平台 skills / MCP tools 导航，暂未抽出单条信源 skill。 |
| AwesomeSkills.dev | scanned_light | 0 | 新补入主表；目录结构成立，后续可按 Data / Research / Web 分类继续抽样。 |
| AgentSkill.space | scanned_light | 0 | 新补入主表；目录结构成立，但本轮尚未落到单条高价值信源 skill。 |
| AgentSkills.me | scanned_light | 0 | 新补入主表；目录结构成立，规模中等，暂作为补漏池。 |
| Agent Skills Directory (dmgrok) | scanned | 1 | 新补入主表；已补出 `competitive-intel`，并确认 `catalog.json` + raw `SKILL.md` 适合程序化发现公开网页型研究 skill。 |
| AgentSkillsDB | scanned_light | 0 | 新补入主表；小型 MDX skill directory，暂未抽出单条高价值信源 skill。 |
| ClawStart Skills Hub | scanned_light | 0 | 新补入主表；中文 ClawHub 生态目录成立，当前更适合作为中文安装与导流入口。 |
| ClaudeSkills.info | scanned_light | 0 | 新补入主表；多语言 marketplace 结构成立，当前公开条目仍以通用开发与内容类 skill 为主。 |
| 302 Skills Hub | scanned_light | 0 | 新补入主表；搜索结果显示支持 SKILL.md 预览与复制，但当前抓取超时，先保留为中文目录补漏入口。 |
| CLSkills.in | scanned | 6 | 已确认 2300+ 技能目录与 sitemap 可直接枚举；目前已进一步确认它可直接暴露 raw `daily-news-report.md`、`xvary-stock-research.md`、`apify-market-research.md`、`market-sizing-analysis.md`、`alpha-vantage.md` 与 `hugging-face-paper-publisher.md`，因此已形成六条可追溯交叉证据。 |
| skills-hub.ai | scanned | 18 | 已补强 `news-aggregation`、`alphaear-news`、`EdgarTools AI Skill`、`alpha-vantage`、`U.S. Treasury Fiscal Data` 五条现有证据，并新增 `scientific-skills-fred-economic-data`、`finance-skills-yfinance-data`、`alphaear-search`、`alphaear-stock`、`alphaear-sentiment`、`octagon-finance-prediction-markets-analysis`、`octagon-finance-sec-10k-analysis`、`octagon-finance-sec-10q-analysis`、`octagon-finance-sec-8k-analysis`、`octagon-finance-sec-proxy-analysis`、`octagon-finance-earnings-call-analysis`、`octagon-finance-stock-quote`、`octagon-finance-analyst-estimates`、`octagon-finance-price-target-summary`、`open-skills-get-crypto-price`、`open-skills-free-weather-data`、`open-skills-web-search-api` 等多条金融与公开源技能；继续外扫后发现剩余大量命中已进入 Octagon 细分分析变体，新增上游信息密度明显下降。 |
| Terminal Skills | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏开发者终端技能市场。 |
| ClawSkills Registry | scanned_light | 0 | registry 结构成立，但当前仍主要停留在目录级信息，未落到单条高价值信源 skill。 |
| AiAgentBase Skills | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏社区 workflow 与 Claude skills。 |
| AbsolutelySkilled | scanned_light | 0 | registry 结构成立，但当前仍主要停留在目录级信息，偏通用 coding agent skills。 |
| skillsbento | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏 Claude productivity 技能市场。 |
| SkillShop.sh | scanned_light | 0 | 目录结构成立，但当前缺少明确信源型条目证据。 |
| AI Agent Skills Marketplace | scanned_light | 0 | 目录结构成立，但当前仍主要停留在目录级信息，偏泛技能模板市场。 |
| Agent Skill Directory | scanned_light | 0 | 目录结构成立，但当前更像教程与索引目录，不是单条信源主轴。 |
| Antigravity Awesome Skills | scanned | 5 | 已补出 `xvary-stock-research`、`hugging-face-papers`、`apify-market-research`、`market-sizing-analysis`，并补强 `daily-news-report`。 |
| skillmatic awesome-agent-skills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |
| littleben awesomeAgentskills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |
| BehiSecc awesome-claude-skills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |
| ComposioHQ awesome-claude-skills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |
| travisvn awesome-claude-skills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |
| VoltAgent awesome-agent-skills | scanned | 3 | 已补出 `binance-trading-signal`、`binance-spot`、`notion-research-documentation`，并与 HF Papers 形成交叉证据。 |
| Ai-Agent-Skills | scanned_light | 0 | repo-collection 结构成立，但本轮未抽到独立高价值信源型 skill。 |

## 暂不优先 / 拒绝清单

| name | reason |
|---|---|
| PaperBanana-DashScope | 主要是科研视觉生成与图形输出，不提供稳定外部信源入口。 |
| Manim Creator | 主要是视频/可视化生成工具，不是信源 skill。 |
| TopicLab CLI | 是接入与运行时，不是信源。 |
| Agent Skills 标准站本身 | 是规范站，不直接承载具体 source feed。 |
| akshare-api (ClawHub) | 虽然名义上是 AkShare 路线，但当前实现固定请求 `https://akshare.devtool.uk`，且包含本地 `portfolio.py` subprocess 风险；暂不作为可直接复用信源收录。 |
| economic-calendar-fetcher | 当前能读到事件加工逻辑和样例，但仍未确认具体上游日历来源名，先不并入主表。 |
| stock-monitor-skill (ClawHub) | 已确认使用 `EastMoney / Sina`，但更像后台监控 daemon，且和现有 `qstock`、`stock-data-collector` 路线重叠，暂作为方法参考而不主收。 |
| financial-report | 已确认依赖 `akshare + yfinance + edgartools`，但没有补出新的独立来源家族，更像把现有源打包成财报研究工作流，暂不单列。 |
| market-data (EricOo0) | 描述覆盖 A 股/美股/港股行情、板块和资金流，但当前未补出比 `tushare / qstock / stock-data-collector` 更独立的新上游，先不并入主表。 |
| stock-analysis (ninehills) | 更偏技术分析与风险检查流程，虽涉及公告与港股，但当前没有形成清晰的新信源入口，先记为分析层样本。 |
| Court Records Search | 只看到了“搜索联邦和州法院诉讼历史”的泛 legal 描述，未确认具体法院数据库或适合金融信号化的上游，先不并入主表。 |
| web-search-advanced-financial-report | 已确认依赖 `Exa` 做财报/SEC filing 搜索，但本质仍是搜索工作流，不是新的独立披露源，先不并入主表。 |
| hk-stock-analysis | 已确认覆盖港股分析、A/H 溢价与互联互通语境，但当前没有点名比 `HKEX / AAStocks / Futu` 更清晰的新上游，先记为分析层样本。 |
| china-macro-analyst | 已确认关注 `PBOC` 与中国宏观数据，但尚未拆出足够明确的统计局/央行/外汇局等完整上游清单，先不并入主表。 |

## 第一批 PoC 优先清单

1. `xvary-stock-research`
   SEC EDGAR 与 Yahoo / Finviz / Stooq fallback 已有源码级证据，适合先做公司级金融研究 PoC。
2. `daily-news-report`
   LobeHub 详情与 Antigravity 源码都能交叉验证，已确认 Hacker News、HuggingFace Papers、One Useful Thing、Paul Graham Essays 等网页/RSS 源，适合做可审计日报/热点发现样本。
3. `hugging-face-papers`
   Hugging Face Paper Pages 与 arXiv 路线明确，适合做 AI 论文-模型-数据集关联 PoC。
4. `finance-data`
   FRED、U.S. Treasury Fiscal Data、SEC EDGAR、OFR、Alpha Vantage 路线明确，适合做国际宏观金融入口。
5. `last30days-skill`
   来源链清晰，覆盖社交热点、网页搜索和多平台抓取线索，适合当热点发现器样本。
6. `tsrs-mcp-server`
   把 TuShare、同花顺热榜、开盘啦题材与资金流放在一层，适合做国内市场热点与情绪视图。
7. `pywencai / qstock`
   问财、东方财富、同花顺、新浪财经等国内金融路线集中，适合拆成国内市场多源层。
8. `Scientify / Literature Search / 集思谱 Skill`
   覆盖 arXiv、OpenAlex、Unpaywall、文献、专利、预印本世界，适合科技与 AI 子世界。
9. `apify-market-research`
   Apify Actors 已确认覆盖 Google Maps、Google Trends、Facebook Marketplace、Instagram、Booking.com、TripAdvisor，适合行业/地理/消费行为扩展，但需要先处理 token 与合规边界。
10. `binance-trading-signal`
   Binance Web3 Smart Money signals 路线清楚，适合 crypto 风险与链上资金信号样本，接入时建议只读。
11. `jina-reader`
   Jina Reader 的 read/search/ground 三种模式很适合作为 `虾报道` 的网页全文抽取、搜索增强与事实核验基础层。
12. `fda-database`
   FDA 公开监管数据库方向清楚，适合做医疗、药品、器械、安全事件与产业监管信号样本。
13. `exa-ai-search-automation`
   Exa AI Search 路线适合做高精度网页检索和研究增强，但需要先把引用透明度、账号和配额风险管住。
14. `stormglass-io-automation`
   Stormglass IO 适合航运、海洋天气、潮汐和环境风险信号，能补足地缘/能源/航运场景里的自然条件层。

## Hub 扫描后的新增判断

- `VoltAgent awesome-openclaw-skills`、`ClawHub` 这类高密度 collection 里，已经能直接抽出偏信源型 skill，例如：
  - `ak-rss-24h-brief`
  - `blogwatcher`
- `OpenClaw` 社区语料里可以看到成熟的 `news-aggregation` 技能形态，而且默认就使用 RSS 工作流。
- `Agent Skills CLI Marketplace Docs` 明确把 `SkillsMP` 描述成主市场，说明后续可以考虑把它作为“批量发现 skill”的程序化入口。
- `SkillsMP` 这一轮产出的信源型候选最扎实，尤其在：
  - 新闻 / RSS 聚合
  - 金融分析 / 金融数据抓取
  - 行业研究
- `SkillsMP` 现在已经可以视为第二轮主轴之一，因为它同时覆盖：
  - 新闻聚合
  - 金融 API / RSS / 监管披露
  - 公司级跟踪与事件日历
  - 行业研究模板
- 这轮继续验证后，`SkillsMP` 又补出了：
  - `alpha-vantage`
  - `alphaear-news`
  - `academic-research`
  说明它不仅量大，而且在金融与研究两条线都有持续产出。
- `LobeHub` 当前确认到的高价值信源型 skill 主要集中在文献和 arXiv 方向。
- `LobeHub` 新补的 `daily-news-report` 说明它不只有文献技能，也有可审计的网页/RSS 日报型模式。
- `ClawHub` 这一轮补出了：
  - `a-share-real-time-data`
  - `dexter`
  - `arxiv-search-collector`
  - `topic-monitor`
  说明它不仅能当 registry 用，也能稳定给出可验证的信源型 skill。
- `ClawSkills` 这一轮补出了：
  - `finance-news`
  - `rss-digest`
  - `arxiv-watcher`
  - `bbc-news`
  - `stock-analysis`
  说明镜像型 registry 同样能提供可直接引用的信源型单条 skill。
- `Coze Gallery` 当前抽到的高可见条目大多是写作模板、报告模板、案例模板，本轮尚未抽到高价值信源型 skill；但按逐 hub 挂载规则，它仍然保留在队列里继续扫描。
- `魔搭 ModelScope Studios` 当前页面更像创空间与技术资讯入口，本轮还没落到足够明确的信源型 skill。
- `腾讯元器 Market` 当前页面更像智能体开放平台与分发入口，本轮没有抽到带清晰上游源的信源型 skill。
- `Claude SkillHub` 和 `Skills.lc` 都确认是成立的 marketplace / directory，但这轮落到的是目录级描述，仍需要下一轮继续往单条 skill 深挖。
- `Agent Skills Marketplace` 目前能确认是大型 curated marketplace，但这一轮仍停留在目录层，下一轮需要继续深挖单条详情页。
- `CowAgent Skill Hub` 与 `SkillsBot SkillHub` 这轮主要暴露的是可达性问题，不代表没有信源型 skill，只是当前环境下暂未能稳定挂载。
- `LobeHub / SKILLS.re / SkillsMP / Skills.lc` 更适合下一轮重点继续抽，因为它们既像真实市场，也更靠近 agent skill 生态本身。
- 新补入 `AgentSkillsIndex`、`MCPMarket Agent Skills`、`SkillKit` 三个核心入口后，主表扩展到 59 个 hub；其中 `AgentSkillsIndex` 已补出 `fda-database`、`batch-research`、`hugging-face-paper-publisher`、`reddit-fetch`，`MCPMarket Agent Skills` 已补出 `exa-ai-search-automation`、`scrapingbee-automation`、`stormglass-io-automation`、`market-research-agent`，`SkillKit` 已补出 `jina-reader`。

## 新增源码级证据

- `last30days-skill`
  - `docs/how-search-works.md` 明确写出：
    - `POST https://api.openai.com/v1/responses`
    - `POST https://api.x.ai/v1/responses`
    - `GET https://reddit.com/r/{sub}/comments/{id}/{slug}/.json`
  - `CHANGELOG.md` 明确写出：
    - ScrapeCreators Reddit / TikTok / Instagram 经 `api.scrapecreators.com`
  - README 还补充了 `Threads / Pinterest / YouTube comments / Bluesky / Truth Social / Xiaohongshu` 等扩展来源线索。

- `Scientify`
  - `src/tools/arxiv-search.ts`：`https://export.arxiv.org/api/query`
  - `src/tools/openalex-search.ts`：`https://api.openalex.org/works`
  - `skills/paper-download/SKILL.md`：`https://api.unpaywall.org/v2/{doi}`
  - README 明确写了 `arxiv_search / openalex_search / unpaywall_download / github_search / paper_browser`

## 当前实现目标的匹配度

- 已满足：
  - 主表 73 个 hub 已全部挂载到扫描状态表
  - 当前候选/验证池已有 82 条验证视图记录
  - `verified` 22 条，`partially_verified` 60 条
  - `p0` 13 条
  - 至少 5 个带真实信源痕迹的候选
  - 至少 3 个 `high` 复用价值候选
  - TopicLab 内部 skill 能力面已纳入同一张表
- 仍建议补的动作：
  - 在国内出口做一次浏览器实测，校准 `domestic_ip_access`
  - 继续补 `Skills.lc` 搜索命中的单条详情证据，因为当前详情页证据还太弱
  - 为 `xvary-stock-research`、`daily-news-report`、`hugging-face-papers` 分别做最小 PoC 适配设计

## 主要来源

- https://github.com/mvanhorn/last30days-skill
- https://github.com/K-Dense-AI/claude-scientific-skills
- https://github.com/Orchestra-Research/AI-Research-SKILLs
- https://github.com/tsingyuai/scientify
- https://github.com/zsrl/pywencai
- https://github.com/tkfy920/qstock
- https://github.com/vnpy/vnpy_ifind
- https://github.com/hanxuanliang/tsrs-mcp-server
- https://github.com/ibigquant/awesome-trading-api
- https://github.com/dgunning/edgartools
- https://github.com/stefanoamorelli/sec-edgar-agentkit
- https://www.coze.cn/gallery
- https://www.agentskills.in/docs/marketplace
- https://yuanqi.tencent.com/
- https://yuanqi.tencent.com/market
- https://agents.baidu.com/
- https://gist.github.com/alperyilmaz/027cb9d08fa8cecc7ff252b6bb4256df
- https://skillsmp.com/skills/claude-office-skills-skills-news-monitor-skill-md
- https://skillsmp.com/zh/skills/jeremylongshore-claude-code-plugins-plus-skills-plugins-crypto-crypto-news-aggregator-skills-aggregating-crypto-news-skill-md
- https://skillsmp.com/skills/geogons-skill-financial-analyst-skill-md
- https://skillsmp.com/skills/gracefullight-stock-checker-agents-skills-financial-data-fetcher-skill-md
- https://skillsmp.com/skills/austinjunyuli-austins-skills-skills-finance-data-skill-md
- https://skillsmp.com/skills/joellewis-finance-skills-plugins-data-integration-skills-market-data-skill-md
- https://skillsmp.com/skills/alphavantage-alpha-vantage-mcp-skills-global-stock-analysis-skill-md
- https://skillsmp.com/skills/sickn33-antigravity-awesome-skills-skills-alpha-vantage-skill-md
- https://skillsmp.com/skills/rkiding-awesome-finance-skills-skills-alphaear-news-skill-md
- https://skillsmp.com/skills/shinygua-marketmind-alphaengine-claude-skills-mm-company-desk-skill-md
- https://skillsmp.com/skills/quantumiodb-quantwise-plugins-trading-skills-skills-earnings-calendar-skill-md
- https://skillsmp.com/skills/akhilgurrapu-kubera-claude-skills-market-analysis-skill-md
- https://skillsmp.com/skills/rkreddyp-investrecipes-claude-skills-industry-research-skill-md
- https://skillsmp.com/skills/joshuaroll-research-skills-skills-academic-research-skill-md
- https://lobehub.com/skills/actionbook-actionbook-arxiv-viewer
- https://lobehub.com/zh/skills/rookie-ricardo-erduo-skills-daily-news-report
- https://clskills.in/skill/community-daily-news-report
- https://clskills.in/skills/community/antigravity/daily-news-report.md
- https://claudeskillhub.com/skills/10k-10q-earnings-report-summarizer
- https://claudeskillhub.com/skills/earnings-call-transcript-analyzer
- https://claudeskillhub.com/skills/macro-trend-beneficiary-finder
- https://clawhub.ai/wangdinglu/a-share-real-time-data
- https://clawhub.ai/igorhvr/dexter
- https://clawhub.ai/xukp20/arxiv-search-collector
- https://clawhub.ai/fardeenxyz/topic-monitor
- https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/daily-news-report
- https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/xvary-stock-research
- https://clskills.in/skill/community-xvary-stock-research
- https://clskills.in/skills/community/antigravity/xvary-stock-research.md
- https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/hugging-face-papers
- https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/apify-market-research
- https://github.com/sickn33/antigravity-awesome-skills/tree/main/plugins/antigravity-awesome-skills/skills/market-sizing-analysis
- https://clskills.in/skill/community-apify-market-research
- https://clskills.in/skills/community/antigravity/apify-market-research.md
- https://clskills.in/skill/community-market-sizing-analysis
- https://clskills.in/skills/community/antigravity/market-sizing-analysis.md
- https://clskills.in/skill/community-alpha-vantage
- https://clskills.in/skills/community/antigravity/alpha-vantage.md
- https://clskills.in/skill/community-hugging-face-paper-publisher
- https://clskills.in/skills/community/antigravity/hugging-face-paper-publisher.md
- https://officialskills.sh/binance/skills/trading-signal
- https://officialskills.sh/binance/skills/spot
- https://officialskills.sh/huggingface/skills/hugging-face-paper-pages
- https://officialskills.sh/openai/skills/notion-research-documentation
- https://agentskillsindex.com/en/skills/davila7-claude-code-templates-fda-database
- https://agentskillsindex.com/en/skills/wshobson-agents-batch-research
- https://agentskillsindex.com/en/skills/huggingface/skills
- https://agentskillsindex.com/en/skills/ykdojo/claude-code-tips
- https://skillkit.io/skills/claude-code/jina-reader
- https://mcpmarket.com/tools/skills/exa-ai-search-automation-2
- https://mcpmarket.com/tools/skills/scrapingbee-web-scraping-automation
- https://mcpmarket.com/tools/skills/stormglass-io-automation-3
- https://mcpmarket.com/tools/skills/market-research-agent
- https://github.com/numman-ali/n-skills/tree/main/skills/tools/zai-cli/skills/zai-cli
- https://agent-skills.md/skills/steipete/clawdis/goplaces
- https://agent-skills.md/skills/steipete/clawdis/tavily
- https://www.agentskills.in/ja/marketplace/%40SherifEldeeb/research
- https://www.agentskills.in/ja/marketplace/%40adaptationio/finnhub-api
- https://www.agentskills.in/marketplace/%40adaptationio/twelvedata-api
- https://www.agentskills.in/zh-CN/marketplace/%40K-Dense-AI/hedgefundmonitor
- https://www.agentskills.in/ja/marketplace/%40edwinhu/wrds
- https://www.agentskills.in/zh-CN/marketplace/%40openclaw/tushare
- https://www.agentskills.in/ja/marketplace/%40adaptationio/fmp-api
- https://www.agentskills.in/marketplace/%40openclaw/openinsider
- https://www.agentskills.in/marketplace/%40openclaw/quiver
- https://www.agentskills.in/marketplace/%40NeverSight/cninfo-to-notebooklm
- https://www.agentskills.in/marketplace/%40eggmasonvalue/knowledgelm-nse
- https://clawhub.ai/wang-junjian/stock-data-collector
- https://clawhub.ai/marvae/hk-ipo-research-assistant
- https://skills-hub.ai/skills/open-skills-news-aggregation
- https://skills-hub.ai/skills/scientific-skills-usfiscaldata
- https://skills-hub.ai/skills/scientific-skills-fred-economic-data
- https://skills-hub.ai/skills/finance-skills-yfinance-data
- https://skills-hub.ai/skills/finance-skills-cn-alphaear-news
- https://skills-hub.ai/skills/finance-skills-cn-alphaear-search
- https://skills-hub.ai/skills/scientific-skills-edgartools
- https://skills-hub.ai/skills/scientific-skills-alpha-vantage
- https://skills-hub.ai/skills/finance-skills-cn-alphaear-stock
- https://skills-hub.ai/skills/finance-skills-cn-alphaear-sentiment
- https://skills-hub.ai/skills/octagon-finance-prediction-markets-analysis
- https://skills-hub.ai/skills/octagon-finance-sec-10k-analysis
- https://skills-hub.ai/skills/octagon-finance-sec-10q-analysis
- https://skills-hub.ai/skills/octagon-finance-sec-8k-analysis
- https://skills-hub.ai/skills/octagon-finance-sec-proxy-analysis
- https://skills-hub.ai/skills/octagon-finance-earnings-call-analysis
- https://skills-hub.ai/skills/octagon-finance-stock-quote
- https://skills-hub.ai/skills/octagon-finance-analyst-estimates
- https://skills-hub.ai/skills/octagon-finance-price-target-summary
- https://skills-hub.ai/skills/open-skills-get-crypto-price
- https://skills-hub.ai/skills/open-skills-free-weather-data
- https://skills-hub.ai/skills/open-skills-web-search-api
- [Tashan-TopicLab/topiclab-backend/app/resources/apps_catalog.json](C:\Users\16571\信源\Tashan-TopicLab\topiclab-backend\app\resources\apps_catalog.json)
- [Tashan-TopicLab/topiclab-backend/tests/test_skill_hub_api.py](C:\Users\16571\信源\Tashan-TopicLab\topiclab-backend\tests\test_skill_hub_api.py)
- [Tashan-TopicLab/topiclab-backend/app/services/skill_hub.py](C:\Users\16571\信源\Tashan-TopicLab\topiclab-backend\app\services\skill_hub.py)
- [research/_tmp_last30days/docs/how-search-works.md](C:\Users\16571\信源\research\_tmp_last30days\docs\how-search-works.md)
- [research/_tmp_last30days/README.md](C:\Users\16571\信源\research\_tmp_last30days\README.md)
- [research/_tmp_last30days/CHANGELOG.md](C:\Users\16571\信源\research\_tmp_last30days\CHANGELOG.md)
- [research/_tmp_scientify/src/tools/arxiv-search.ts](C:\Users\16571\信源\research\_tmp_scientify\src\tools\arxiv-search.ts)
- [research/_tmp_scientify/src/tools/openalex-search.ts](C:\Users\16571\信源\research\_tmp_scientify\src\tools\openalex-search.ts)
- [research/_tmp_scientify/skills/paper-download/SKILL.md](C:\Users\16571\信源\research\_tmp_scientify\skills\paper-download\SKILL.md)
