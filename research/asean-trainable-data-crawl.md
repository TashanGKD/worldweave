# 东盟可训练数据穷尽调研滚动记录

Updated: 2026-06-06T15:27:16+08:00

## 当前可训练结论

| 口径 | 数量 | 说明 |
|---|---:|---|
| 可作为正式预测/面板模型 | 2 | 马来西亚燃油价格周度序列；六国年度电力供需压力面板。 |
| 可作为代理训练模型 | 4 | 市场吸引力、绿电支撑、算力需求、出海优先级综合代理。 |
| 合计可训练模型 | 6 | 页面口径需区分真实预测、供需压力线索和代理研判。 |

## 已接入训练底座

| 模型方向 | 来源 | 覆盖 | 样本 | 当前判断 |
|---|---|---|---:|---|
| 能源成本扰动预测 | Malaysia OpenAPI Fuel Price | 2024-02-29 至 2026-06-04，马来西亚，周度三类油品 | 345 | 已满足周度预测训练。 |
| 电力瓶颈 | Our World in Data Energy Dataset；World Bank annual indicators | 2000-2025，6 国年度面板 | 149 | 可做树模型/面板回看，只代表国家级供需压力线索。 |
| 市场吸引力 | World Bank GDP、FDI、贸易开放、互联网、安全服务器 | 2017-2024，11 国 | 77 | 代理训练可用，不代表真实项目收益。 |
| 绿电支撑 | World Bank 可再生能源；OWID Energy；Singapore Data.gov | 2017-2025，11 国 | 43 | 代理训练可用，样本偏少。 |
| 算力需求 | World Bank 安全服务器、互联网、高技术出口、FDI | 2017-2024，11 国 | 77 | 代理训练可用，不代表真实 AI 订单。 |
| 出海优先级 | World Bank 市场、电力、数字、绿电综合指标 | 2017-2025，11 国 | 82 | 综合排序可用，缺历史行动结果标签。 |
| 泰国月度电力需求侧补充 | Thailand EPPO National Electricity Use by Sector | 2002-2026，泰国，月度部门用电 | 5 组时序，各 120 个训练窗口点 | 已接入缓存，可补电力瓶颈和需求侧代理。 |
| 东盟电厂结构补充 | WRI Global Power Plant Database ASEAN | 静态电厂清单，10 个东盟国家 | 40 个结构指标 | 已接入缓存，可补电力基础设施和绿电支撑静态特征。 |

## 本轮新增强候选

| 来源 | 链接 | 覆盖和频率 | 可用方向 | 可训练判断 | 局限 |
|---|---|---|---|---|---|
| Thailand EPPO electricity CKAN | https://catalog.eppo.go.th/api/3/action/package_search?fq=groups:electricity%20AND%20res_format:CSV&rows=20 | 官方 CKAN 返回 15 个电力 CSV，多数月度；多项覆盖 2529/2543/2545 至 2567 佛历，约等于 1986/2000/2002 至 2024 | 电力瓶颈、绿电支撑、跨境电力 | 强候选，适合补泰国月度电力面板 | 泰文列名需要字段映射；年份需佛历转公历；部分 CSV 下载偶发 522，需重试和缓存。 |
| Thailand EPPO national electricity use by sector | https://catalog.eppo.go.th/dataset/eebd7a61-c58e-4b82-93d9-3d24cc1aa780/resource/d3a101dd-a2f7-4ed4-a122-4f21c0038db3/download/dataset_11_37.csv | 官方 CSV 已接入；2002-2026 年月度数据，2037 行，字段含 Year、Month、Sector、Quantity、UNIT，单位 GWh；最新到 2026-03 | 电力瓶颈、市场活动代理、算力需求侧代理 | 已接入缓存；本轮 fresh 生成 7 个最新指标和 5 组时序，居民、商业、工业、政府与公益、农业各保留 120 个训练窗口点 | 只覆盖用电侧，不等同于电网节点约束或园区电价。 |
| Malaysia OpenAPI Electricity Supply | https://api.data.gov.my/data-catalogue?id=electricity_supply&limit=5&sort=-date | 月度，最近探针返回 2024-06；含 total、local、imports 等供给字段 | 电力瓶颈、能源成本扰动 | 已接入，后续可扩大分页和训练窗口 | 只覆盖马来西亚，不直接代表园区电价。 |
| Malaysia OpenAPI Electricity Consumption | https://api.data.gov.my/data-catalogue?id=electricity_consumption&limit=5&sort=-date | 月度，最近探针返回 2024-06；含 total、local_commercial、local_domestic、exports 等消费字段 | 电力瓶颈、市场活动代理 | 已接入，适合补马来西亚月度供需压力 | 行业粒度仍偏宏观。 |
| Singapore Data.gov annual electricity generation and consumption | https://data.gov.sg/api/action/datastore_search?resource_id=d_3745e3aa98ff3c4bcfcb8e1f6dffef42&limit=3 | 年度，字段覆盖 1975-2025，含发电、用电和工业相关用电 | 电力瓶颈、算力需求代理 | 可用于新加坡长时序回看 | 年度频率，不是实时电力约束。 |
| Singapore Data.gov monthly electricity tariffs | https://data.gov.sg/api/action/datastore_search?resource_id=d_02ab8363afcfd8a507679e5ba2738cd4&limit=3&sort=month%20desc | 月度，198 个记录；本轮探针最新返回到 2021-06 | 能源成本、电价历史 | 可做历史电价基准 | 数据不够新，不能作为当前价格。 |
| ASEANstats web/RSS | https://www.aseanstats.org/feed/ | RSS 可访问；站内搜索可返回 FDI 等 publication | 市场吸引力、贸易投资 | 可作信源和报告线索 | 数据 API 当前 403，暂不作为自动训练主源。 |
| WRI Global Power Plant Database | https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv | 公开 CSV 已接入；本轮 fresh 返回 source_count 25、fetched_count 24，WRI 源状态 ok；筛出 10 个东盟国家、877 个电厂，生成 40 个结构指标，字段含容量、坐标、主燃料、投运年和年度发电量列 | 绿电支撑、电力基础设施、供需压力静态特征 | 已接入缓存，适合补电厂容量、可再生装机容量和可再生装机占比 | 缺东帝汶记录；更适合作为静态特征，不单独做时序预测；数据库容量年份多在 2017-2018 左右，不能作为最新装机播报。 |
| Philippines PSA OpenSTAT investment tables | https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2B/FI | 官方 PXWeb API；外资批准投资按行业表含 17 年 x 4 季度维度，更新时间 2026-05；本轮 POST 全量取数成功，按行业表 1360 个单元、1294 个非空值 | 市场吸引力、产业投资代理、出海优先级 | 强候选，适合补菲律宾季度投资代理模型 | 年份标签最后一项源表显示为 20206，接入前需按元数据和发布日期清洗为正确年份。 |
| Philippines PSA OpenSTAT ICT tables | https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/3F | 官方 PXWeb API；ICT 建制指标表含 6 年、多地区、多行业、多数据项，更新时间 2025-12 | 算力需求代理、数字经济环境 | 中等候选，适合做菲律宾数字基础侧代理 | 年份较少，不适合单独训练强预测。 |
| Philippines PSA OpenSTAT energy tables | https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2F/ELE | 官方 PXWeb API；终端能源消费表含 9 年，能源供应表更新时间 2024-06 | 电力瓶颈、能源需求代理 | 中等候选，适合作补充变量 | 样本年限偏短，需确认是否有电力细分长期表。 |
| World Bank Worldwide Governance Indicators | https://www.worldbank.org/content/dam/sites/govindicators/doc/wgidataset.xlsx | 稳定 Excel 下载端点返回 200；文件为 2023 update，覆盖 1996-2022；可解析 6 个治理维度、10 个东盟国家 | AI 与营商环境、政策环境、出海优先级 | 强候选，适合补历史治理和营商环境代理特征 | 不含东帝汶；时效到 2022，不适合作最新政策播报。 |
| Indonesia BPS Web API | https://webapi.bps.go.id/ | 官方 API 端点存在，但本轮探针返回 Parameter Key is Missing / not allowed | 市场、产业、电力、投资潜在代理 | 暂不满足公开无凭据接入条件 | 需要 API key，不能作为当前可复验公开训练源。 |
| Vietnam official electricity data | 政府/EVN/GSO 公开页面 | 本轮未找到稳定可脚本化 API 或 CSV；多为新闻稿、统计发布页或文件下载入口 | 电力瓶颈潜在候选 | 暂不满足训练接入条件 | 需要继续查 GSO/EVN 是否有开放数据端点。 |

