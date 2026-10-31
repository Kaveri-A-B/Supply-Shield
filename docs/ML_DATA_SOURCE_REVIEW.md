# SupplyShield ML Data-Source Review

**Status:** Research and recommendation only. No dataset was downloaded, no model was trained, and no application code was changed.
**Purpose:** Find a defensible next source for evaluating a future-facing late-delivery or supply-chain disruption model, given the limitations found in the Olist benchmark.
**Reviewed:** 30 October 2026.

## Recommendation

Keep Olist as the completed, non-commercial educational benchmark and keep its trained model disconnected. Do not present its scores as SupplyShield performance. The already-reviewed Olist test period is consumed for model review and must not be reused to tune or select another model. Its latest records end in 2018, and its exported ETA and several candidate predictors have no verifiable as-of history in the CSVs.

There is no reviewed public source here that simultaneously establishes (a) a relevant shipment outcome, (b) what predictors were known at each prediction time, (c) enough later data for a genuinely new temporal test, and (d) clear rights for the intended use. For the next substantive benchmark, prioritize a small, consented and de-identified set of operational shipment snapshots with a written data-use basis and append-only timestamped ETA/status history. This is a recommendation for a later approved data-collection phase, not a request to collect or connect data now.

For learning while that is being arranged:

1. **LaDe** is the strongest follow-up candidate for a narrowly scoped last-mile timing exercise because the dataset documents task events such as acceptance and delivery. Its delivery-time task is not automatically the same as “later than the promised ETA”; confirm the time-requirement fields and the download terms first. The Hugging Face card shows Apache-2.0 metadata, while the dataset README says research use and links to separate terms, so check those terms directly before any use beyond research.
2. **SCMS Delivery History** is more relevant to healthcare commodity shipment operations and has a late-shipment teaching example, but its current authoritative source/license and point-in-time feature history were not verified. Hold it pending rights and provenance review.
3. **SynDelay** can be considered as a synthetic pipeline exercise, not evidence of real-world performance. Its publisher describes it as synthetic and “as-is” for informational/research purposes; the reviewed pages do not establish a clear standard dataset license or feature availability at prediction time.
4. Do not replace Olist with DataCo merely because its description uses broader supply-chain language. The Mendeley page establishes the dataset description and CC BY 4.0 license, but does not establish that the tabular predictors are historical snapshots known at scoring time. Its target/feature semantics and timing still require a field-level audit.

The newly listed **Supply Chain Disruption Monitoring Dataset** is a separate kind of resource: its repository describes an agentic news-monitoring evaluation, including a benchmark of 1,117 articles, rather than a row-per-shipment dataset with a prospective delay outcome. It may inform a later disruption-news extraction feature, but it is not a substitute for a shipment-delay training set. The repository’s code/data license is CC BY-NC 4.0, which must also be considered for any reuse.

## Why this review is needed

The current benchmark predicts one narrow outcome: whether a completed Olist e-commerce order arrived after its estimated customer-delivery date. Phase 1B produced weak results, and the feature review found that the export contains one ETA value without an ETA change history. The previous test review also found a large change in late-delivery prevalence for customer-state SP across time partitions. These observations justify a new data-source and prediction-time review; they do not establish a cause or justify another tuning pass on the consumed test period. See [`DATASET_ANALYSIS.md`](DATASET_ANALYSIS.md), [`ML_TRAINING_REPORT.md`](ML_TRAINING_REPORT.md), [`ML_ERROR_ANALYSIS.md`](ML_ERROR_ANALYSIS.md), and [`ML_FEATURE_REVIEW.md`](ML_FEATURE_REVIEW.md).

The application remains a React dashboard with a Node.js/Express API and MongoDB data model, per the current [`ML_IMPLEMENTATION_PLAN.md`](ML_IMPLEMENTATION_PLAN.md) and [`spec.md`](../spec.md). This review does not change that architecture. It also does not change the present status: no inference service or model-backed dashboard is implemented.

## Candidate comparison

