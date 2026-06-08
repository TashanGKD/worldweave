from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor


ROOT = Path.cwd()
DATASET_CACHE_FILE = ROOT / ".cache" / "asean-dataset-metric-cache.json"
OUTPUT_DIR = ROOT / ".cache" / "asean-training"
OUTPUT_FILE = OUTPUT_DIR / "fuel-price-forecast.json"

FUEL_LABELS = {
    "燃油价格 ron95": "ron95",
    "燃油价格 ron97": "ron97",
    "燃油价格 diesel": "diesel",
}
HORIZON_STEPS = 8
TEST_STEPS_PER_PRODUCT = 16


@dataclass
class SeriesMeta:
    product: str
    label: str
    country: str
    source_name: str
    source_url: str
    start: str
    end: str
    point_count: int


def load_dataset_cache() -> dict[str, Any]:
    if not DATASET_CACHE_FILE.exists():
        raise FileNotFoundError(f"Missing dataset cache: {DATASET_CACHE_FILE}")
    return json.loads(DATASET_CACHE_FILE.read_text(encoding="utf-8"))


def load_fuel_frame(cache: dict[str, Any]) -> tuple[pd.DataFrame, list[SeriesMeta]]:
    rows: list[dict[str, Any]] = []
    metas: list[SeriesMeta] = []
    for series in cache.get("series", []):
        label = str(series.get("label") or "")
        product = FUEL_LABELS.get(label)
        if not product:
            continue
        points = sorted(series.get("points") or [], key=lambda item: str(item.get("date") or ""))
        if not points:
            continue
        metas.append(
            SeriesMeta(
                product=product,
                label=label,
                country=str(series.get("country") or ""),
                source_name=str(series.get("source_name") or ""),
                source_url=str(series.get("source_url") or ""),
                start=str(points[0].get("date") or ""),
                end=str(points[-1].get("date") or ""),
                point_count=len(points),
            )
        )
        for point in points:
            rows.append(
                {
                    "date": pd.to_datetime(point.get("date")),
                    "product": product,
                    "value": float(point.get("value")),
                }
            )
    if not rows:
        raise RuntimeError("No Malaysia fuel price series found in dataset cache.")
    frame = pd.DataFrame(rows).sort_values(["date", "product"]).reset_index(drop=True)
    return frame, metas


def build_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    wide = frame.pivot_table(index="date", columns="product", values="value", aggfunc="mean").sort_index()
    products = list(FUEL_LABELS.values())
    samples: list[pd.DataFrame] = []
    for product in products:
        if product not in wide:
            continue
        data = pd.DataFrame(index=wide.index)
        data["date"] = wide.index
        data["product"] = product
        data["target"] = wide[product].shift(-1)
        data["current"] = wide[product]
        for lag in [1, 2, 3, 4, 8, 12]:
            data[f"lag_{lag}"] = wide[product].shift(lag)
        data["rolling_mean_4"] = wide[product].shift(1).rolling(4).mean()
        data["rolling_mean_8"] = wide[product].shift(1).rolling(8).mean()
        data["rolling_std_4"] = wide[product].shift(1).rolling(4).std()
        data["diff_1"] = wide[product].diff(1)
        data["diff_4"] = wide[product].diff(4)
        data["pct_change_1"] = wide[product].pct_change(1).replace([np.inf, -np.inf], np.nan)
        for other in products:
            if other == product or other not in wide:
                continue
            data[f"{other}_lag_1"] = wide[other].shift(1)
            data[f"spread_vs_{other}"] = wide[product] - wide[other]
        iso = data["date"].dt.isocalendar()
        week = iso.week.astype(float)
        data["week_sin"] = np.sin(2 * np.pi * week / 52.0)
        data["week_cos"] = np.cos(2 * np.pi * week / 52.0)
        data["month"] = data["date"].dt.month.astype(float)
        data["days_since_start"] = (data["date"] - data["date"].min()).dt.days.astype(float)
        samples.append(data)
    full = pd.concat(samples, ignore_index=True)
    full = full.dropna(subset=["target", "lag_1", "lag_2", "lag_4", "rolling_mean_4"]).reset_index(drop=True)
    return full