## 待继续验证候选

| 来源 | 价值 | 下一步 |
|---|---|---|
| Ember electricity data | 可能提供国家月度/年度电力、发电结构、排放强度 | 查清稳定下载端点，优先补电力瓶颈和绿电支撑。 |
| Philippines PSA OpenSTAT | 能源、ICT、投资表目录已接入 | 投资表已完成全量 POST 探针；下一轮可抽 ICT 表和能源表具体值。 |
| World Bank WGI | 治理、监管质量、法治、政府效能等政策环境代理 | 已验证 Excel 可下载和 ASEAN 行可解析；下一轮可写成候选特征提取脚本。 |
| WRI Global Power Plant Database | 电厂容量、燃料结构和可再生装机静态特征 | 已接入缓存；下一轮可考虑把 WRI 来源纳入模型数据覆盖报告的来源说明。 |
| World Bank WGI 接入路径 | 治理、监管质量、法治、政府效能等政策环境代理 | 本轮尝试写 JS 提取脚本，但项目未安装 xml2js/adm-zip，已撤销，避免新增依赖；下一轮若接入应采用纯 Python zip/xml 或 PowerShell 解析写入缓存。 |
| Open Development Mekong CKAN | 湄公河开放数据目录 | 本轮 package_search 返回 Solr 503/HTTP 409，暂不接入；下一轮可改用已知 package id 或网页目录。 |
| Thailand EPPO CSV | 用电侧月度 CSV 已接入缓存 | 下一轮重试发电、进口、出口、燃料结构 CSV，补供给侧和绿电侧。 |
| 各国能源监管机构月度电价/负荷 | 对电力瓶颈最有价值 | 逐国查官方 API 或稳定 CSV，越南和印尼仍需继续；印尼 BPS 需 key。 |

## 当前未找到可直接训练的目标标签

| 目标数据 | 当前判断 | 可替代方案 |
|---|---|---|
| 数据中心项目级 MW、机柜、PUE、客户合同、收益 | 未找到统一、公开、跨国、稳定训练集 | PeeringDB 设施/网络/IX + 电力/市场指标做代理。 |
| 园区 PPA 或数据中心实际电价 | 未找到统一公开时序 | 国家电价、燃油、发电结构、供需压力做代理。 |
| AI 算力真实需求或订单 | 未找到公开跨国标签 | 安全服务器、互联网使用、高技术出口、FDI、数据中心设施做代理。 |
| 出海行动成功/失败结果 | 公开源缺失 | 只能做综合排序；若接入内部 CRM/项目结果，才能做监督训练。 |
