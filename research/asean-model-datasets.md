# ASEAN model dataset candidates

Updated: 2026-06-05

This note tracks datasets that can strengthen the ASEAN green-compute decision models. The goal is not source breadth; the goal is model-ready fields, time coverage, access stability, and clear join keys.

## Current training baseline

- Model: power supply-pressure baseline.
- Target: `next_year_supply_gap_ratio = max(0, electricity_demand - electricity_generation) / electricity_demand`.
- Current sources: Our World in Data energy CSV plus World Bank annual indicators.
- Current panel: 6 countries, 2000-2025, 149 country-year samples, 16 features.
- Validation: time split, train target years through 2021, test from 2022 onward; held-out backtest error about 2.12 percentage points.
- Role: valid as a country-year baseline; not yet valid as project-level data-center power-gap prediction.

## Current fuel-price training run

- Model: Malaysia weekly fuel-price forecast baseline.
- Script: `scripts/asean_train_fuel_price.py`.
- Output: `.cache/asean-training/fuel-price-forecast.json`.
- Source: Malaysia OpenAPI Fuel Price, covering RON95, RON97 and Diesel.
- Current series: 2024-02-29 to 2026-06-04; 120 points per product.
- Training frame: 345 usable supervised samples after lag/rolling features.
- Target: next observed fuel-price delta added back to current price. This avoids tree-regression collapse when the latest policy-driven price level is above earlier training levels.
- Split: last 16 usable rows per product held out for validation.
- Validation: held-out backtest shows a usable short-term signal, with overall price error around 0.27 and relative error around 5.91%.
- Product-level held-out error: Diesel around 0.38, RON95 around 0.19, RON97 around 0.25.
- Model readout: performance is good enough for a short-term cost-disturbance signal; it should be described as `表现较好`, not as a production-grade electricity-price model.
- Role: suitable as an energy-cost disturbance signal for Malaysia; not a direct electricity-price or data-center power-gap forecast.
- Caveat: prices include policy-administered jumps, so outputs must be described as cost-pressure clues and not as market-clearing fuel-price forecasts.

## Highest-value additions

### 1. PeeringDB facilities API

- URL: `https://www.peeringdb.com/api/fac`
- Access test: HTTP 200 JSON on 2026-06-05.
- Tested country filters:
  - `?country=SG&limit=5`
  - `?country=MY&limit=5`
  - `?country=TH&limit=5`
  - `?country=VN&limit=5`
- Useful fields: `name`, `org_name`, `country`, `city`, `latitude`, `longitude`, `net_count`, `ix_count`, `carrier_count`, `updated`, `status`.
- Model use:
  - compute demand and network-readiness proxy.
  - map point layer for facilities and interconnection density.
  - feature candidates: facility count, network count, IX count, carrier count by country/city.
- Join key: `country`, `city`, `facility id`.
- Integration priority: high. This is the clearest project-like dataset available without scraping.
- Caveat: PeeringDB is volunteered industry data. It should be treated as coverage proxy, not a full data-center inventory.

### 2. Singapore Data.gov open-data download API

- URL pattern: `https://api-open.data.gov.sg/v1/public/api/datasets/{dataset_id}/poll-download`
- Access test: HTTP 200 JSON on 2026-06-05 for dataset `d_61eac3cdb086814af485dcc682b75ae9`; the older `api.data.gov.sg` host returned 403.
- Useful behavior: returns a short-lived CSV download URL.
- Model use:
  - replace or supplement CKAN `datastore_search` for larger historical pulls.
  - useful for Singapore monthly tariff, tariff components, generation/consumption and accounts datasets already represented in the source pool.
- Join key: dataset id plus date/month/year fields.
- Integration priority: high for Singapore history depth.
- Caveat: endpoint returns signed temporary URLs; ingestion must poll then download immediately.

### 3. Malaysia OpenAPI data catalogue

- Existing URLs:
  - `https://api.data.gov.my/data-catalogue?id=electricity_supply&limit=30&sort=-date`
  - `https://api.data.gov.my/data-catalogue?id=electricity_consumption&limit=30&sort=-date`
  - `https://api.data.gov.my/data-catalogue?id=fuelprice&limit=30&sort=-date`
  - `https://api.data.gov.my/data-catalogue?id=ipi_1d&limit=30&sort=-date`
- Current status: already active in source pool, but currently limited to 30 rows.
- Model use:
  - monthly supply and consumption for Malaysia.
  - fuel price and industrial production proxy variables.
- Join key: `date` plus sector/category fields.
- Integration priority: high. The immediate change should be increasing historical limit or paginating, not adding a new source.
- Caveat: direct guessed storage parquet URLs returned 404; use API catalogue rather than guessed storage paths.

### 4. World Bank renewable-energy indicators

- Tested URLs:
  - `EG.ELC.RNEW.ZS`: renewable electricity output share.
  - `EG.FEC.RNEW.ZS`: renewable energy consumption share.
- Access test: HTTP 200 JSON on 2026-06-05; 396 rows for six countries per indicator.
- Model use:
  - green-energy constraint score.
  - green parity model proxy until real electricity tariff and PPA data are available.
- Join key: `countryiso3code + date`.
- Integration priority: medium-high. Good for annual green constraint, not price parity.
- Caveat: latest non-null years lag current year.

## Keep researching before integration

### Ember direct data

- Candidate: Ember electricity data explorer yearly/monthly data.
- Access test: direct guessed API and CSV URLs failed or returned 403 on 2026-06-05.
- Current role: already indirectly included in OWID energy data, but direct monthly Ember data would be valuable if a stable public endpoint is found.
- Next step: use browser/manual inspection to locate current download links rather than guessing URL patterns.

### Global Energy Monitor power/project data

- Candidate: Global Integrated Power Tracker.
- Access test: guessed 2025 spreadsheet and download page returned 404 on 2026-06-05.
- Model use if recovered: project-level power plants, capacity, status, fuel and location for supply-side project features.
- Next step: locate the active data download page and confirm license/download path.

## Immediate implementation plan

1. Add a PeeringDB dataset source and extractor for `fac` records filtered to ASEAN countries.
2. Expand Malaysia OpenAPI history depth beyond the current 30 rows for electricity supply/consumption and fuel prices.
3. Add World Bank renewable-energy annual indicators to the source pool.
4. Add Singapore `api-open.data.gov.sg` poll-download support for CSV snapshots where CKAN page size is insufficient.
5. Keep Ember and GEM as research candidates until a stable downloadable endpoint is verified.
