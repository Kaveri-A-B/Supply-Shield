# SupplyShield Shipment Data Template

**Status:** Empty planning template. It contains no shipment records and does not authorize data collection.
**Purpose:** Define the minimum structure for a future, consented educational dataset that can answer: “At a specified checkpoint, will this shipment arrive later than the ETA known at that checkpoint?”

Before any real records are entered, obtain the data owner's approval and document the permitted purpose, retention period, access limits, and applicable privacy requirements. Use pseudonymous IDs. Do not put names, email addresses, phone numbers, street addresses, order numbers, or other direct identifiers in these files.

## Files

- [`shipment_snapshots_template.csv`](../ml/data/templates/shipment_snapshots_template.csv): one row per shipment at a defined prediction checkpoint. This is the candidate model input table.
- [`shipment_events_template.csv`](../ml/data/templates/shipment_events_template.csv): append-only event history, including ETA revisions and final delivery outcome. Outcome and later events must not be used as features for an earlier snapshot.

The CSV files contain headers only. Keep source records separate and unchanged if an authorized dataset is later supplied. Create a documented transformation into this template rather than editing source files in place.

## How to fill the snapshot template

| Column | Required? | Meaning and rule |
|---|---|---|
| `shipment_id` | Yes | Random or keyed pseudonymous shipment identifier. Same shipment uses the same ID in both files; never use the source system's customer-facing identifier. |
| `snapshot_id` | Yes | Unique ID for this prediction-time snapshot. A shipment can have multiple snapshots only if each is an explicitly defined checkpoint. |
| `prediction_checkpoint` | Yes | Agreed stage, such as `booking`, `dispatch`, or `in_transit`. Use a fixed vocabulary and do not mix checkpoints without recording them separately. |
| `as_of_time_utc` | Yes | Exact time the prediction would have been made, in ISO 8601 UTC format (for example `2026-01-15T14:30:00Z`). |
| `snapshot_recorded_at_utc` | Yes | Time this snapshot was captured by the source/export process. Must not be earlier than the source's known data state; preserve provenance if capture is delayed. |
| `promised_delivery_at_utc` | Yes | ETA in force at `as_of_time_utc`, not the final/revised ETA. It must match an ETA event in the event file. |
| `origin_region` | Optional | Coarse, non-identifying region code known at snapshot time; do not include a precise address. |
| `destination_region` | Optional | Coarse, non-identifying region code known at snapshot time; do not include a precise address. |
| `transport_mode` | Optional | Mode/service category known at snapshot time (for example, road, air, ocean, parcel). |
| `quantity_band` | Optional | Coarse quantity band known at snapshot time; define units and band boundaries in a separate data dictionary. |
| `weight_kg` | Optional | Shipment weight known at snapshot time. Leave blank if unavailable; record units consistently. |
| `value_band` | Optional | Coarse declared value band, only if approved and useful. Do not enter sensitive invoice details. |
| `supplier_id_pseudo` | Optional | Stable pseudonymous supplier key, if approved. Do not use a real supplier name. |
| `carrier_id_pseudo` | Optional | Stable pseudonymous carrier key, if approved. Do not use a real carrier name. |
| `planned_milestone_count` | Optional | Count of planned milestones known at the checkpoint. Do not include milestones added after the checkpoint. |
| `external_signal_summary` | Optional | A bounded categorical code for an approved external context feature. Prefer separate typed columns in a real schema; document its source and timing. Never paste personal data or unreviewed news text here. |
| `external_signal_published_at_utc` | Optional | Publication time of the external signal, if one is used. It must be no later than `as_of_time_utc`. |
| `external_signal_source` | Optional | Source name or source code for an approved external feature. |

Blank optional values mean “not available”; do not fill missing values using future information. Do not put the target or final outcome in this file.

## How to fill the event template

| Column | Required? | Meaning and rule |
|---|---|---|
| `shipment_id` | Yes | Pseudonymous key that matches `shipment_id` in the snapshot file. |
| `event_id` | Yes | Unique event identifier. |
| `event_type` | Yes | Controlled type such as `eta_set`, `eta_changed`, `booked`, `dispatched`, `in_transit`, `delivered`, `canceled`, or `returned`. |
| `event_time_utc` | Yes | When the event occurred, in ISO 8601 UTC format. |
| `recorded_at_utc` | Yes | When the source system recorded/received the event. Retain this separately from event time. |
| `eta_at_event_utc` | Conditional | Required for ETA set/change events; blank for other events. It preserves the exact promise revision at that point. |
| `actual_delivery_at_utc` | Conditional | Populate only for the final delivery event. This is outcome-only and must never be joined into an earlier model input. |
| `status_code` | Optional | Approved, documented status code. Do not include arbitrary free text that may contain personal or confidential information. |
| `exclusion_reason` | Optional | Use only for a final event that makes the shipment ineligible (for example `canceled`, `returned`, or `outcome_unresolved`). Keep the rules consistent and document any additions. |
| `source_system` | Yes | Source system or approved source code, without credentials or personal identifiers. |

Events are append-only in the analytical dataset. If a source corrects an event, preserve the original event and add a correction record or retain a source-provided audit trail; do not silently overwrite history.

## Target definition to approve before analysis

For an eligible shipment snapshot at time `T`:

- `late_delivery = 1` when the final actual delivery time is later than the ETA in force at `T`.
- `late_delivery = 0` when the final actual delivery time is at or before the ETA in force at `T`.
- Canceled, returned, and unresolved shipments are excluded under documented rules, not automatically labelled on-time.

If the intended business question is instead “late against the final revised ETA” or “at risk at dispatch,” define a separate label and checkpoint. Do not switch ETA definitions mid-analysis. The target should be derived from the event history during an approved analysis phase; it is intentionally absent from the snapshot template.

## Point-in-time and privacy checks

Before any future modeling, verify:

1. Every snapshot's values were available by `as_of_time_utc`; `recorded_at_utc` and source history support that claim.
2. The ETA in each snapshot matches the latest ETA event recorded no later than that checkpoint.
3. Actual delivery, later ETA revisions, post-checkpoint statuses, reviews, and final aggregates are excluded from predictors.
4. Duplicate snapshots and event IDs are resolved using a documented rule; all timestamps include timezone information.
5. The data owner has approved the use, the files contain no direct identifiers, and access/retention are documented.
6. A future test period is reserved before model selection. Rows for the same shipment remain together during splitting. The previously reviewed Olist test data is not reused.

## Current implementation status

This template is a design artifact only. No data has been collected into it; no model, API, React dashboard, Express backend, database schema, or SAP integration has been changed.