def train_model(samples: pd.DataFrame) -> tuple[XGBRegressor, list[str], dict[str, Any], pd.DataFrame, pd.DataFrame]:
    samples = samples.sort_values(["product", "date"]).reset_index(drop=True)
    samples["is_test"] = False
    for product in sorted(samples["product"].unique()):
        idx = samples.index[samples["product"] == product].to_list()
        for row_idx in idx[-TEST_STEPS_PER_PRODUCT:]:
            samples.loc[row_idx, "is_test"] = True
    feature_names = [
        column
        for column in samples.columns
        if column not in {"date", "product", "target", "is_test"}
    ]
    product_dummies = pd.get_dummies(samples["product"], prefix="product")
    matrix = pd.concat([samples[feature_names], product_dummies], axis=1)
    matrix = matrix.replace([np.inf, -np.inf], np.nan)
    model_features = list(matrix.columns)
    train_mask = ~samples["is_test"]
    test_mask = samples["is_test"]
    x_train = matrix.loc[train_mask]
    y_train = samples.loc[train_mask, "target"] - samples.loc[train_mask, "current"]
    x_test = matrix.loc[test_mask]
    y_test = samples.loc[test_mask, "target"]

    model = XGBRegressor(
        objective="reg:squarederror",
        n_estimators=180,
        max_depth=3,
        learning_rate=0.04,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=2,
        reg_lambda=1.2,
        reg_alpha=0.02,
        random_state=42,
        n_jobs=1,
    )
    model.fit(x_train, y_train)

    def evaluate(mask: pd.Series) -> dict[str, Any]:
        x = matrix.loc[mask]
        y = samples.loc[mask, "target"]
        pred = samples.loc[mask, "current"].to_numpy() + model.predict(x)
        rmse = math.sqrt(mean_squared_error(y, pred))
        mape = float(np.mean(np.abs((y.to_numpy() - pred) / np.maximum(np.abs(y.to_numpy()), 1e-9))))
        r2 = r2_score(y, pred) if len(y) > 1 else 0.0
        return {
            "count": int(len(y)),
            "mae": float(mean_absolute_error(y, pred)),
            "rmse": float(rmse),
            "mape": mape,
            "r2": float(r2),
        }

    metrics = {
        "train": evaluate(train_mask),
        "test": evaluate(test_mask),
    }
    test_rows = samples.loc[test_mask, ["date", "product", "current", "target"]].copy()
    test_rows["prediction"] = test_rows["current"].to_numpy() + model.predict(matrix.loc[test_mask])
    return model, model_features, metrics, samples, test_rows


def make_model_row(
    history: pd.DataFrame,
    product: str,
    date: pd.Timestamp,
    products: list[str],
) -> dict[str, Any]:
    wide = history.pivot_table(index="date", columns="product", values="value", aggfunc="mean").sort_index()
    product_series = wide[product]
    row: dict[str, Any] = {
        "date": date,
        "product": product,
        "current": float(product_series.iloc[-1]),
    }
    for lag in [1, 2, 3, 4, 8, 12]:
        row[f"lag_{lag}"] = float(product_series.iloc[-lag]) if len(product_series) >= lag else np.nan
    row["rolling_mean_4"] = float(product_series.iloc[-4:].mean()) if len(product_series) >= 4 else np.nan
    row["rolling_mean_8"] = float(product_series.iloc[-8:].mean()) if len(product_series) >= 8 else np.nan
    row["rolling_std_4"] = float(product_series.iloc[-4:].std()) if len(product_series) >= 4 else np.nan
    row["diff_1"] = float(product_series.iloc[-1] - product_series.iloc[-2]) if len(product_series) >= 2 else np.nan
    row["diff_4"] = float(product_series.iloc[-1] - product_series.iloc[-4]) if len(product_series) >= 4 else np.nan
    row["pct_change_1"] = float(row["diff_1"] / product_series.iloc[-2]) if len(product_series) >= 2 and abs(product_series.iloc[-2]) > 1e-9 else np.nan
    for other in products:
        if other == product:
            continue
        other_series = wide[other]
        row[f"{other}_lag_1"] = float(other_series.iloc[-1]) if len(other_series) else np.nan
        row[f"spread_vs_{other}"] = float(product_series.iloc[-1] - other_series.iloc[-1]) if len(other_series) else np.nan
    iso_week = float(pd.Timestamp(date).isocalendar().week)
    row["week_sin"] = float(np.sin(2 * np.pi * iso_week / 52.0))
    row["week_cos"] = float(np.cos(2 * np.pi * iso_week / 52.0))
    row["month"] = float(pd.Timestamp(date).month)
    row["days_since_start"] = float((pd.Timestamp(date) - history["date"].min()).days)
    for p in products:
        row[f"product_{p}"] = 1.0 if p == product else 0.0
    return row


