# 税务 / 审计 / 金融信源（仅 SkillHub 抽取）

更新时间：2026-04-13  
说明：本清单仅收录来自 SkillHub 生态或其衍生 skill 清单中可追溯的信源条目，未包含手工补充的官方入口。

## 监管披露 / 审计相关（SEC/EDGAR）

来源：`research/source-skill-validation/skills-hub-edgartools.html`

- SEC Form 4 filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=4&owner=exclude&count=40  
  连通性：unstable
- SEC 13F-HR filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=13F-HR&owner=exclude&count=40  
  连通性：unstable
- SEC 10-K filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=10-K&owner=exclude&count=40  
  连通性：unstable
- SEC 10-Q filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=10-Q&owner=exclude&count=40  
  连通性：unstable
- SEC 8-K filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=8-K&owner=exclude&count=40  
  连通性：unstable
- SEC DEF 14A filings  
  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=DEF%2014A&owner=exclude&count=40  
  连通性：unstable

## 财政 / 税务宏观数据

来源：`research/source-skill-validation/skills-hub-usfiscaldata.html`

- U.S. Treasury Fiscal Service API root  
  https://api.fiscaldata.treasury.gov/services/api/fiscal_service  
  连通性：unstable

## 金融行情与宏观指标（Alpha Vantage）

来源：`research/source-skill-validation/clskills-alpha-vantage.md`

- GLOBAL_QUOTE  
  https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=demo  
  连通性：direct
- TIME_SERIES_DAILY  
  https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&apikey=demo  
  连通性：direct
- TREASURY_YIELD  
  https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=monthly&maturity=10year&apikey=demo  
  连通性：direct
- CPI  
  https://www.alphavantage.co/query?function=CPI&interval=monthly&apikey=demo  
  连通性：direct
- REAL_GDP  
  https://www.alphavantage.co/query?function=REAL_GDP&interval=quarterly&apikey=demo  
  连通性：direct
- NEWS_SENTIMENT  
  https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&apikey=demo  
  连通性：direct

## 金融行情（Yahoo Finance）

来源：`research/source-skill-validation/skills-hub-yfinance.html`

- Quote  
  https://finance.yahoo.com/quote/AAPL  
  连通性：direct
- History  
  https://finance.yahoo.com/quote/AAPL/history  
  连通性：direct
- Options  
  https://finance.yahoo.com/quote/AAPL/options  
  连通性：direct
- Earnings Calendar  
  https://finance.yahoo.com/calendar/earnings  
  连通性：direct

## A 股行情（东方财富）

来源：`github.com/RKiding/Awesome-finance-skills/skills/alphaear-stock/scripts/stock_tools.py`

- EastMoney Kline API  
  https://push2his.eastmoney.com/api/qt/stock/kline/get  
  连通性：direct
- EastMoney Stock List API  
  https://push2.eastmoney.com/api/qt/clist/get  
  连通性：direct

## 搜索入口补充（用于金融类检索）

来源：`github.com/RKiding/Awesome-finance-skills/skills/alphaear-search/scripts/search_tools.py`

- DuckDuckGo Search  
  https://duckduckgo.com/?q=finance  
  连通性：direct
- Baidu Search  
  https://www.baidu.com/s?wd=finance  
  连通性：direct

## 行业/市场规模补充（边缘项）

来源：`research/source-skill-validation/clskills-market-sizing-analysis.md:183`

- ZoomInfo  
  https://www.zoominfo.com/  
  连通性：unstable