| Source | What it can support | Point-in-time / label evidence | Rights and practical limitations | Decision |
|---|---|---|---|---|
| **Olist Brazilian E-Commerce** | Historical order lateness benchmark: actual customer delivery compared with estimated delivery, for eligible completed orders. | The CSV has outcome timestamps and a single estimated date, but no ETA revision log. Other exported catalog/order values have no capture timestamps. The Olist source ends in 2018; its final temporal test period was already reviewed. | CC BY-NC-SA 4.0, already approved for non-commercial educational work. Not a general port, weather, geopolitical, or supplier disruption label. | Retain only as a completed educational benchmark. Do not tune on its reviewed test segment or connect its model to the dashboard. |
| **LaDe / Cainiao-AI LaDe** | Real last-mile package operations; delivery/pickup data and task-event data can support delivery-time or last-mile workflow exercises. The dataset card describes millions of packages over six months and event fields such as task acceptance and task finish. | Event timestamps offer more temporal structure than Olist’s static order export. The card does not, by itself, prove an ETA snapshot at a defined scoring time or a late-versus-promised label equivalent to our target. Schema, city variations, and label definition need inspection before selection. | Hugging Face metadata displays Apache-2.0. The README says the data can be used for research and links to terms; those terms need reading before download/use, especially if a broader use is contemplated. Large, China-specific last-mile data also differs from SupplyShield’s generic shipment examples. | Best candidate for a separate, bounded last-mile timing study after terms and schema are verified. Not yet approved as the next benchmark. |
| **SCMS Delivery History / PEPFAR health commodities** | Potentially closer operational domain: public documentation describes a late-shipment prediction example based on a shipment-history dataset, tied to health-commodity supply chains. | The tutorial establishes a late-shipment framing and names a downloadable sample. It does not establish that every predictor is available at a reproducible prediction checkpoint or that the current mirrored file retains the original semantics. | The historical USAID portal source is reported offline by a secondary data notice; exact current redistribution/reuse terms were not independently established. Do not download/reuse until the authoritative rights basis is confirmed. | Promising domain fit, blocked on authoritative source, license, schema, and timing audit. |
| **SynDelay** | Synthetic delivery-delay classification and reproducible educational comparison; the paper presents it as a synthetic dataset generated from real-world data. | It provides a delay outcome, but inspected public descriptions do not prove features are historical snapshots as-of a real operational scoring time. Synthetic patterns are not a substitute for external validation. | Hub says “as-is” for informational/research purposes. No clear standard data license was verified in the reviewed materials. A permissive source-code license, if any, would not automatically grant rights to the dataset. | Optional synthetic exercise only after dataset rights are clarified. Never use it to claim real-world SupplyShield accuracy. |
| **DataCo SMART Supply Chain, Version 5** | Broad provisioning, production, sales, and commercial distribution description; structured CSV and variable dictionary. | Version page and description do not certify the capture time of inputs or a live prediction point. Existing project review already treats target semantics and possible leakage as unresolved; an independent field audit would still be required. | Mendeley lists CC BY 4.0. The release contains the structured file, variable description, and tokenized access logs; assess each file and its permitted use separately. | Keep as an unselected alternative. Broader wording alone is not enough to make it a better disruption benchmark. |
| **Supply Chain Disruption Monitoring repository benchmark** | Disruption article extraction and agent-evaluation scenarios/ground truth; its README describes a 1,117-article benchmark. | This is not a shipment row with a future delivery outcome and timestamped operational feature snapshot. It evaluates a different task (monitor/classify/trace disruption information). | Repository LICENSE states CC BY-NC 4.0. This restricts commercial use of those repository materials; evaluate whether its content fits an educational NLP task only. | Not suitable for shipment late-delivery model training. Could be reviewed separately if SupplyShield later adds disruption-news monitoring. |

## Evidence and careful interpretation

### LaDe

