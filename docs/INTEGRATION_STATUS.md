# SAP Integration Status

**Last reviewed:** 2026-10-30

| Component | Status | Evidence / blocker |
|---|---|---|
| Phase 0 project audit | COMPLETE | Repository, source, dependencies, routes, UI, tests, environment-variable names, and Render configuration inspected; four audit documents created |
| SAP AI Core | BLOCKED — SAP access and application feature contract required | A local Olist educational model pipeline/artifact and feature list exist, but the model is not deployed, its reviewed errors are too high for operational use, its ETA timing assumptions remain uncertain, and current SupplyShield shipment fields do not provide the model's 15 inputs. No AI Core service key, deployment URL, serving container/template, or SAP tenant configuration is present. |
| SAP HANA Cloud | PENDING CONFIGURATION | MongoDB is the only configured database; no HANA client, connection service, schema, or tenant configuration found |
| SAP Generative AI Hub | PENDING CONFIGURATION | No assistant/service integration found; AI Core Extended plan, Hub entitlement, credentials, and deployment not verified |
| SAP IBP | PENDING CONFIGURATION | No adapter or tenant configuration found; mapping and planning-area/key-figure contract not supplied |
| SAP Integration Suite | PENDING CONFIGURATION | No flow, API, endpoint, or tenant configuration found |

## Ground rules for status

- `CONNECTED` means a configured live tenant/service has passed a real connectivity check.
- `DISCONNECTED` means configured connectivity was checked and failed.
- `PENDING CONFIGURATION` means required access or configuration is absent/unverified.
- `MOCK MODE` means only a local stub/mock is active.
- `DEPLOYMENT FAILED` means the external deployment attempt returned a failure.
- A mock or a prepared template is never reported as a live SAP integration.

## Current verified state

- Frontend: React/TypeScript/Vite.
- Backend: Node.js/Express.
- Database: MongoDB/Mongoose.
- Local ML: an Olist late-delivery benchmark pipeline and ignored model artifact exist for non-commercial education. They are not connected to the application and are not suitable for operational predictions based on the documented error review.
- Application prediction system: none. Shipment risk numbers remain manually entered.
- Authentication: absent in current API/UI code; CRUD routes are publicly accessible.
- SAP integrations: none configured or detected. The local model artifact is not an SAP integration.
- Audit changes: documentation only. No application files changed and tests were not run.

## Phase 1 start review

The user has now requested SAP integration. SAP AI Core remains the first planned integration in the roadmap, but a live serving integration cannot be completed with the current project state. The local benchmark expects 15 Olist-derived features (including item counts, product aggregates, geographic categories, and ETA-derived lead time), while the app's Shipment record contains only supplier, free-text route, carrier, ETA, status, and a manually entered risk value. The benchmark's test results and point-in-time concerns are documented in `ML_TRAINING_REPORT.md`, `ML_ERROR_ANALYSIS.md`, and `ML_FEATURE_REVIEW.md`.

Required before a live AI Core endpoint can be connected:

1. SAP AI Core entitlement/service instance and a service key configured securely in the target environment. Required connection details include authentication URL, AI API URL, client ID/secret, and resource group; do not send the client secret in chat.
2. An approved model-serving container/template, model artifact uploaded to the chosen SAP artifact storage, and a running AI Core deployment URL.
3. A supported input contract and a decision on whether this low-performing non-commercial Olist model is being deployed strictly as a labeled educational demonstration. Do not map the current SupplyShield shipments to the Olist model as if their features were equivalent.

Until these are resolved, do not display model predictions as operational shipment risk or represent SAP AI Core as connected. SAP's current guidance requires a serving template based on KServe and a deployed serving endpoint; service-key authentication uses client credentials. See [SAP AI Core serving templates](https://help.sap.com/docs/sap-ai-core/predictive-ai-db13d59d17204c01b3b79c24fb82a19a/serving-templates?locale=en-US) and [SAP AI Core authentication](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/user-authentication-and-administration?version=CLOUD).

## Approval gates

Phase 1 may start only after the user explicitly approves Phase 0 and the model prerequisite is resolved or the user authorizes a separately scoped model-development plan. Phase 2, 3, 4, 5, and 6 each require explicit approval after the preceding phase review.
