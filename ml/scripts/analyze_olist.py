"""Build the observed Olist late-delivery target summary and EDA figures (no training)."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw"
REPORT_DIR = REPO_ROOT / "ml" / "reports"
FIGURE_DIR = REPORT_DIR / "figures"


def read_csv(name: str) -> pd.DataFrame:
    path = RAW_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"Required CSV not found: {path}")
    try:
        return pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin-1", low_memory=False)


def save_bar(series: pd.Series, title: str, ylabel: str, filename: str, *, percent: bool = False) -> None:
    fig, ax = plt.subplots(figsize=(9, 5))
    values = series * 100 if percent else series
    values.plot(kind="bar", ax=ax, color="#477c61")
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    ax.set_xlabel("")
    ax.tick_params(axis="x", labelrotation=35)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / filename, dpi=150)
    plt.close(fig)


def main() -> int:
    orders = read_csv("olist_orders_dataset.csv")
    orders["order_status_norm"] = orders["order_status"].astype("string").str.lower().str.strip()
    orders["actual_customer_delivery_at"] = pd.to_datetime(
        orders["order_delivered_customer_date"], errors="coerce", utc=True
    )
    orders["estimated_delivery_at"] = pd.to_datetime(
        orders["order_estimated_delivery_date"], errors="coerce", utc=True
    )
    orders["order_purchase_at"] = pd.to_datetime(
        orders["order_purchase_timestamp"], errors="coerce", utc=True
    )

    delivered_status = orders["order_status_norm"].eq("delivered")
    missing_actual = orders["actual_customer_delivery_at"].isna()
    missing_estimated = orders["estimated_delivery_at"].isna()
    invalid_order_id = orders["order_id"].isna() | orders["order_id"].astype("string").str.strip().eq("")
    eligible = delivered_status & ~missing_actual & ~missing_estimated & ~invalid_order_id

    excluded = {
        "total_orders": int(len(orders)),
        "not_status_delivered": int((~delivered_status).sum()),
        "status_delivered_missing_or_invalid_actual_timestamp": int((delivered_status & missing_actual).sum()),
        "status_delivered_missing_or_invalid_estimated_timestamp": int((delivered_status & ~missing_actual & missing_estimated).sum()),
        "status_delivered_missing_order_id": int((delivered_status & ~missing_actual & ~missing_estimated & invalid_order_id).sum()),
        "eligible_delivered_orders": int(eligible.sum()),
    }

    cohort = orders.loc[eligible].copy()
    cohort["late_delivery"] = (
        cohort["actual_customer_delivery_at"] > cohort["estimated_delivery_at"]
    ).astype("int8")
    cohort["days_late_vs_estimate"] = (
        cohort["actual_customer_delivery_at"] - cohort["estimated_delivery_at"]
    ).dt.total_seconds() / 86_400
    cohort["purchase_month"] = cohort["order_purchase_at"].dt.strftime("%Y-%m")

    label_counts = cohort["late_delivery"].value_counts().reindex([0, 1], fill_value=0)
    label_summary = {
        "eligible_orders": int(len(cohort)),
        "on_time_or_early_count": int(label_counts.loc[0]),
        "late_count": int(label_counts.loc[1]),
        "on_time_or_early_share": float((cohort["late_delivery"] == 0).mean()) if len(cohort) else None,
        "late_share": float(cohort["late_delivery"].mean()) if len(cohort) else None,
        "mean_days_vs_estimate": float(cohort["days_late_vs_estimate"].mean()) if len(cohort) else None,
        "median_days_vs_estimate": float(cohort["days_late_vs_estimate"].median()) if len(cohort) else None,
    }

    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    save_bar(
        pd.Series({"On time or early": int(label_counts.loc[0]), "Late": int(label_counts.loc[1])}),
        "Olist eligible completed orders by delivery outcome",
        "Orders",
        "late_delivery_class_counts.png",
    )

    monthly_counts = cohort.dropna(subset=["purchase_month"]).groupby("purchase_month")["late_delivery"].agg(
        order_count="size", late_rate="mean"
    )
    # Hide months with very small samples; their percentages are too unstable to compare.
    monthly = monthly_counts.loc[monthly_counts["order_count"] >= 100, "late_rate"]
    if not monthly.empty:
        save_bar(monthly, "Late-delivery share by order-purchase month (months with at least 100 orders)", "Late orders (%)", "late_rate_by_purchase_month.png", percent=True)

    item_file = RAW_DIR / "olist_order_items_dataset.csv"
    seller_file = RAW_DIR / "olist_sellers_dataset.csv"
    product_file = RAW_DIR / "olist_products_dataset.csv"
    if item_file.is_file() and product_file.is_file():
        items = read_csv(item_file.name)
        products = read_csv(product_file.name)
        category_column = "product_category_name"
        if category_column in products and "product_id" in items.columns and "product_id" in products.columns:
            item_labels = items.merge(cohort[["order_id", "late_delivery"]], on="order_id", how="inner")
            item_labels = item_labels.merge(products[["product_id", category_column]], on="product_id", how="left")
            category_rates = (
                item_labels.dropna(subset=[category_column])
                .groupby(category_column)
                .agg(late_rate=("late_delivery", "mean"), item_rows=("late_delivery", "size"))
                .query("item_rows >= 100")
                .sort_values("item_rows", ascending=False)
                .head(12)["late_rate"]
                .sort_values()
            )
            if not category_rates.empty:
                save_bar(category_rates, "Late-delivery share by common product category (item-level)", "Late order-item rows (%)", "late_rate_by_category.png", percent=True)

    if item_file.is_file() and seller_file.is_file():
        items = read_csv(item_file.name)
        sellers = read_csv(seller_file.name)
        if {"order_id", "seller_id"}.issubset(items.columns) and {"seller_id", "seller_state"}.issubset(sellers.columns):
            seller_orders = items[["order_id", "seller_id"]].drop_duplicates().merge(
                cohort[["order_id", "late_delivery"]], on="order_id", how="inner"
            ).merge(sellers[["seller_id", "seller_state"]], on="seller_id", how="left")
            state_rates = (
                seller_orders.dropna(subset=["seller_state"])
                .groupby("seller_state")
                .agg(late_rate=("late_delivery", "mean"), order_seller_pairs=("late_delivery", "size"))
                .query("order_seller_pairs >= 100")
                .sort_values("order_seller_pairs", ascending=False)
                .head(12)["late_rate"]
                .sort_values()
            )
            if not state_rates.empty:
                save_bar(state_rates, "Late-delivery share by seller state (order-seller pairs)", "Late pairs (%)", "late_rate_by_seller_state.png", percent=True)

    summary = {
        "source": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
        "license": "CC BY-NC-SA 4.0 (per Kaggle dataset card; non-commercial educational use)",
        "prediction_time_assumption": "order purchase/placement; this is a design assumption for future work, not a trained model",
        "target_definition": "late_delivery = actual customer delivery timestamp > estimated delivery timestamp",
        "eligible_order_rule": "order_status == delivered and order_id, actual customer delivery timestamp, and estimated delivery timestamp are valid",
        "excluded_records": excluded,
        "target_summary": label_summary,
        "purchase_timestamp_range": {
            "minimum": cohort["order_purchase_at"].min().isoformat() if len(cohort) and cohort["order_purchase_at"].notna().any() else None,
            "maximum": cohort["order_purchase_at"].max().isoformat() if len(cohort) and cohort["order_purchase_at"].notna().any() else None,
        },
        "monthly_late_rate": [
            {"purchase_month": str(month), "eligible_orders": int(row["order_count"]), "late_rate": float(row["late_rate"])}
            for month, row in monthly_counts.iterrows()
        ],
        "model_training_performed": False,
        "figures": sorted(path.name for path in FIGURE_DIR.glob("*.png")),
        "feature_candidate_notes": {
            "potentially_available_at_order_purchase": [
                "order_purchase_timestamp calendar features",
                "customer/seller coarse state or city features (after privacy and sparse-category review)",
                "product category and item count",
                "item price/freight known at purchase if the source semantics confirm availability",
                "seller count per order",
            ],
            "exclude_from_predictors": [
                "order_delivered_customer_date (target source)",
                "order_estimated_delivery_date (target boundary and a date known at order time; consider only if input protocol permits)",
                "order_delivered_carrier_date (post-purchase)",
                "review scores/text/timestamps (post-delivery or outcome-adjacent)",
                "terminal order_status (filter only to define eligible historical labels, never a live predictor)",
                "raw order/customer/seller/product identifiers as model features",
            ],
        },
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output = REPORT_DIR / "analysis_summary.json"
    output.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    create_markdown_report(summary)
    print(f"Eligible delivered orders: {label_summary['eligible_orders']:,}")
    print(f"Late: {label_summary['late_count']:,}; on time/early: {label_summary['on_time_or_early_count']:,}")
    print(f"EDA summary: {output.relative_to(REPO_ROOT)}")
    print("No model was trained.")
    return 0


def create_markdown_report(summary: dict[str, object]) -> None:
    """Create the requested evidence-based report from measured outputs only."""
    inspection_path = REPORT_DIR / "dataset_inspection.json"
    if not inspection_path.exists():
        raise FileNotFoundError("Run inspect_dataset.py before analyze_olist.py to create the full report.")
    inspection = json.loads(inspection_path.read_text(encoding="utf-8"))
    target = summary["target_summary"]
    excluded = summary["excluded_records"]
    lines = [
        "# Olist Dataset Analysis — Phase 1A",
        "",
        "**Status:** Measured from the downloaded Kaggle CSV files. No model was trained.",
        "",
        "## Source and license",
        "",
        "- Source: [Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)",
        "- License shown on the Kaggle dataset card: CC BY-NC-SA 4.0.",
        "- Use in this project is limited to non-commercial educational analysis; raw data is excluded from Git.",
        "- Original CSVs were only read, not edited. The retained ZIP archive is under the ignored `ml/data/downloads/` directory.",
        "",
        "## Files, columns, types, and quality",
        "",
        "The exact counts below come from `ml/reports/dataset_inspection.json`, generated from the downloaded files. Dtypes are pandas' inferred read-time types, not validated business types.",
        "",
        "| File | Rows | Columns | Exact duplicate rows | Rows with duplicate checked key |",
        "|---|---:|---:|---:|---:|",
    ]
    for name, info in inspection["files"].items():
        key_duplicate_count = info["key_duplicate_rows"]
        key_duplicate_text = f"{key_duplicate_count:,}" if key_duplicate_count is not None else "Not checked"
        lines.append(f"| `{name}` | {info['rows']:,} | {info['columns_count']} | {info['exact_duplicate_rows']:,} | {key_duplicate_text} |")
    lines.extend(["", "### Columns and inferred pandas dtypes", ""])
    for name, info in inspection["files"].items():
        lines.append(f"#### `{name}`")
        lines.append("")
        lines.append("| Column | Inferred dtype | Missing |")
        lines.append("|---|---|---:|")
        missing = info["missing_by_column"]
        for column in info["columns"]:
            col_name = column["name"]
            lines.append(f"| `{col_name}` | `{column['pandas_dtype']}` | {missing.get(col_name, 0):,} |")
        lines.append("")
    lines.extend(["### Relationships", "", "Orphan counts below compare non-null child references to values in the referenced parent column. Geolocation is keyed by ZIP prefix for this check; it is not a one-row-per-prefix table.", ""])
    lines.append("| Child reference | Parent key | Non-null child rows | Orphan rows |")
    lines.append("|---|---|---:|---:|")
    for relation in inspection["relationships"]:
        if "orphan_rows" not in relation:
            continue
        lines.append(
            f"| `{relation['child_file']}.{relation['child_key']}` | "
            f"`{relation['parent_file']}.{relation['parent_key']}` | "
            f"{relation['child_non_null_rows']:,} | {relation['orphan_rows']:,} |"
        )
    lines.extend([
        "",
        "## Prediction target and eligible population",
        "",
        f"Definition: `{summary['target_definition']}`.",
        "",
        f"Eligibility rule: {summary['eligible_order_rule']}.",
        "",
        "| Population/exclusion | Count |",
        "|---|---:|",
        f"| All order rows | {excluded['total_orders']:,} |",
        f"| Not marked `delivered` | {excluded['not_status_delivered']:,} |",
        f"| Delivered status with missing/invalid actual delivery timestamp | {excluded['status_delivered_missing_or_invalid_actual_timestamp']:,} |",
        f"| Delivered status with actual but missing/invalid estimated timestamp | {excluded['status_delivered_missing_or_invalid_estimated_timestamp']:,} |",
        f"| Delivered status with missing order ID | {excluded['status_delivered_missing_order_id']:,} |",
        f"| Eligible completed orders | {target['eligible_orders']:,} |",
        "",
        "The target is `1` only when the actual customer delivery timestamp is strictly later than the estimated timestamp; orders delivered on or before the estimate are `0`. These are historical labels, not real-time model outputs.",
        "",
        "## Late vs on-time/early and class balance",
        "",
        f"- Late: {target['late_count']:,} ({target['late_share']:.2%}).",
        f"- On time or early: {target['on_time_or_early_count']:,} ({target['on_time_or_early_share']:.2%}).",
        f"- Mean delivery minus estimate: {target['mean_days_vs_estimate']:.2f} days (about {abs(target['mean_days_vs_estimate']):.2f} days before the estimate on average).",
        f"- Median delivery minus estimate: {target['median_days_vs_estimate']:.2f} days.",
        "",
        "A majority-only guess would label every eligible order on-time/early and match 91.89% of historical labels, while missing all 7,826 late orders. This shows why accuracy alone can hide poor late-order detection. This is a prevalence calculation, not model performance; no model was fit.",
        "",
        "## Beginner-friendly findings and data-quality cautions",
        "",
        f"- Eligible completed orders cover purchase timestamps from `{summary['purchase_timestamp_range']['minimum']}` to `{summary['purchase_timestamp_range']['maximum']}`.",
        "- Late delivery is the minority outcome (8.11%), so later evaluation should examine late-class recall and precision alongside overall accuracy.",
        "- The geolocation table has exact repeated rows. It is a many-rows-per-ZIP-prefix lookup, so do not join it directly to orders without a documented aggregation rule.",
        "- The review table has 1,603 rows with duplicated `review_id` values across 789 repeated IDs; none of these are exact duplicate full rows. Do not assume `review_id` uniquely identifies a review row.",
        "- There are 278 customer ZIP-prefix references and 7 seller ZIP-prefix references with no match in the geolocation lookup.",
        "- Some product fields and review comments are missing; per-column counts are shown above. Reviews and review timestamps are post-outcome and must not be model predictors.",
        "",
        "## EDA figures",
        "",
        "These figures show descriptive associations only, not causes or future model performance. The monthly chart omits months with fewer than 100 eligible orders; category and seller-state charts also require at least 100 rows.",
        "",
    ])
    for figure in summary["figures"]:
        lines.append(f"- ![{figure}](../ml/reports/figures/{figure})")
    lines.extend([
        "",
        "## Candidate features at order purchase time",
        "",
        "These are candidate fields for later review, not a final approved model schema. Only values available at the chosen scoring instant should be retained.",
        "",
        "| Candidate | Purpose | Availability / caution |",
        "|---|---|---|",
        "| Purchase date/time parts | Capture seasonality and day-of-week patterns | Available at purchase; timezone is not explicitly documented in the raw data. |",
        "| Promised lead time (`estimated date - purchase timestamp`) | Represent the promise horizon | Use only if the estimated date is fixed and available at prediction time. |",
        "| Product category, item count, product dimensions | Describe order composition | Available from the catalog/order at purchase; review missing category/dimensions. |",
        "| Order item price and freight, aggregated per order | Describe order scale/logistics charge | Confirm these values are known at the intended scoring time. |",
        "| Seller count; coarse seller/customer state or lane | Represent fulfillment/geographic context | Avoid raw identifiers and detailed personal location; account for sparse categories. |",
        "",
        "Exclude actual customer/carrier delivery timestamps, review content/scores/timestamps, terminal order status, and raw customer/order/seller/product identifiers from predictor features. Actual and estimated delivery timestamps are used to construct the historical target only, except a separately engineered promised-lead-time feature if approved.",
        "",
        "## Key limitations and data-quality notes",
        "",
        "- Olist represents Brazilian e-commerce orders from 2016–2018, not SupplyShield port-to-port shipments.",
        "- It records delivery outcome, but not internal disruption causes such as weather, port closure, fuel shocks, or geopolitical events.",
        "- Orders contain multiple item, seller, and payment rows. Any later train/validation/test split must group by `order_id` to prevent the same order from crossing partitions.",
        "- Inferred numeric dtypes do not make identifiers or ZIP prefixes quantitative measures; cast identifiers/categories deliberately in any later pipeline.",
        "- License is non-commercial/share-alike. This dataset is for educational work only unless separate rights are obtained.",
        "",
        "## Reproducibility",
        "",
        "From the repository root run `python ml/scripts/inspect_dataset.py` followed by `python ml/scripts/analyze_olist.py`. The scripts write measured JSON summaries and PNG charts under `ml/reports/`; they do not modify raw CSVs or train a model.",
        "",
    ])
    report_path = REPO_ROOT / "docs" / "DATASET_ANALYSIS.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