def recursive_forecast(
    model: XGBRegressor,
    feature_names: list[str],
    frame: pd.DataFrame,
    steps: int = HORIZON_STEPS,
) -> list[dict[str, Any]]:
    products = sorted(frame["product"].unique())
    history = frame.copy().sort_values(["date", "product"]).reset_index(drop=True)
    forecast_rows: list[dict[str, Any]] = []
    current_date = history["date"].max()
    for step in range(1, steps + 1):
        next_date = current_date + pd.Timedelta(days=7)
        next_points: list[dict[str, Any]] = []
        for product in products:
            row = make_model_row(history, product, next_date, products)
            x = pd.DataFrame([row]).reindex(columns=feature_names)
            prediction = float(row["current"] + model.predict(x)[0])
            prediction = max(0.0, prediction)
            current_value = float(history.loc[history["product"] == product, "value"].iloc[-1])
            forecast_rows.append(
                {
                    "date": next_date.strftime("%Y-%m-%d"),
                    "step": step,
                    "product": product,
                    "predicted_price": round(prediction, 4),
                    "previous_observed_or_predicted": round(current_value, 4),
                    "change": round(prediction - current_value, 4),
                    "direction": "上行" if prediction > current_value + 1e-6 else "下行" if prediction < current_value - 1e-6 else "持平",
                }
            )
            next_points.append({"date": next_date, "product": product, "value": prediction})
        history = pd.concat([history, pd.DataFrame(next_points)], ignore_index=True)
        current_date = next_date
    return forecast_rows


def feature_importance(model: XGBRegressor, feature_names: list[str]) -> list[dict[str, Any]]:
    values = model.feature_importances_
    rows = [
        {"feature": feature, "importance": float(value)}
        for feature, value in zip(feature_names, values, strict=False)
        if value > 0
    ]
    rows.sort(key=lambda item: item["importance"], reverse=True)
    return rows[:20]


def summarize_test_predictions(test_rows: pd.DataFrame) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for product, group in test_rows.groupby("product"):
        errors = group["prediction"] - group["target"]
        out.append(
            {
                "product": product,
                "count": int(len(group)),
                "start": group["date"].min().strftime("%Y-%m-%d"),
                "end": group["date"].max().strftime("%Y-%m-%d"),
                "mae": float(np.mean(np.abs(errors))),
                "rmse": float(math.sqrt(np.mean(np.square(errors)))),
                "latest_validation_rows": [
                    {
                        "date": row.date.strftime("%Y-%m-%d"),
                        "current": round(float(row.current), 4),
                        "actual_next": round(float(row.target), 4),
                        "predicted_next": round(float(row.prediction), 4),
                        "error": round(float(row.prediction - row.target), 4),
                    }
                    for row in group.tail(5).itertuples(index=False)
                ],
            }
        )
    return out


def main() -> None:
    cache = load_dataset_cache()
    frame, metas = load_fuel_frame(cache)
    samples = build_feature_frame(frame)
    model, feature_names, metrics, samples_with_split, test_rows = train_model(samples)
    forecasts = recursive_forecast(model, feature_names, frame)
    output = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "model_id": "malaysia-fuel-price-weekly-forecast",
        "model_type": "XGBRegressor",
        "target": "next_observed_fuel_price_delta_added_to_current_price",
        "forecast_horizon": "one-step weekly model, recursively rolled forward for 8 weeks",
        "source": {
            "name": metas[0].source_name if metas else "Malaysia OpenAPI Fuel Price",
            "url": metas[0].source_url if metas else "",
            "country": "马来西亚",
        },
        "series": [meta.__dict__ for meta in metas],
        "sample_count": int(len(samples_with_split)),
        "split": {
            "method": f"last {TEST_STEPS_PER_PRODUCT} usable rows per fuel product held out",
            "train_count": int((~samples_with_split["is_test"]).sum()),
            "test_count": int(samples_with_split["is_test"].sum()),
        },
        "feature_names": feature_names,
        "metrics": metrics,
        "metrics_by_product": summarize_test_predictions(test_rows),
        "feature_importance": feature_importance(model, feature_names),
        "forecast_8_weeks": forecasts,
        "limitations": [
            "燃油价格用于观察能源成本扰动，需要结合电力供需和园区价格复核。",
            "当前样本来自马来西亚公开燃油价格序列，不能外推到其他东盟国家。",
            "RON95 长期受政策价格约束，模型会学习到阶跃变化前后的模式；结果应作为成本压力线索，不作为能源价格决策依据。",
            "8周预测采用递推方式，越往后误差会累积。",
        ],
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT_FILE),
        "model_id": output["model_id"],
        "sample_count": output["sample_count"],
        "metrics": output["metrics"],
        "forecast_preview": output["forecast_8_weeks"][:9],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
