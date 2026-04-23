# 2026-04-11 信源覆盖度与长尾判定

## 结论

- 当前阶段：`entering_long_tail`
- 高价值候选总数：`66`
- 已达到 endpoint 级覆盖：`65`
- 仅有站点级覆盖：`1`
- 仍未覆盖：`0`
- 本轮新增 URL（相对上一轮快照）：`181`
- 本轮新增 host（相对上一轮快照）：`71`
- 当前 frontier 中高信号 host（总计）：`20`
- 当前 frontier 中高信号 host（主线 skill）：`1`

## 高价值未覆盖

- 无。

## 高价值仅站点级覆盖

- `vnpy_ifind`: 已探测 `2` 条，但 endpoint 级覆盖仍不足；可继续从 `同花顺 iFinD、期货/股票/ETF 期权历史 K 线` 往下压。 | inherited=`ifind_terminal`

## 主线高信号 Frontier

- `twitter.com`: `mention_count=13` | files=`research/source-skill-validation/clskills-community-apify-market-research.html, research/source-skill-validation/clskills-community-deep-research.html, research/source-skill-validation/clskills-community-finance.html, research/source-skill-validation/clskills-community-financial-analyst.html, research/source-skill-validation/clskills-community-market-sizing-analysis.html`

## 扩展 Frontier

- `eia.gov`: `mention_count=3` | files=`research/worldmonitor-upstream/SELF_HOSTING.md, research/worldmonitor-upstream/docs/Docs_To_Review/DOCUMENTATION.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `webcams.windy.com`: `mention_count=3` | files=`research/worldmonitor-upstream/index.html, research/worldmonitor-upstream/src-tauri/tauri.conf.json, research/worldmonitor-upstream/vercel.json`
- `wingbits.com`: `mention_count=3` | files=`research/worldmonitor-upstream/README.md, research/worldmonitor-upstream/docs/Docs_To_Review/DOCUMENTATION.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `acleddata.com`: `mention_count=2` | files=`research/worldmonitor-upstream/SELF_HOSTING.md, research/worldmonitor-upstream/docs/Docs_To_Review/DOCUMENTATION.md`
- `aisstream.io`: `mention_count=2` | files=`research/worldmonitor-upstream/SELF_HOSTING.md, research/worldmonitor-upstream/docs/Docs_To_Review/DOCUMENTATION.md`
- `api.acleddata.com`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `api.unhcr.org`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `data.wingbits.com`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `hacker-news.firebaseio.com`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `hapi.humdata.org`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `msi.gs.mil`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `openrouter.ai`: `mention_count=2` | files=`research/worldmonitor-upstream/SELF_HOSTING.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `pay.google.com`: `mention_count=2` | files=`research/worldmonitor-upstream/index.html, research/worldmonitor-upstream/vercel.json`
- `pizzint.watch`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `promedmail.org`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/health-variant-full.md, research/worldmonitor-upstream/todos/058-pending-p3-promed-feed-dead-code-commented-out.md`
- `public.tableau.com`: `mention_count=2` | files=`research/worldmonitor-upstream/data/gamma-irradiators-raw.json, research/worldmonitor-upstream/data/gamma-irradiators.json`
- `soa.smext.faa.gov`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/Docs_To_Review/API_REFERENCE.md, research/worldmonitor-upstream/docs/Docs_To_Review/EXTERNAL_APIS.md`
- `someone.ceo`: `mention_count=2` | files=`research/worldmonitor-upstream/pro-test/index.html, research/worldmonitor-upstream/public/pro/index.html`
- `who.int`: `mention_count=2` | files=`research/worldmonitor-upstream/docs/health-variant-full.md, research/worldmonitor-upstream/todos/056-pending-p3-stable-hash-unnecessary-disease-seed.md`

## 判定原则

1. 如果高价值未覆盖仍明显存在，说明还没完备。
2. 如果剩余 frontier 多为单次出现或低价值宿主域，就开始进入长尾。
3. 如果新增 host 继续显著增长，说明主干还没扫完；反之则说明已接近收口。

