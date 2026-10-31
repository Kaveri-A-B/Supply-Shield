"""Train and evaluate educational Olist late-delivery benchmark models.

This script uses one row per eligible order, a chronological 70/15/15 split,
training-only preprocessing, and validation-only threshold selection. It does
not expose predictions to SupplyShield's application or modify raw CSV files.
"""

from __future__ import annotations

import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "ml" / "data" / "raw"
REPORT_DIR = REPO_ROOT / "ml" / "reports"
FIGURE_DIR = REPORT_DIR / "figures"
ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts"
SEED = 42
MODEL_VERSION = "olist-late-delivery-educational-v1"

CATEGORICAL_FEATURES = [
    "purchase_month",
    "purchase_day_of_week",
    "purchase_hour",
    "customer_state",
    "main_seller_state",
    "main_product_category",
]
NUMERIC_FEATURES = [
    "promised_lead_days",
    "item_count",
    "seller_count",
    "item_price_total",
    "freight_total",
    "mean_product_weight_g",
    "mean_product_length_cm",
    "mean_product_height_cm",
    "mean_product_width_cm",
]
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES


def read_csv(name: str) -> pd.DataFrame:
    path = RAW_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"Required Olist CSV is missing: {path}")
    try:
        return pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin-1", low_memory=False)


def source_archive_sha256() -> str | None:
    """Hash the retained source ZIP when present, without exposing its contents."""
    archive = REPO_ROOT / "ml" / "data" / "downloads" / "olist-brazilian-ecommerce.zip"
    if not archive.is_file():
        return None
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def modal_value_table(frame: pd.DataFrame, source_column: str, output_column: str) -> pd.DataFrame:
    """Return a deterministic per-order mode without a Python callback per order."""
    counts = (
        frame.dropna(subset=[source_column])
        .groupby(["order_id", source_column], observed=True)
        .size()
        .rename("_value_count")
        .reset_index()
        .sort_values(["order_id", "_value_count", source_column], ascending=[True, False, True], kind="stable")
        .drop_duplicates("order_id")
        .rename(columns={source_column: output_column})
    )
    return counts[["order_id", output_column]]


