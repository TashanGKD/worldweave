# 东盟模型数据覆盖记录

Updated: 2026-06-06T09:50:10.259Z

| 模型 | 数据来源 | 时间范围 | 样本/点位 | 国家覆盖 | 当前判断 | 局限 |
|---|---|---|---:|---:|---|---|
| 能源成本扰动预测 | Malaysia OpenAPI Fuel Price | 2024-02-29-2026-06-04 | 345 | 1 | 周度时序可用 | 只作为能源成本扰动线索，不直接代表电价或供电缺口。 |
| 市场吸引力 | World Bank ASEAN GDP；World Bank ASEAN Internet Users；World Bank ASEAN Secure Internet Servers；World Bank ASEAN FDI Net Inflows | 2017-2024 | 77 | 11 | 代理回看可用 | 该模型预测公开指标构造的代理分，不代表真实项目收益或行动结果；缺少项目级标签时，只能用于排序、趋势和补数优先级判断。 |
| 电力瓶颈 | Our World in Data Energy Dataset；World Bank annual indicators | 2000-2025 | 149 | 6 | 年度面板可用 | 年度国家面板适合供需压力线索，不代表园区或项目级缺电概率。 |
| 绿电平价 | World Bank ASEAN Renewable Electricity Output；World Bank ASEAN Renewable Energy Consumption；Our World in Data Energy Dataset；Singapore Data.gov Electricity Generation And Consumption | 2017-2025 | 43 | 11 | 代理回看可用 | 该模型预测公开指标构造的代理分，不代表真实项目收益或行动结果；缺少项目级标签时，只能用于排序、趋势和补数优先级判断。 |
| 算力需求 | World Bank ASEAN Internet Users；World Bank ASEAN Secure Internet Servers；World Bank ASEAN FDI Net Inflows；World Bank ASEAN High-Technology Exports | 2017-2024 | 77 | 11 | 代理回看可用 | 该模型预测公开指标构造的代理分，不代表真实项目收益或行动结果；缺少项目级标签时，只能用于排序、趋势和补数优先级判断。 |
| 出海优先级 | World Bank ASEAN GDP；World Bank ASEAN Electricity Access；World Bank ASEAN Electric Power Consumption；World Bank ASEAN Internet Users | 2017-2025 | 82 | 11 | 代理回看可用 | 该模型预测公开指标构造的代理分，不代表真实项目收益或行动结果；缺少项目级标签时，只能用于排序、趋势和补数优先级判断。 |

说明：
- 代理模型预测的是公开指标构造的代理分，不代表真实项目收益或行动结果。
- 电力与油价是当前更扎实的时序/面板基线。
- 算力需求和出海优先级仍需要项目结果或行动结果标签，才能推进到业务结果预测。