The dataset card describes LaDe as a real-world last-mile dataset with package information and event records, and points to separate delivery and pickup sub-datasets. The dataset repository metadata shows Apache-2.0, while its README explicitly says research use and points to terms. The public Hugging Face viewer currently reports a schema-generation failure because city CSVs do not all have the same columns. That is an additional practical issue: load and audit city files independently rather than assuming a single uniform table. Sources: [LaDe dataset card](https://huggingface.co/datasets/Cainiao-AI/LaDe), [LaDe README and terms pointer](https://huggingface.co/datasets/Cainiao-AI/LaDe/blob/main/README.md), and the [LaDe paper](https://arxiv.org/abs/2306.10675).

LaDe should be considered only for a task matched to its actual timestamps and time requirements. An event like task acceptance can define a scoring point, and a later task-finish event can define an outcome; a “late” label still requires a documented promised-time field that existed at that scoring point. Do not infer that merely from a delivery duration field.

### SCMS / PEPFAR shipment history

DataRobot’s public tutorial names `SCMS_Delivery_History_Dataset.csv` as its sample training data and frames the task as predicting late shipments. USAID material describes SCMS as a health-commodity supply program. However, the old USAID open-data source is not currently available at the original portal according to a secondary notice, and that notice says current redistribution/reuse terms were not independently verified. Therefore this source is not cleared for download or use based solely on the tutorial or third-party mirrors. Sources: [DataRobot late-shipment example](https://docs.datarobot.com/latest/en/docs/get-started/how-to/biz-accelerators/late-ship.html), [USAID SCMS program guide](https://www.usaid.gov/sites/default/files/2022-05/2015-Complete-Users-Guide.pdf), and the [secondary availability/rights notice](https://github.com/bobaoxu2001/solar-logistics-control-tower/blob/master/DATA_NOTICE.md).

### SynDelay and the new disruption-monitoring listing

The SynDelay paper and dataset page both describe a synthetic delivery-delay dataset; the hub labels its content as-is and for informational/research purposes. Treat that as a limitation statement, not a complete license grant. Sources: [SynDelay paper](https://arxiv.org/abs/2509.05325), [SynDelay dataset page](https://supplychaindatahub.org/datasets/syndelay/), and [SynDelay repository](https://github.com/lx249/syndelay).

The Supply Chain Data Hub describes the separate disruption-monitoring listing as monitoring/detecting/analyzing disruption events. The linked repository’s README describes an agentic AI thesis project and a benchmark of 1,117 articles; the repository LICENSE names CC BY-NC 4.0. Those facts make it relevant to a different news-to-structured-signal task, not direct prediction of delivery lateness from shipment-time features. Sources: [Hub dataset list](https://supplychaindatahub.org/datasets/), [repository README](https://github.com/sara-almahri/supply-chain-disruption-monitoring/blob/main/README.md), and [repository license](https://github.com/sara-almahri/supply-chain-disruption-monitoring/blob/main/LICENSE).

### DataCo

The original Mendeley version 5 page describes provisioning, production, sales, and commercial distribution; lists a structured dataset, variable description file, and access logs; and displays CC BY 4.0. Those are useful provenance facts, but do not establish feature availability at a defined prediction time. A separate column-by-column review would be required before using it. Source: [Mendeley Data, DataCo version 5](https://data.mendeley.com/datasets/8gx2fvg2k6/5).

## Recommended future data specification

For credible forward-looking evaluation, collect a minimal de-identified snapshot/event dataset under documented permission. Define one prediction checkpoint before collection (for example: purchase confirmation, shipment booking, or dispatch). Do not mix checkpoints in one label without explicitly modeling them separately.

### Required event and snapshot fields

| Field | Why it is needed |
|---|---|
| Pseudonymous shipment/order key and stable grouping key | Join event history to an outcome while grouping related rows during splitting; exclude direct personal identifiers. |
| `event_time` and `recorded_at` (with timezone) | Distinguish when something happened from when the system learned it; reproduce what was known at scoring time. |
| Prediction checkpoint and snapshot ID | Make the moment of each prediction explicit and reproducible. |
| Planned/estimated delivery timestamp as captured at each checkpoint, with revision history | Define the promise in force at prediction time and avoid replacing it with a later revised ETA. |
| Actual delivery/completion timestamp and final status | Derive the eventual outcome; keep these outcome-only fields out of predictors. |
| Shipment mode/service, planned route/lane or coarse origin/destination, quantity/weight/value bands, planned milestones | Candidate operational inputs if present and confirmed available at the checkpoint. Keep personal or sensitive data out. |
| Supplier/carrier identifiers as pseudonyms and prior-history features | Permit historical patterns without using raw identifiers as memorization shortcuts; each historical aggregate must use earlier shipments only. |
| External signal value, source, published/event time, retrieved time, geography/scope | Support optional weather, port, traffic, or disruption context without accidentally using information published after scoring. |
| Cancellation, return, unresolved, and censoring flags with documented reason | Define inclusion/exclusion consistently and avoid mislabeling incomplete shipments as on-time. |
| Dataset owner, permission/license basis, permitted purpose, retention window, and provenance | Establish lawful/approved use and allow future reviewers to understand the source. |

### Label and validation rules

1. Select and document one target: for example, late against the ETA snapshot in force at checkpoint `T`, where completion occurs after that ETA. Keep delivery-delay classification distinct from external disruption-event classification.
2. Create features by an as-of join: only values whose `recorded_at <= T` may be used. Exclude outcomes, actual delivery fields, later ETA revisions, post-checkpoint status, reviews, and aggregates that include future shipments.
3. Exclude canceled, returned, and unresolved orders according to prewritten rules; report their counts and reasons rather than silently dropping them.
4. Split by time, and group repeated shipments/rows so one shipment cannot cross partitions. Freeze a future test period before feature/model selection. Do not reuse the already reviewed Olist test period.
5. Report prevalence, precision/recall, PR-AUC/average precision, calibration, confusion counts, subgroup performance, and data coverage. Compare with a simple baseline. Do not describe an offline score as operational performance.
6. Keep the model disconnected from React/Express until a separate approved integration phase validates input mapping and operational usefulness.

## Beginner-friendly next steps

1. **Choose the task first.** Is the learning goal shipment late prediction, last-mile delivery time, or identifying disruption events in reports? These need different data and labels.
2. **Check rights before download.** Save a source, version, license/terms link, retrieval date, and intended-use note.
3. **Inspect the schema and timing.** For every candidate column, answer: “Would we know this at the moment we want to predict?” If unknown, mark it unknown and do not use it until verified.
4. **Write the label rule.** Define the planned promise, actual outcome, eligible records, and exclusions before looking at model scores.
5. **Reserve future data.** Keep the newest time period untouched until every feature and decision is fixed.
6. **Only then request approval for another training phase.** No data-source choice in this review starts training or application integration.

## Source links

- [Olist dataset source and license](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
- [LaDe dataset card](https://huggingface.co/datasets/Cainiao-AI/LaDe)
- [LaDe README / usage note](https://huggingface.co/datasets/Cainiao-AI/LaDe/blob/main/README.md)
- [LaDe paper](https://arxiv.org/abs/2306.10675)
- [SCMS late-shipment tutorial and sample-data reference](https://docs.datarobot.com/latest/en/docs/get-started/how-to/biz-accelerators/late-ship.html)
- [USAID SCMS program guide](https://www.usaid.gov/sites/default/files/2022-05/2015-Complete-Users-Guide.pdf)
- [SCMS source availability / rights notice (secondary)](https://github.com/bobaoxu2001/solar-logistics-control-tower/blob/master/DATA_NOTICE.md)
- [SynDelay paper](https://arxiv.org/abs/2509.05325)
- [SynDelay page](https://supplychaindatahub.org/datasets/syndelay/)
- [SynDelay repository](https://github.com/lx249/syndelay)
- [DataCo Mendeley version 5](https://data.mendeley.com/datasets/8gx2fvg2k6/5)
- [Supply Chain Data Hub dataset list](https://supplychaindatahub.org/datasets/)
- [Disruption-monitoring project README](https://github.com/sara-almahri/supply-chain-disruption-monitoring/blob/main/README.md)
- [Disruption-monitoring project license](https://github.com/sara-almahri/supply-chain-disruption-monitoring/blob/main/LICENSE)