def build_order_frame() -> tuple[pd.DataFrame, dict[str, int]]:
    """Construct one feature row per labeled order from order-time fields."""
    orders = read_csv("olist_orders_dataset.csv")
    customers = read_csv("olist_customers_dataset.csv")
    items = read_csv("olist_order_items_dataset.csv")
    products = read_csv("olist_products_dataset.csv")
    sellers = read_csv("olist_sellers_dataset.csv")

    orders["_status"] = orders["order_status"].astype("string").str.lower().str.strip()
    orders["_purchase_at"] = pd.to_datetime(orders["order_purchase_timestamp"], errors="coerce", utc=True)
    orders["_actual_at"] = pd.to_datetime(orders["order_delivered_customer_date"], errors="coerce", utc=True)
    orders["_estimated_at"] = pd.to_datetime(orders["order_estimated_delivery_date"], errors="coerce", utc=True)

    delivered = orders["_status"].eq("delivered")
    missing_id = orders["order_id"].isna() | orders["order_id"].astype("string").str.strip().eq("")
    missing_actual = orders["_actual_at"].isna()
    missing_estimate = orders["_estimated_at"].isna()
    missing_purchase = orders["_purchase_at"].isna()
    eligible = delivered & ~missing_id & ~missing_actual & ~missing_estimate
    eligible_before_time = eligible.copy()
    eligible &= ~missing_purchase

    counts = {
        "all_order_rows": int(len(orders)),
        "not_delivered_status": int((~delivered).sum()),
        "delivered_missing_order_id": int((delivered & missing_id).sum()),
        "delivered_missing_actual_delivery_timestamp": int((delivered & ~missing_id & missing_actual).sum()),
        "delivered_missing_estimated_delivery_timestamp": int((delivered & ~missing_id & ~missing_actual & missing_estimate).sum()),
        "eligible_but_missing_purchase_timestamp": int((eligible_before_time & missing_purchase).sum()),
        "eligible_training_orders": int(eligible.sum()),
    }

    frame = orders.loc[eligible, [
        "order_id", "customer_id", "_purchase_at", "_actual_at", "_estimated_at"
    ]].copy()
    frame["late_delivery"] = (frame["_actual_at"] > frame["_estimated_at"]).astype("int8")
    frame["purchase_month"] = frame["_purchase_at"].dt.month.astype("string")
    frame["purchase_day_of_week"] = frame["_purchase_at"].dt.day_of_week.astype("string")
    frame["purchase_hour"] = frame["_purchase_at"].dt.hour.astype("string")
    frame["promised_lead_days"] = (
        frame["_estimated_at"] - frame["_purchase_at"]
    ).dt.total_seconds() / 86_400

    customer_lookup = customers[["customer_id", "customer_state"]].copy()
    if customer_lookup["customer_id"].duplicated().any():
        raise ValueError("customer_id is not unique; refusing an ambiguous customer join.")
    frame = frame.merge(customer_lookup, on="customer_id", how="left", validate="many_to_one")

    if "product_category_name_translation.csv" in {p.name for p in RAW_DIR.glob("*.csv")}:
        translations = read_csv("product_category_name_translation.csv")
        products = products.merge(
            translations[["product_category_name", "product_category_name_english"]],
            on="product_category_name", how="left", validate="many_to_one",
        )
        products["_category"] = products["product_category_name_english"].fillna(products["product_category_name"])
    else:
        products["_category"] = products["product_category_name"]
    if products["product_id"].duplicated().any():
        raise ValueError("product_id is not unique; refusing an ambiguous product join.")
    if sellers["seller_id"].duplicated().any():
        raise ValueError("seller_id is not unique; refusing an ambiguous seller join.")

    item_features = items.merge(
        products[["product_id", "_category", "product_weight_g", "product_length_cm", "product_height_cm", "product_width_cm"]],
        on="product_id", how="left", validate="many_to_one",
    ).merge(
        sellers[["seller_id", "seller_state"]],
        on="seller_id", how="left", validate="many_to_one",
    )
    item_agg = item_features.groupby("order_id", sort=False).agg(
        item_count=("order_item_id", "size"),
        seller_count=("seller_id", "nunique"),
        item_price_total=("price", "sum"),
        freight_total=("freight_value", "sum"),
        mean_product_weight_g=("product_weight_g", "mean"),
        mean_product_length_cm=("product_length_cm", "mean"),
        mean_product_height_cm=("product_height_cm", "mean"),
        mean_product_width_cm=("product_width_cm", "mean"),
    ).reset_index()
    item_agg = item_agg.merge(
        modal_value_table(item_features, "_category", "main_product_category"),
        on="order_id", how="left", validate="one_to_one",
    ).merge(
        modal_value_table(item_features, "seller_state", "main_seller_state"),
        on="order_id", how="left", validate="one_to_one",
    )
    frame = frame.merge(item_agg, on="order_id", how="left", validate="one_to_one")

    # Keep missing catalog/seller-derived values missing for training-only imputers.
    # sklearn imputation expects NumPy-style NaN; pandas' nullable pd.NA
    # sentinel is ambiguous in sklearn's object-array missing-value check.
    frame[CATEGORICAL_FEATURES] = frame[CATEGORICAL_FEATURES].astype(object).where(
        frame[CATEGORICAL_FEATURES].notna(), np.nan
    )

    if frame["order_id"].duplicated().any():
        raise ValueError("Feature construction created more than one row per order.")
    if frame[FEATURES].isna().all(axis=1).any():
        raise ValueError("At least one order has no available model features; inspect joins before training.")
    return frame.sort_values(["_purchase_at", "order_id"]).reset_index(drop=True), counts


def split_temporally(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, object]]:
    n_rows = len(frame)
    train_end = int(n_rows * 0.70)
    validation_end = int(n_rows * 0.85)
    train = frame.iloc[:train_end].copy()
    validation = frame.iloc[train_end:validation_end].copy()
    test = frame.iloc[validation_end:].copy()

    sets = [set(part["order_id"]) for part in (train, validation, test)]
    if any(sets[i].intersection(sets[j]) for i in range(3) for j in range(i + 1, 3)):
        raise ValueError("An order_id appears in more than one temporal split.")
    for name, part in (("train", train), ("validation", validation), ("test", test)):
        if part["late_delivery"].nunique() < 2:
            raise ValueError(f"The {name} time split contains only one label class; evaluation is not meaningful.")

    manifest = {}
    for name, part in (("train", train), ("validation", validation), ("test", test)):
        manifest[name] = {
            "rows": int(len(part)),
            "late_count": int(part["late_delivery"].sum()),
            "late_rate": float(part["late_delivery"].mean()),
            "purchase_start": part["_purchase_at"].min().isoformat(),
            "purchase_end": part["_purchase_at"].max().isoformat(),
        }
    manifest["split_rule"] = "Chronological order-level rows sorted by purchase timestamp then order_id; first 70% train, next 15% validation, final 15% test. Each order_id occurs once and belongs to one split."
    return train, validation, test, manifest


