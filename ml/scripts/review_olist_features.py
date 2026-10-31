"""Compare feature-set variants using train/validation only; never touch test metrics."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import train_olist


REPO_ROOT = train_olist.REPO_ROOT
REPORT_DIR = train_olist.REPORT_DIR
MODEL_PATH = train_olist.ARTIFACT_DIR / "olist-late-delivery-educational-v1.joblib"
SEED = train_olist.SEED

FEATURE_SETS = {
    "Reference feature set": list(train_olist.FEATURES),
    "Without ETA-derived promised lead": [f for f in train_olist.FEATURES if f != "promised_lead_days"],
    "Without customer/seller geography": [f for f in train_olist.FEATURES if f not in {"customer_state", "main_seller_state"}],
    "Conservative: without ETA lead or geography": [
        f for f in train_olist.FEATURES
        if f not in {"promised_lead_days", "customer_state", "main_seller_state"}
    ],
}


def make_pipeline(features: list[str]) -> Pipeline:
    numeric = [f for f in features if f in train_olist.NUMERIC_FEATURES]
    categorical = [f for f in features if f in train_olist.CATEGORICAL_FEATURES]
    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="__missing__")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    preprocess = ColumnTransformer([
        ("numeric", numeric_pipe, numeric),
        ("categorical", categorical_pipe, categorical),
    ])
    classifier = LogisticRegression(class_weight="balanced", max_iter=1500, random_state=SEED)
    return Pipeline([("preprocess", preprocess), ("classifier", classifier)])


def choose_threshold(y: pd.Series, probability: np.ndarray) -> tuple[float, dict[str, float]]:
    threshold, metrics = train_olist.choose_threshold(y, probability)
    return threshold, metrics


def evaluate_validation(y: pd.Series, probability: np.ndarray, threshold: float) -> dict[str, float]:
    prediction = (probability >= threshold).astype("int8")
    return {
        "threshold_selected_on_validation": float(threshold),
        "validation_accuracy_at_selected_threshold": float(accuracy_score(y, prediction)),
        "validation_late_precision_at_selected_threshold": float(precision_score(y, prediction, zero_division=0)),
        "validation_late_recall_at_selected_threshold": float(recall_score(y, prediction, zero_division=0)),
        "validation_late_f1_at_selected_threshold": float(f1_score(y, prediction, zero_division=0)),
        "validation_average_precision": float(average_precision_score(y, probability)),
    }


def main() -> int:
    print("Rebuilding the eligible order-level features...", flush=True)
    frame, _ = train_olist.build_order_frame()
    n = len(frame)
    train_end = int(n * 0.70)
    validation_end = int(n * 0.85)
    # Intentionally do not create metrics, labels summaries, or predictions for the final 15%.
    train = frame.iloc[:train_end]
    validation = frame.iloc[train_end:validation_end]
    x_train, y_train = train[train_olist.FEATURES], train["late_delivery"]
    x_validation, y_validation = validation[train_olist.FEATURES], validation["late_delivery"]

    outcomes = {}
    for name, features in FEATURE_SETS.items():
        print(f"Training validation-only feature comparison: {name}...", flush=True)
        pipeline = make_pipeline(features)
        pipeline.fit(x_train[features], y_train)
        probability = pipeline.predict_proba(x_validation[features])[:, 1]
        threshold, threshold_metrics = choose_threshold(y_validation, probability)
        outcomes[name] = {
            "feature_count": len(features),
            "features": features,
            "validation_threshold_selection": threshold_metrics,
            "validation_metrics": evaluate_validation(y_validation, probability, threshold),
        }

    reference = outcomes["Reference feature set"]["validation_metrics"]
    for name, result in outcomes.items():
        result["f1_change_vs_reference"] = (
            result["validation_metrics"]["validation_late_f1_at_selected_threshold"]
            - reference["validation_late_f1_at_selected_threshold"]
        )

    source = joblib.load(MODEL_PATH) if MODEL_PATH.is_file() else {}
    result = {
        "purpose": "Exploratory point-in-time and feature sensitivity review; train and validation only.",
        "test_period_used_for_feature_variant_metrics_or_selection": False,
        "prior_test_error_review_cited_for_context_only": True,
        "training_rows": int(len(train)),
        "validation_rows": int(len(validation)),
        "training_period": [train["_purchase_at"].min().isoformat(), train["_purchase_at"].max().isoformat()],
        "validation_period": [validation["_purchase_at"].min().isoformat(), validation["_purchase_at"].max().isoformat()],
        "validation_class_prevalence": float(y_validation.mean()),
        "evaluation_warning": "Feature variants and thresholds are both compared on the same validation period. Metrics are exploratory and optimistic; they are not a fresh generalization estimate. Do not use the previously reviewed test period for more tuning.",
        "prediction_time_assessment": {
            "order_purchase_timestamp_calendar_features": "Available by definition at purchase time.",
            "order_estimated_delivery_date_and_promised_lead_days": "High uncertainty for deployment: the CSV provides one final ETA value, not an ETA history/change log. Third-party data dictionaries describe it as the date shown at purchase, but the Kaggle source files do not let us verify that the exported value was not updated later. Exclude it for a conservative feature set until source provenance confirms timing.",
            "item_price_freight_product_category_dimensions": "Plausibly available during checkout/catalog selection, but the export has no feature capture timestamps; verify against the source system before live scoring.",
            "customer_state_and_seller_state": "Broad geography is plausibly known at purchase, but the test shows time-varying subgroup rates and a high miss rate in customer state SP. Avoid relying on coarse geography alone without drift monitoring and further validation.",
            "order_status_actual_delivery_review_carrier_delivery_payment_and_shipping_limit_fields": "Excluded because they are post-purchase/outcome-adjacent, labels, or their availability is not established at order purchase.",
        },
        "variants": outcomes,
        "previously_selected_model_version": source.get("model_version"),
        "unchanged_current_model_artifact": str(MODEL_PATH.relative_to(REPO_ROOT)) if source else None,
        "current_model_was_overwritten": False,
        "scikit_learn_version": sklearn.__version__,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "feature_review.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    lines = [
        "# Olist Feature and Prediction-Time Review",
        "",
        "**Scope:** Exploratory comparison using only the existing training (70%) and validation (15%) partitions. The previously reviewed final 15% test period was not used to score variants, choose thresholds, or select a feature set; prior test error findings are referenced only as context. The production model artifact was not overwritten.",
        "",
        "## Why revisit the feature set",
        "",
        "The Olist orders CSV contains one `order_estimated_delivery_date` value. It contains no ETA history or timestamp showing when that value was set or last changed. The [Kaggle dataset release](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) does not provide evidence in the file itself that this value is an immutable checkout-time snapshot. A [community-maintained Olist data README](https://github.com/aduverger/olist/blob/master/data/README.md) describes the ETA as the date informed to the customer at purchase, but that is secondary documentation and does not prove how the exported field was captured or whether later changes are possible. Therefore `promised_lead_days`, which is directly derived from the ETA used to define the label, is the feature with the highest point-in-time uncertainty. If the ETA was changed after purchase, it could leak later information into an order-purchase prediction.",
        "",
        "The product and order-item tables also lack feature-capture timestamps. Price, freight, category, dimensions, and seller location are plausible checkout-time inputs, but their historical snapshot timing is not independently verifiable from these CSVs. Geography deserves additional scrutiny because the prior error analysis found a change in the SP customer-state late rate across time partitions.",
        "",
        "## Feature-set comparison",
        "",
        "All variants use the same train/validation dates and Logistic Regression setup. Thresholds are selected on validation by late-class F1, then recall, then precision. Because feature choice and threshold are both inspected on the same validation period, the table is exploratory and likely optimistic; it is not a new final evaluation.",
        "",
        "| Feature set | Features | Validation threshold | Late precision | Late recall | Late F1 | Average precision | F1 change vs reference |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, row in outcomes.items():
        metrics = row["validation_metrics"]
        lines.append(
            f"| {name} | {row['feature_count']} | {metrics['threshold_selected_on_validation']:.4f} | "
            f"{metrics['validation_late_precision_at_selected_threshold']:.4f} | "
            f"{metrics['validation_late_recall_at_selected_threshold']:.4f} | "
            f"{metrics['validation_late_f1_at_selected_threshold']:.4f} | "
            f"{metrics['validation_average_precision']:.4f} | {row['f1_change_vs_reference']:+.4f} |"
        )
    lines.extend([
        "",
        "## Prediction-time assessment",
        "",
        "| Feature group | Assessment |",
        "|---|---|",
    ])
    for feature, note in result["prediction_time_assessment"].items():
        lines.append(f"| `{feature}` | {note} |")
    lines.extend([
        "",
        "## Recommendation",
        "",
        "1. Treat the feature comparison as a diagnostic, not as a new model selection result. Do not overwrite or promote the existing artifact based on this validation-only comparison.",
        "2. The no-ETA variant avoids the specific ETA-derived feature, but it still relies on other untimestamped order/catalog snapshots and is not proven deployment-safe. Its validation metrics were lower than the reference set, and this comparison is exploratory rather than a promotion decision.",
        "3. Investigate temporal drift and coarse geographic dependence. The previous test review found customer-state SP late prevalence of 5.59% in train, 3.39% in validation, and 9.53% in test, while the selected model missed 633 of 643 SP late test orders. This reviewed period must not be reused to tune another model.",
        "4. For another generalization estimate, obtain additional later-period data or define a new untouched holdout. The existing data ends in 2018, and the final 15% has already been reviewed; no fresh future Olist test period remains.",
        "5. Keep the current model disconnected from React/Express. New point-in-time evidence or a validated later-time evaluation is needed before reconsidering operational integration.",
        "",
        "The existing trained model artifact and Phase 1B report are unchanged. No React, Express, MongoDB, SAP AI Core, or SAP services were touched.",
        "",
    ])
    (REPO_ROOT / "docs" / "ML_FEATURE_REVIEW.md").write_text("\n".join(lines), encoding="utf-8")

    print("Feature comparison complete; the test period was not evaluated.")
    print("Report: docs/ML_FEATURE_REVIEW.md")
    for name, row in outcomes.items():
        metrics = row["validation_metrics"]
        print(f"{name}: validation F1={metrics['validation_late_f1_at_selected_threshold']:.4f}, AP={metrics['validation_average_precision']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
