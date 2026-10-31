# Olist Feature and Prediction-Time Review

**Scope:** Exploratory comparison using only the existing training (70%) and validation (15%) partitions. The previously reviewed final 15% test period was not used to score variants, choose thresholds, or select a feature set; prior test error findings are referenced only as context. The production model artifact was not overwritten.

## Why revisit the feature set

The Olist orders CSV contains one `order_estimated_delivery_date` value. It contains no ETA history or timestamp showing when that value was set or last changed. The [Kaggle dataset release](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) does not provide evidence in the file itself that this value is an immutable checkout-time snapshot. A [community-maintained Olist data README](https://github.com/aduverger/olist/blob/master/data/README.md) describes the ETA as the date informed to the customer at purchase, but that is secondary documentation and does not prove how the exported field was captured or whether later changes are possible. Therefore `promised_lead_days`, which is directly derived from the ETA used to define the label, is the feature with the highest point-in-time uncertainty. If the ETA was changed after purchase, it could leak later information into an order-purchase prediction.

The product and order-item tables also lack feature-capture timestamps. Price, freight, category, dimensions, and seller location are plausible checkout-time inputs, but their historical snapshot timing is not independently verifiable from these CSVs. Geography deserves additional scrutiny because the prior error analysis found a change in the SP customer-state late rate across time partitions.

## Feature-set comparison

All variants use the same train/validation dates and Logistic Regression setup. Thresholds are selected on validation by late-class F1, then recall, then precision. Because feature choice and threshold are both inspected on the same validation period, the table is exploratory and likely optimistic; it is not a new final evaluation.

| Feature set | Features | Validation threshold | Late precision | Late recall | Late F1 | Average precision | F1 change vs reference |
|---|---:|---:|---:|---:|---:|---:|---:|
| Reference feature set | 15 | 0.5049 | 0.1696 | 0.3001 | 0.2167 | 0.1240 | +0.0000 |
| Without ETA-derived promised lead | 14 | 0.4102 | 0.0934 | 0.3997 | 0.1514 | 0.0799 | -0.0653 |
| Without customer/seller geography | 13 | 0.2679 | 0.0670 | 0.8060 | 0.1237 | 0.0638 | -0.0930 |
| Conservative: without ETA lead or geography | 12 | 0.2519 | 0.0565 | 0.8034 | 0.1055 | 0.0555 | -0.1112 |

## Prediction-time assessment

| Feature group | Assessment |
|---|---|
| `order_purchase_timestamp_calendar_features` | Available by definition at purchase time. |
| `order_estimated_delivery_date_and_promised_lead_days` | High uncertainty for deployment: the CSV provides one final ETA value, not an ETA history/change log. Third-party data dictionaries describe it as the date shown at purchase, but the Kaggle source files do not let us verify that the exported value was not updated later. Exclude it for a conservative feature set until source provenance confirms timing. |
| `item_price_freight_product_category_dimensions` | Plausibly available during checkout/catalog selection, but the export has no feature capture timestamps; verify against the source system before live scoring. |
| `customer_state_and_seller_state` | Broad geography is plausibly known at purchase, but the test shows time-varying subgroup rates and a high miss rate in customer state SP. Avoid relying on coarse geography alone without drift monitoring and further validation. |
| `order_status_actual_delivery_review_carrier_delivery_payment_and_shipping_limit_fields` | Excluded because they are post-purchase/outcome-adjacent, labels, or their availability is not established at order purchase. |

## Recommendation

1. Treat the feature comparison as a diagnostic, not as a new model selection result. Do not overwrite or promote the existing artifact based on this validation-only comparison.
2. The no-ETA variant avoids the specific ETA-derived feature, but it still relies on other untimestamped order/catalog snapshots and is not proven deployment-safe. Its validation metrics were lower than the reference set, and this comparison is exploratory rather than a promotion decision.
3. Investigate temporal drift and coarse geographic dependence. The previous test review found customer-state SP late prevalence of 5.59% in train, 3.39% in validation, and 9.53% in test, while the selected model missed 633 of 643 SP late test orders. This reviewed period must not be reused to tune another model.
4. For another generalization estimate, obtain additional later-period data or define a new untouched holdout. The existing data ends in 2018, and the final 15% has already been reviewed; no fresh future Olist test period remains.
5. Keep the current model disconnected from React/Express. New point-in-time evidence or a validated later-time evaluation is needed before reconsidering operational integration.

The existing trained model artifact and Phase 1B report are unchanged. No React, Express, MongoDB, SAP AI Core, or SAP services were touched.