def make_preprocessor(*, scale_numeric: bool) -> ColumnTransformer:
    numeric_steps = [("imputer", SimpleImputer(strategy="median", add_indicator=True))]
    if scale_numeric:
        numeric_steps.append(("scale", StandardScaler()))
    numeric_pipe = Pipeline(numeric_steps)
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="__missing__")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("numeric", numeric_pipe, NUMERIC_FEATURES),
        ("categorical", categorical_pipe, CATEGORICAL_FEATURES),
    ])


def choose_threshold(y_true: pd.Series, probability: np.ndarray) -> tuple[float, dict[str, float]]:
    precision, recall, thresholds = precision_recall_curve(y_true, probability)
    precision = precision[:-1]
    recall = recall[:-1]
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros_like(precision), where=(precision + recall) > 0)
    # Deterministic rule: maximize validation F1, then recall, then precision.
    best_index = int(np.lexsort((thresholds, precision, recall, f1))[-1])
    threshold = float(thresholds[best_index])
    return threshold, {
        "precision": float(precision[best_index]),
        "recall": float(recall[best_index]),
        "f1": float(f1[best_index]),
    }


def evaluate(y_true: pd.Series, prediction: np.ndarray, probability: np.ndarray, threshold: float) -> dict[str, object]:
    matrix = confusion_matrix(y_true, prediction, labels=[0, 1])
    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, prediction)),
        "precision_late_class": float(precision_score(y_true, prediction, zero_division=0)),
        "recall_late_class": float(recall_score(y_true, prediction, zero_division=0)),
        "f1_late_class": float(f1_score(y_true, prediction, zero_division=0)),
        "average_precision_pr_auc": float(average_precision_score(y_true, probability)),
        "roc_auc": float(roc_auc_score(y_true, probability)),
        "brier_score_uncalibrated": float(brier_score_loss(y_true, probability)),
        "confusion_matrix_labels_0_1": {
            "true_negative": int(matrix[0, 0]), "false_positive": int(matrix[0, 1]),
            "false_negative": int(matrix[1, 0]), "true_positive": int(matrix[1, 1]),
        },
    }


def make_pipeline(model) -> Pipeline:
    return Pipeline([
        ("preprocess", make_preprocessor(scale_numeric=isinstance(model, LogisticRegression))),
        ("classifier", model),
    ])


def transformed_importance(pipeline: Pipeline, limit: int = 20) -> tuple[list[dict[str, object]], str]:
    classifier = pipeline.named_steps["classifier"]
    names = pipeline.named_steps["preprocess"].get_feature_names_out()
    if hasattr(classifier, "feature_importances_"):
        values = classifier.feature_importances_
        method = "Random Forest impurity-based importance; descriptive, not causal."
    elif hasattr(classifier, "coef_"):
        values = np.abs(classifier.coef_[0])
        method = "Absolute Logistic Regression coefficient; numeric inputs are standardized."
    else:
        return [], "No model-specific feature importance is available."
    top = np.argsort(values)[::-1][:limit]
    return [{"feature": str(names[i]), "importance": float(values[i])} for i in top], method


