"""Describe false negatives and false positives for the saved Olist test holdout."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import confusion_matrix

import train_olist


REPO_ROOT = train_olist.REPO_ROOT
REPORT_DIR = train_olist.REPORT_DIR
FIGURE_DIR = train_olist.FIGURE_DIR
ARTIFACT_PATH = train_olist.ARTIFACT_DIR / "olist-late-delivery-educational-v1.joblib"
MIN_GROUP_SIZE = 100


def group_rates(frame: pd.DataFrame, column: str) -> list[dict[str, object]]:
    """Summarize miss/false-alert rates with denominators and a minimum sample."""
    data = frame.copy()
    data[column] = data[column].astype("object").where(data[column].notna(), "__missing__")
    rows = []
    for value, group in data.groupby(column, dropna=False, sort=True):
        late = group[group["actual_late"]]
        on_time = group[~group["actual_late"]]
        late_count = len(late)
        on_time_count = len(on_time)
        if late_count >= MIN_GROUP_SIZE or on_time_count >= MIN_GROUP_SIZE:
            rows.append({
                "feature": column,
                "value": str(value),
                "actual_late_orders": int(late_count),
                "missed_late_orders": int(late["false_negative"].sum()),
                "miss_rate_among_late": float(late["false_negative"].mean()) if late_count >= MIN_GROUP_SIZE else None,
                "false_alert_rate_among_on_time": float(on_time["false_positive"].mean()) if on_time_count >= MIN_GROUP_SIZE else None,
                "actual_on_time_orders": int(on_time_count),
                "false_alert_orders": int(on_time["false_positive"].sum()),
            })
    return rows


def numeric_error_comparison(frame: pd.DataFrame, column: str) -> dict[str, object]:
    return {
        group: {
            "orders": int(mask.sum()),
            "median": float(frame.loc[mask, column].median()) if mask.any() else None,
            "mean": float(frame.loc[mask, column].mean()) if mask.any() else None,
        }
        for group, mask in {
            "true_positive_late_caught": frame["true_positive"],
            "false_negative_late_missed": frame["false_negative"],
            "false_positive_on_time_flagged": frame["false_positive"],
            "true_negative_on_time_not_flagged": frame["true_negative"],
        }.items()
    }


def selected_feature_effects(bundle: dict[str, object]) -> dict[str, float]:
    pipeline = bundle["pipeline"]
    classifier = pipeline.named_steps["classifier"]
    if not hasattr(classifier, "coef_"):
        return {}
    names = pipeline.named_steps["preprocess"].get_feature_names_out()
    coefficients = classifier.coef_[0]
    targets = {
        "customer_state_SP": "categorical__customer_state_SP",
        "main_seller_state_SP": "categorical__main_seller_state_SP",
        "main_product_category_health_beauty": "categorical__main_product_category_health_beauty",
        "promised_lead_days": "numeric__promised_lead_days",
    }
    lookup = {str(name): float(value) for name, value in zip(names, coefficients)}
    return {key: lookup[name] for key, name in targets.items() if name in lookup}


def write_markdown(result: dict[str, object]) -> None:
    cm = result["confusion_matrix"]
    lines = [
        "# Olist Model Error Review — Phase 1B",
        "",
        "**Scope:** Read-only analysis of the already trained, selected Logistic Regression model on the untouched chronological test period. No model was retrained and no threshold was changed.",
        "",
        "## Overall errors",
        "",
        f"At the validation-selected threshold `{result['threshold']:.4f}`, the model flagged {cm['true_positive'] + cm['false_positive']:,} of {result['test_orders']:,} test orders as late.",
        "",
        "| Outcome | Count | Meaning |",
        "|---|---:|---|",
        f"| True positive | {cm['true_positive']:,} | Late orders correctly flagged |",
        f"| False negative | {cm['false_negative']:,} | Late orders missed |",
        f"| False positive | {cm['false_positive']:,} | On-time/early orders incorrectly flagged |",
        f"| True negative | {cm['true_negative']:,} | On-time/early orders correctly left unflagged |",
        "",
        f"The model missed {result['miss_rate']:.2%} of test late orders and incorrectly flagged {result['false_alert_rate']:.2%} of test on-time/early orders. Of all flagged orders, {result['false_discovery_rate']:.2%} were false alerts. These are measured on one historical holdout only.",
        "",
        "## Error rates by purchase month",
        "",
        "These are descriptive rates, with counts shown so small samples can be identified. The test period contains only later 2018 purchases.",
        "",
        "| Month | Test orders | Actual late | Late missed | Miss rate among late | On-time/early | False alerts | False-alert rate among on-time |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in result["monthly_errors"]:
        lines.append(
            f"| {row['value']} | {row['orders']:,} | {row['actual_late_orders']:,} | {row['missed_late_orders']:,} | "
            f"{row['miss_rate_among_late']:.2%} | {row['actual_on_time_orders']:,} | {row['false_alert_orders']:,} | "
            f"{row['false_alert_rate_among_on_time']:.2%} |"
        )
    lines.extend(["", "![Error rates by purchase month](../ml/reports/figures/model_error_rates_by_month.png)", ""])
    lines.extend([
        "## Possible temporal shift in a high-error group",
        "",
        "The selected Logistic Regression model assigns a negative conditional coefficient to `customer_state_SP`. The observed late-order share in that customer-state group changed across the chronological partitions, and the model missed most of its test late orders. This is a useful drift signal to investigate, not proof that geography caused errors.",
        "",
        "| Partition | Customer-state SP orders | Late orders | Late share |",
        "|---|---:|---:|---:|",
    ])
    for split_name in ("train", "validation", "test"):
        row = result["split_group_rates"][split_name]["customer_state_SP"]
        share = f"{row['late_rate']:.2%}" if row["late_rate"] is not None else "n/a"
        lines.append(f"| {split_name.title()} | {row['orders']:,} | {row['late_orders']:,} | {share} |")
    coefficient = result["selected_model_signed_coefficients"].get("customer_state_SP")
    lead_coefficient = result["selected_model_signed_coefficients"].get("promised_lead_days")
    sp_errors = next(row for row in result["group_errors"]["customer_state"] if row["value"] == "SP")
    lines.extend([
        "",
        f"In the test partition, {sp_errors['missed_late_orders']:,} of {sp_errors['actual_late_orders']:,} late orders with customer state SP were missed. The fitted conditional coefficient for this one-hot feature was `{coefficient:.3f}`; the standardized promised-lead-days coefficient was `{lead_coefficient:.3f}`. Coefficient signs describe the model's learned association after controlling for its other inputs; they do not show causes.",
        "",
    ])

    for feature, label in (("main_product_category", "Product category"), ("customer_state", "Customer state"), ("main_seller_state", "Seller state")):
        rows = result["group_errors"].get(feature, [])
        enough_late = [row for row in rows if row["actual_late_orders"] >= MIN_GROUP_SIZE]
        worst_miss = sorted(enough_late, key=lambda row: row["miss_rate_among_late"], reverse=True)[:8]
        enough_on_time = [row for row in rows if row["actual_on_time_orders"] >= MIN_GROUP_SIZE]
        worst_false_alert = sorted(enough_on_time, key=lambda row: row["false_alert_rate_among_on_time"] or 0, reverse=True)[:8]
        lines.extend([f"## {label} groups", "", f"Only groups with at least {MIN_GROUP_SIZE} actual late orders are ranked for missed-late rates; false-alert comparisons also require at least {MIN_GROUP_SIZE} actual on-time/early orders. These comparisons are descriptive and not causal.", ""])
        lines.extend([
            "### Highest missed-late rates among adequately sized groups", "",
            "| Group | Actual late orders | Missed | Miss rate | Actual on-time/early | False alerts | False-alert rate |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ])
        if not worst_miss:
            lines.append("| No groups met the minimum sample rule | — | — | — | — | — | — |")
        for row in worst_miss:
            fp_rate = row["false_alert_rate_among_on_time"]
            fp_rate_display = f"{fp_rate:.2%}" if fp_rate is not None else "n/a"
            lines.append(
                f"| {row['value']} | {row['actual_late_orders']:,} | {row['missed_late_orders']:,} | {row['miss_rate_among_late']:.2%} | "
                f"{row['actual_on_time_orders']:,} | {row['false_alert_orders']:,} | {fp_rate_display} |"
            )
        lines.extend([
            "",
            "### Highest false-alert rates among adequately sized groups", "",
            "| Group | Actual on-time/early orders | False alerts | False-alert rate | Actual late orders | Missed | Miss rate |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ])
        if not worst_false_alert:
            lines.append("| No groups met the minimum sample rule | — | — | — | — | — | — |")
        for row in worst_false_alert:
            miss_rate = row["miss_rate_among_late"]
            miss_rate_display = f"{miss_rate:.2%}" if miss_rate is not None else "n/a"
            lines.append(
                f"| {row['value']} | {row['actual_on_time_orders']:,} | {row['false_alert_orders']:,} | {row['false_alert_rate_among_on_time']:.2%} | "
                f"{row['actual_late_orders']:,} | {row['missed_late_orders']:,} | {miss_rate_display} |"
            )
        lines.append("")

    lines.extend([
        "## Numeric feature patterns in errors",
        "",
        "Median values are compared between missed and caught late orders, and between false alerts and correctly unflagged on-time/early orders. These are post hoc descriptions of this test sample; they do not establish that a feature caused an error.",
        "",
        "| Feature | Late caught median (n) | Late missed median (n) | On-time correctly unflagged median (n) | False-alert median (n) |",
        "|---|---:|---:|---:|---:|",
    ])
    for feature, groups in result["numeric_error_comparisons"].items():
        caught = groups["true_positive_late_caught"]
        missed = groups["false_negative_late_missed"]
        tn = groups["true_negative_on_time_not_flagged"]
        fp = groups["false_positive_on_time_flagged"]
        lines.append(
            f"| `{feature}` | {caught['median']:.3f} (n={caught['orders']:,}) | {missed['median']:.3f} (n={missed['orders']:,}) | "
            f"{tn['median']:.3f} (n={tn['orders']:,}) | {fp['median']:.3f} (n={fp['orders']:,}) |"
        )
    lines.extend([
        "",
        "## What this suggests for the next iteration",
        "",
        "- The operating threshold was chosen for F1, not for an agreed business alert budget. Any threshold change must use validation data and a stated missed-delay versus false-alert trade-off; do not tune on this test period.",
        "- Error rates vary with the late-order prevalence in each time slice and subgroup. Review the denominators and do not interpret small or historical groups as stable risk estimates.",
        "- Investigate whether the Olist ETA and shipment timing fields are truly available at the intended prediction instant. If not, remove the affected features and retrain on a fresh validation/test design.",
        "- The model still misses many late orders and generates many false alerts. It should remain an educational benchmark, not a dashboard or operational predictor.",
        "- Use a future improvement cycle to inspect label quality, temporal drift, sparse categories, and additional legitimate early-warning signals. New datasets/features require separate provenance and leakage review.",
        "",
        "No order IDs, customer IDs, or raw customer records are included in this report.",
        "",
    ])
    (REPO_ROOT / "docs" / "ML_ERROR_ANALYSIS.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not ARTIFACT_PATH.is_file():
        raise FileNotFoundError("Trained Phase 1B model artifact is missing; run train_olist.py first.")
    bundle = __import__("joblib").load(ARTIFACT_PATH)
    frame, _ = train_olist.build_order_frame()
    train, validation, test, _ = train_olist.split_temporally(frame)
    x_test = test[train_olist.FEATURES]
    y_test = test["late_delivery"]
    probability = bundle["pipeline"].predict_proba(x_test)[:, 1]
    predicted = (probability >= bundle["decision_threshold"]).astype("int8")

    review = test[train_olist.FEATURES].copy()
    review["actual_late"] = y_test.to_numpy().astype(bool)
    review["predicted_late"] = predicted.astype(bool)
    review["probability_score_uncalibrated"] = probability
    review["true_positive"] = review["actual_late"] & review["predicted_late"]
    review["false_negative"] = review["actual_late"] & ~review["predicted_late"]
    review["false_positive"] = ~review["actual_late"] & review["predicted_late"]
    review["true_negative"] = ~review["actual_late"] & ~review["predicted_late"]
    review["purchase_month"] = test["_purchase_at"].dt.strftime("%Y-%m").to_numpy()

    tn, fp, fn, tp = confusion_matrix(y_test, predicted, labels=[0, 1]).ravel()
    month_rows = []
    for month, group in review.groupby("purchase_month", sort=True):
        actual_late = group[group["actual_late"]]
        actual_on_time = group[~group["actual_late"]]
        month_rows.append({
            "value": str(month), "orders": int(len(group)),
            "actual_late_orders": int(len(actual_late)),
            "missed_late_orders": int(actual_late["false_negative"].sum()),
            "miss_rate_among_late": float(actual_late["false_negative"].mean()) if len(actual_late) else None,
            "actual_on_time_orders": int(len(actual_on_time)),
            "false_alert_orders": int(actual_on_time["false_positive"].sum()),
            "false_alert_rate_among_on_time": float(actual_on_time["false_positive"].mean()) if len(actual_on_time) else None,
        })

    group_errors = {
        column: group_rates(review, column)
        for column in ("main_product_category", "customer_state", "main_seller_state")
    }
    numeric_comparisons = {
        column: numeric_error_comparison(review, column)
        for column in (
            "promised_lead_days", "item_count", "seller_count", "item_price_total", "freight_total",
            "mean_product_weight_g", "mean_product_length_cm", "mean_product_height_cm", "mean_product_width_cm",
        )
    }
    split_group_rates = {}
    split_values = [
        ("customer_state_SP", "customer_state", "SP"),
        ("main_seller_state_SP", "main_seller_state", "SP"),
        ("main_product_category_health_beauty", "main_product_category", "health_beauty"),
    ]
    for name, part in (("train", train), ("validation", validation), ("test", test)):
        split_group_rates[name] = {
            key: {
                "orders": int(len(group)),
                "late_orders": int(group["late_delivery"].sum()),
                "late_rate": float(group["late_delivery"].mean()) if len(group) else None,
            }
            for key, column, value in split_values
            for group in [part[part[column] == value]]
        }
    result = {
        "scope": "Selected saved model; untouched chronological test partition; no retraining or threshold change.",
        "model_version": bundle["model_version"],
        "selected_model": bundle["selected_model"],
        "threshold": float(bundle["decision_threshold"]),
        "test_orders": int(len(review)),
        "actual_late_orders": int(review["actual_late"].sum()),
        "confusion_matrix": {
            "true_negative": int(tn), "false_positive": int(fp),
            "false_negative": int(fn), "true_positive": int(tp),
        },
        "miss_rate": float(fn / (fn + tp)) if fn + tp else None,
        "false_alert_rate": float(fp / (fp + tn)) if fp + tn else None,
        "false_discovery_rate": float(fp / (fp + tp)) if fp + tp else None,
        "minimum_subgroup_size": MIN_GROUP_SIZE,
        "monthly_errors": month_rows,
        "group_errors": group_errors,
        "numeric_error_comparisons": numeric_comparisons,
        "split_group_rates": split_group_rates,
        "selected_model_signed_coefficients": selected_feature_effects(bundle),
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "model_error_analysis.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    months = pd.DataFrame(month_rows).sort_values("value")
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(months["value"], months["miss_rate_among_late"] * 100, marker="o", label="Late orders missed")
    ax.plot(months["value"], months["false_alert_rate_among_on_time"] * 100, marker="o", label="On-time orders falsely flagged")
    ax.set_ylabel("Rate within actual outcome group (%)")
    ax.set_xlabel("Order-purchase month")
    ax.set_title("Selected model error rates by test-period month")
    ax.tick_params(axis="x", labelrotation=35)
    ax.grid(alpha=0.25)
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIGURE_DIR / "model_error_rates_by_month.png", dpi=150)
    plt.close(fig)

    write_markdown(result)
    print(f"Test errors — FN {fn:,}, FP {fp:,}, TP {tp:,}, TN {tn:,}")
    print(f"Miss rate among late: {result['miss_rate']:.2%}; false-alert rate among on-time: {result['false_alert_rate']:.2%}")
    print("No model was retrained and no threshold was changed.")
    print("Report: docs/ML_ERROR_ANALYSIS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
