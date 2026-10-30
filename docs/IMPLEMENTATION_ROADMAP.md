# SupplyShield SAP Implementation Roadmap

Phases are sequential. Complete and review each phase before starting the next. No phase after Phase 0 is authorized by this roadmap; the user must explicitly approve each review gate.

## Phase 0 — Existing project audit

**Status: COMPLETE.**

- Inspected source, manifests, deployment configuration, current tests, data models, API routes, and UI disclosures.
- Created `PROJECT_AUDIT.md`, `SAP_INTEGRATION_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`, and `INTEGRATION_STATUS.md`.
- No application code modified; no tests run.
- Key finding: no model artifact or prediction pipeline exists in the checkout; Phase 1 cannot truthfully reuse a model until it is located/provided.
- **Gate:** present audit and wait for explicit user approval before Phase 1.

## Phase 1 — SAP AI Core

**Objective:** serve the existing model through SAP AI Core while preserving local inference/fallback behavior and comparing outputs before any traffic switch.

**Prerequisites:** actual model and preprocessing code/artifact; feature schema/order and class mapping; fixed reference inputs/outputs; AI Core entitlement/service plan; service instance/key; repository and registry access; target-networking approach.

**Work after approval:** create model-serving app/container/templates and backend adapter; secure credentials; preserve entered risk fields separately; add deterministic comparison and failure tests; document live versus mock status.

**Gate:** phase report with tests and differences; wait for approval before Phase 2.

## Phase 2 — SAP HANA Cloud

**Objective:** introduce HANA as an enterprise data layer while preserving MongoDB until data ownership and any migration are explicitly approved.

**Prerequisites:** HANA tenant/instance, network path, role/schema privileges, record ownership decision, field mappings, and backup/test migration plan if migration is later requested.

**Work after approval:** design schema and SQL, add backend HANA data service/CRUD, store/retrieve approved AI Core history, test a small fixture, preserve existing data.

**Gate:** phase report with DB test evidence; wait for approval before Phase 3.

## Phase 3 — SAP Generative AI Hub

**Objective:** add a context-grounded assistant using retrieved SupplyShield records and advisory-only recommendations.

**Prerequisites:** Extended AI Core plan/Hub entitlement, service credentials, orchestration/model deployment, agreed access controls and history retention.

**Work after approval:** server-side assistant route and client states; retrieval grounding; conversation handling; mock and live checks; provenance and uncertainty labels.

**Gate:** phase report; wait for approval before Phase 4.

## Phase 4 — SAP IBP

**Objective:** map approved SupplyShield planning data into IBP through a controlled adapter.

**Prerequisites:** IBP tenant, planning area/key figures, approved data mapping, OData service and communication arrangement, required permissions, sandbox/read-only validation path.

**Work after approval:** implement mapping, synchronization controls, validation/logging, and mocks; live writes require explicit user approval.

**Gate:** phase report; wait for approval before Phase 5.

## Phase 5 — SAP Integration Suite

**Objective:** prepare real system integration flows/adapters for approved SAP and non-SAP endpoints.

**Prerequisites:** Integration Suite tenant and activated capabilities, actual external API contracts/endpoints, auth details configured securely, approved transformations and error ownership.

**Work after approval:** implement supported integrations, mocks, logging, retries, and validation. Do not invent endpoints.

**Gate:** phase report; wait for approval before Phase 6.

## Phase 6 — System integration and production review

**Objective:** assess full functionality, data integrity, all live connections, security, performance, responsive UI, monitoring, configuration, and deployment readiness.

**Deliverables:** `FINAL_ARCHITECTURE.md`, `DEPLOYMENT_GUIDE.md`, `USER_GUIDE.md`, `FINAL_REVIEW_REPORT.md`, production readiness checklist, blockers, deployment plan/rollback plan.

**Gate:** present final review and wait for explicit production deployment approval. No automatic production deployment.

## Order and current status

`Phase 0 audit → Phase 1 AI Core → Phase 2 HANA → Phase 3 Generative AI Hub → Phase 4 IBP → Phase 5 Integration Suite → Phase 6 final review`

Only Phase 0 is complete. Each later phase remains not started and is gated by explicit approval of the previous phase.