def save_figures(y_test: pd.Series, probabilities: dict[str, np.ndarray], predictions: dict[str, np.ndarray], selected_name: str) -> None:
    FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(9, 5))
    for name, score in probabilities.items():
        precision, recall, _ = precision_recall_curve(y_test, score)
        ax.plot(recall, precision, label=name)
    ax.axhline(float(y_test.mean()), color="#777777", linestyle="--", label="Test prevalence")
    ax.set(xlabel="Recall for late orders", ylabel="Precision for late orders", title="Precision-recall curves on the untouched test period")
    ax.grid(alpha=0.25)
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "model_test_precision_recall.png", dpi=150)
    plt.close(fig)

    matrix = confusion_matrix(y_test, predictions[selected_name], labels=[0, 1])
    fig, ax = plt.subplots(figsize=(6, 5))
    image = ax.imshow(matrix, cmap="Greens")
    ax.set_xticks([0, 1], labels=["Predicted on time", "Predicted late"])
    ax.set_yticks([0, 1], labels=["Actual on time", "Actual late"])
    ax.set_title(f"{selected_name}: untouched test confusion matrix")
    for (row, col), value in np.ndenumerate(matrix):
        ax.text(col, row, f"{value:,}", ha="center", va="center", color="black")
    fig.colorbar(image, ax=ax, label="Orders")
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "selected_model_test_confusion_matrix.png", dpi=150)
    plt.close(fig)


