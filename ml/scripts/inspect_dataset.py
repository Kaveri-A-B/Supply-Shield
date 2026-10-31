"""Create a reproducible, read-only structural and relationship audit of raw CSVs."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw"
REPORT_DIR = REPO_ROOT / "ml" / "reports"

PRIMARY_KEYS = {
    "olist_orders_dataset.csv": "order_id",
    "olist_customers_dataset.csv": "customer_id",
    "olist_sellers_dataset.csv": "seller_id",
    "olist_products_dataset.csv": "product_id",
    "olist_order_items_dataset.csv": "order_id,order_item_id",
    "olist_order_payments_dataset.csv": "order_id,payment_sequential",
    "olist_order_reviews_dataset.csv": "review_id",
}

FOREIGN_KEYS = [
    ("olist_order_items_dataset.csv", "order_id", "olist_orders_dataset.csv", "order_id"),
    ("olist_order_items_dataset.csv", "product_id", "olist_products_dataset.csv", "product_id"),
    ("olist_order_items_dataset.csv", "seller_id", "olist_sellers_dataset.csv", "seller_id"),
    ("olist_order_payments_dataset.csv", "order_id", "olist_orders_dataset.csv", "order_id"),
    ("olist_order_reviews_dataset.csv", "order_id", "olist_orders_dataset.csv", "order_id"),
    ("olist_orders_dataset.csv", "customer_id", "olist_customers_dataset.csv", "customer_id"),
    ("olist_customers_dataset.csv", "customer_zip_code_prefix", "olist_geolocation_dataset.csv", "geolocation_zip_code_prefix"),
    ("olist_sellers_dataset.csv", "seller_zip_code_prefix", "olist_geolocation_dataset.csv", "geolocation_zip_code_prefix"),
]


def read_csv(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin-1", low_memory=False)


def key_duplicate_rows(frame: pd.DataFrame, key_spec: str) -> int | None:
    columns = key_spec.split(",")
    if not set(columns).issubset(frame.columns):
        return None
    return int(frame.duplicated(subset=columns, keep=False).sum())


def main() -> int:
    files = sorted(RAW_DIR.glob("*.csv"))
    if not files:
        raise SystemExit(f"No CSV files found in {RAW_DIR}. Download the Kaggle archive first.")

    frames: dict[str, pd.DataFrame] = {}
    report: dict[str, object] = {
        "source": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
        "license": "CC BY-NC-SA 4.0 (per Kaggle dataset card; educational non-commercial use)",
        "raw_files_are_modified": False,
        "files": {},
    }

    for path in files:
        frame = read_csv(path)
        frames[path.name] = frame
        report["files"][path.name] = {
            "rows": int(len(frame)),
            "columns_count": int(len(frame.columns)),
            "columns": [
                {"name": str(column), "pandas_dtype": str(frame[column].dtype)}
                for column in frame.columns
            ],
            "missing_by_column": {
                str(column): int(count)
                for column, count in frame.isna().sum().items()
                if count
            },
            "exact_duplicate_rows": int(frame.duplicated().sum()),
            "key_duplicate_rows": key_duplicate_rows(
                frame, PRIMARY_KEYS.get(path.name, "")
            ) if path.name in PRIMARY_KEYS else None,
            "key_definition_checked": PRIMARY_KEYS.get(path.name),
        }

    relationships = []
    for child_file, child_key, parent_file, parent_key in FOREIGN_KEYS:
        if child_file not in frames or parent_file not in frames:
            relationships.append({
                "child_file": child_file,
                "parent_file": parent_file,
                "status": "required file missing",
            })
            continue
        child = frames[child_file]
        parent = frames[parent_file]
        if child_key not in child or parent_key not in parent:
            relationships.append({
                "child_file": child_file,
                "parent_file": parent_file,
                "status": "required key column missing",
            })
            continue
        parent_values = set(parent[parent_key].dropna().astype(str))
        child_values = child[child_key].dropna().astype(str)
        relationships.append({
            "child_file": child_file,
            "child_key": child_key,
            "parent_file": parent_file,
            "parent_key": parent_key,
            "child_non_null_rows": int(child_values.size),
            "orphan_rows": int((~child_values.isin(parent_values)).sum()),
        })

    report["relationships"] = relationships
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output = REPORT_DIR / "dataset_inspection.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Inspected {len(files)} original CSV files; raw data was read-only.")
    print(f"Report: {output.relative_to(REPO_ROOT)}")
    for name, summary in report["files"].items():
        print(
            f"{name}: {summary['rows']:,} rows, {summary['columns_count']} columns, "
            f"{summary['exact_duplicate_rows']:,} exact duplicate rows"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