def write_report(result: dict[str, object]) -> None:
    lines = [
        "# Olist Late-Delivery Model Training — Phase 1B",
        "",
        "**Status:** Educational benchmark models trained and evaluated. Results are not production performance and are not connected to the SupplyShield application.",
        "",
        "## Question and target",
        "",
        "Predict whether an Olist order delivered to the customer was later than its estimated delivery date. Positive class `1` means late; `0` means on or before the estimate. The target is constructed from actual and estimated delivery timestamps. Only orders marked delivered with a valid order ID and valid timestamps are eligible; a valid purchase timestamp is additionally required for the chronological split.",
        "",
        "## Dataset and point-in-time assumptions",
        "",
        "This is a non-commercial educational benchmark under the dataset card's CC BY-NC-SA 4.0 license. It represents Brazilian e-commerce, not global freight or all disruption types. Scoring time is assumed to be order purchase/placement. The estimated date, item prices/freight, customer state, product catalog fields, and seller state are assumed to be available at that moment; these are dataset-based assumptions and must be verified before any live integration.",
        "",
        "Excluded from predictors: actual delivery timestamp, order status, order/customer/product/seller IDs, carrier delivery timestamp, review fields, payment fields, and shipping-limit timestamp. IDs are retained only for joins/split audit. The estimated delivery timestamp is used to construct the target and its difference from purchase time (`promised_lead_days`) is used as a predictor only under the stated availability assumption.",
        "",
        "Order-level features aggregate multiple items: item count, distinct seller count, totals for item price and freight, average product weight/dimensions, most frequent product category, and most frequent seller state. Ties in the modal categories use the alphabetically first value. Categorical variables are one-hot encoded; numeric missing values are imputed with training-set medians. Logistic Regression also standardizes numeric inputs. All preprocessing is fitted within each model pipeline using only the training partition.",
        "",
        "## Temporal split",
        "",
        f"Split rule: {result['split']['split_rule']}",
        "",
        "| Partition | Orders | Late orders | Late rate | Purchase-time range |",
        "|---|---:|---:|---:|---|",
    ]
    for name in ("train", "validation", "test"):
        part = result["split"][name]
        lines.append(f"| {name.title()} | {part['rows']:,} | {part['late_count']:,} | {part['late_rate']:.2%} | {part['purchase_start']} to {part['purchase_end']} |")
    lines.extend([
        "",
        "## Threshold and model-selection rule",
        "",
        "For Logistic Regression, Decision Tree, and Random Forest, probability thresholds were selected on validation data by highest late-class F1, then recall, then precision. The threshold was frozen before test evaluation. The Dummy baseline always predicts the training majority class. The selected fitted model is chosen from the three trained models by the same validation F1/recall/precision ordering; the final test results are reported once for all candidates and were not used to choose the model or threshold.",
        "",
        "## Test results",
        "",
        "Precision, recall, and F1 refer to the late class. Average precision is the summary of the precision-recall curve. Brier scores are reported on uncalibrated scores, especially affected by class-weighted training; do not interpret these as calibrated probabilities.",
        "",
        "| Model | Threshold | Accuracy | Late precision | Late recall | Late F1 | Average precision | ROC AUC | Brier (uncalibrated) | TP | FP | FN | TN |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for name, metrics in result["test_metrics"].items():
        cm = metrics["confusion_matrix_labels_0_1"]
        lines.append(
            f"| {name} | {metrics['threshold']:.4f} | {metrics['accuracy']:.4f} | {metrics['precision_late_class']:.4f} | "
            f"{metrics['recall_late_class']:.4f} | {metrics['f1_late_class']:.4f} | {metrics['average_precision_pr_auc']:.4f} | "
            f"{metrics['roc_auc']:.4f} | {metrics['brier_score_uncalibrated']:.4f} | {cm['true_positive']:,} | "
            f"{cm['false_positive']:,} | {cm['false_negative']:,} | {cm['true_negative']:,} |"
        )
    lines.extend([
        "",
        f"Selected model by validation rule: **{result['selected_model']}** (validation threshold `{result['selected_threshold']:.4f}`).",
        "",
        "![Precision-recall curves on test data](../ml/reports/figures/model_test_precision_recall.png)",
        "",
        "![Selected model confusion matrix](../ml/reports/figures/selected_model_test_confusion_matrix.png)",
        "",
        "## Important interpretation limits",
        "",
        "- Olist's late-delivery target is narrower than SupplyShield's general disruption objective.",
        "- The benchmark's historical time period and Brazilian e-commerce setting do not establish performance on current SupplyShield shipments.",
        "- Temporal holdout reduces future-time leakage but does not prove generalization to new suppliers, regions, businesses, or freight modes.",
        "- The model uses a documented assumption that the estimated delivery date and order-time aggregates are available when scoring. If that is false for a deployment, those features must be removed and the model retrained.",
        "- Threshold selection reflects statistical F1/recall/precision only; no operational alert-capacity or cost target was provided.",
        "- Probability outputs have not been calibrated. Do not display them as reliable risk probabilities in the dashboard.",
        "- False-positive and false-negative review is still needed with a domain reviewer; no operational decision or app integration is enabled.",
        "- Data is licensed CC BY-NC-SA 4.0 and this benchmark is for non-commercial educational use.",
        "",
        "## Reproducibility",
        "",
        f"- Model version: `{result['model_version']}`.",
        f"- Random seed: `{result['random_seed']}`.",
        f"- Source ZIP SHA-256: `{result['dataset_sha256'] or 'not available'}`.",
        f"- Python: `{result['environment']['python']}`; pandas `{result['environment']['pandas']}`; scikit-learn `{result['environment']['scikit_learn']}`; NumPy `{result['environment']['numpy']}`; joblib `{result['environment']['joblib']}`.",
        f"- Selected estimator and fitted preprocessing are saved locally at `ml/artifacts/{result['artifact_file']}`; that folder is Git-ignored.",
        "- Detailed JSON metrics, split manifest, validation thresholds, feature allow-list, and top transformed-feature importances are in `ml/reports/model_evaluation.json`.",
        "- No React, Express, MongoDB, SAP AI Core, or inference-service integration was performed in Phase 1B.",
        "",
    ])
    (REPO_ROOT / "docs" / "ML_TRAINING_REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    print("Building the eligible order-level feature table...", flush=True)
    frame, exclusions = build_order_frame()
    print(f"Prepared {len(frame):,} labeled orders and {len(FEATURES)} approved candidate features.", flush=True)
    train, validation, test, split_manifest = split_temporally(frame)
    x_train, y_train = train[FEATURES], train["late_delivery"]
    x_validation, y_validation = validation[FEATURES], validation["late_delivery"]
    x_test, y_test = test[FEATURES], test["late_delivery"]

    models = {
        "Logistic Regression": LogisticRegression(class_weight="balanced", max_iter=1500, random_state=SEED),
        "Shallow Decision Tree": DecisionTreeClassifier(max_depth=5, min_samples_leaf=100, class_weight="balanced", random_state=SEED),
        "Random Forest": RandomForestClassifier(
            n_estimators=160, max_depth=16, min_samples_leaf=20,
            class_weight="balanced_subsample", max_features="sqrt",
            n_jobs=-1, random_state=SEED,
        ),
    }
    fitted: dict[str, Pipeline] = {}
    validation_summary: dict[str, dict[str, object]] = {}
    thresholds: dict[str, float] = {}

    dummy = make_pipeline(DummyClassifier(strategy="most_frequent"))
    print("Fitting majority-class baseline...", flush=True)
    dummy.fit(x_train, y_train)
    fitted["Majority Dummy Baseline"] = dummy
    thresholds["Majority Dummy Baseline"] = 0.5
    validation_summary["Majority Dummy Baseline"] = {"precision": 0.0, "recall": 0.0, "f1": 0.0, "threshold": 0.5}

    for name, estimator in models.items():
        print(f"Fitting {name}...", flush=True)
        pipeline = make_pipeline(estimator)
        pipeline.fit(x_train, y_train)
        fitted[name] = pipeline
        probability = pipeline.predict_proba(x_validation)[:, 1]
        threshold, validation_metrics = choose_threshold(y_validation, probability)
        thresholds[name] = threshold
        validation_summary[name] = {**validation_metrics, "threshold": threshold}

    selectable = list(models.keys())
    selected_name = max(
        selectable,
        key=lambda name: (
            validation_summary[name]["f1"],
            validation_summary[name]["recall"],
            validation_summary[name]["precision"],
        ),
    )

    test_metrics: dict[str, dict[str, object]] = {}
    test_probabilities: dict[str, np.ndarray] = {}
    test_predictions: dict[str, np.ndarray] = {}
    for name, pipeline in fitted.items():
        probabilities = pipeline.predict_proba(x_test)[:, 1]
        predictions = (probabilities >= thresholds[name]).astype("int8") if name != "Majority Dummy Baseline" else pipeline.predict(x_test)
        test_probabilities[name] = probabilities
        test_predictions[name] = predictions
        test_metrics[name] = evaluate(y_test, predictions, probabilities, thresholds[name])

    selected_pipeline = fitted[selected_name]
    importance_result = transformed_importance(selected_pipeline)
    importances, importance_method = importance_result
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact_name = f"{MODEL_VERSION}.joblib"
    artifact_path = ARTIFACT_DIR / artifact_name
    model_bundle = {
        "pipeline": selected_pipeline,
        "model_version": MODEL_VERSION,
        "selected_model": selected_name,
        "decision_threshold": thresholds[selected_name],
        "feature_columns": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "positive_class": 1,
        "negative_class": 0,
    }
    joblib.dump(model_bundle, artifact_path, compress=3)
    save_figures(y_test, test_probabilities, test_predictions, selected_name)

    result = {
        "model_version": MODEL_VERSION,
        "target": "late_delivery = actual customer delivery timestamp > estimated delivery timestamp",
        "prediction_time_assumption": "Order purchase/placement; estimated delivery date and order-level item/catalog/geographic features assumed known then.",
        "license": "CC BY-NC-SA 4.0; non-commercial educational use only",
        "exclusions": exclusions,
        "split": split_manifest,
        "random_seed": SEED,
        "selected_model": selected_name,
        "selected_threshold": thresholds[selected_name],
        "validation_metrics": validation_summary,
        "test_metrics": test_metrics,
        "feature_allow_list": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "excluded_from_predictors": [
            "order_id and customer_id (join/split bookkeeping only)",
            "order_status (eligibility filter only)",
            "order_delivered_customer_date (target only)",
            "order_estimated_delivery_date (target source; only promised_lead_days derived feature used under stated availability assumption)",
            "order_delivered_carrier_date, review fields, payment fields, shipping_limit_date",
            "product_id and seller_id (aggregation/join only)",
        ],
        "top_transformed_feature_importance": {"method": importance_method, "values": importances},
        "dataset_sha256": source_archive_sha256(),
        "artifact_file": artifact_name,
        "artifact_sha256": hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
        "environment": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
            "scikit_learn": sklearn.__version__,
            "numpy": np.__version__,
            "joblib": joblib.__version__,
            "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        },
        "probability_caveat": "Raw model scores are not calibrated probabilities; class weighting may affect probability interpretation.",
        "integration_status": "Local benchmark artifact only; no application or SAP integration.",
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "model_evaluation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    write_report(result)
    print(f"Selected model by validation F1, recall, precision: {selected_name}")
    print(f"Test late-class F1: {test_metrics[selected_name]['f1_late_class']:.4f}; recall: {test_metrics[selected_name]['recall_late_class']:.4f}; precision: {test_metrics[selected_name]['precision_late_class']:.4f}")
    print(f"Report: docs/ML_TRAINING_REPORT.md")
    print(f"Local artifact: ml/artifacts/{artifact_name}")
    print("No app or SAP integration was performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
