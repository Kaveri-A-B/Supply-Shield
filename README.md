# SupplyShield

SupplyShield is a dark-navy, dataset-backed commerce operations dashboard. It uses the supplied `archive.zip` to show transactions, products, stock, supplier costs and reliability, returns, historical prices, marketing performance, and privacy-safe customer aggregates. The Shipments page summarizes transaction rows that include shipping costs; the archive has no shipment IDs or delivery events. Live carrier tracking is separate and requires a real tracking number and a configured AfterShip account.

## Problem statement

Commerce operators need one place to review sales, inventory, supplier reliability, returns, pricing, and marketing performance. SupplyShield turns the supplied commerce archive into a searchable dashboard with source-based metrics and exports.

## Proposed solution

SupplyShield surfaces the supplied commerce data in an operational dashboard format that allows teams to:

- review and filter 100,000 transaction records,
- inspect products, inventory thresholds, supplier reliability, and costs,
- review returns, price history, and marketing performance,
- inspect privacy-safe aggregated customer segments,
- export source-derived reports with monetary values converted to Indian rupees,
- optionally query real carrier checkpoints through AfterShip.

## Key features

- Read-only commerce dashboard built from the supplied archive.
- Searchable transaction, product, inventory, supplier, return, price-history, and marketing views.
- INR display and INR monetary exports using the latest published USD/INR reference rate, with an explicit ₹94.86 fallback.
- Privacy-safe customer aggregates; direct personal and transaction identifiers are excluded from the browser dataset.
- Dataset validation during import.
- Real carrier tracking lookup for user-provided tracking numbers when AfterShip is configured.
- Optional Express API with MongoDB-backed models for operational records.
- Static front-end build for deployment-friendly hosting.

## Technology stack

- Frontend: React + TypeScript + Vite
- Styling: custom CSS and existing design system
- Backend: Node.js + Express
- Data layer: MongoDB via Mongoose when configured
- Deployment: Render
- Validation: Node test runner and TypeScript build checks

## System architecture

The repository currently contains two complementary layers:

1. A client-side dashboard that reads the sanitized commerce dataset JSON and renders the workspace.
2. A lightweight Express API that exposes optional operational endpoints and server-side AI/AfterShip integrations.

The source dataset views are intentionally read-only. Scenario figures are illustrative calculations from source values, and missing shipment/tracking records are never fabricated.

## Implemented vs planned functionality

Implemented:

- Dataset-backed commerce overview and searchable source tables
- INR-converted financial summaries and CSV exports
- Privacy-filtered dataset import and validation
- Rule-based stock/supplier alerts and illustrative what-if calculations
- Optional AfterShip tracking for real user-provided tracking numbers
- MongoDB-backed API layer and schema validation

Planned or environment-dependent:

- Live database-backed operational workflows
- Full SAP or ERP data integration
- User authentication and role-based access control
- Production analytics tracking and advanced monitoring

## Installation

Requirements:

- Node.js 20+
- npm

```bash
npm install
```

## Environment configuration

Create a local environment file based on the template:

```bash
copy .env.example .env
```

The project supports the following environment settings:

- `NODE_ENV`: application environment (`development` or `production`)
- `PORT`: HTTP port for the Express server (default: `4000`)
- `CLIENT_ORIGIN`: allowed frontend origin for CORS
- `MONGODB_URI`: MongoDB connection string for the API layer
- `API_WRITE_TOKEN`: server-only token for API create, update, and delete requests; use a random value of at least 32 bytes. Writes remain disabled when it is missing or too short.
- `AFTERSHIP_API_KEY`: optional server-only AfterShip key for carrier tracking
- `AFTERSHIP_API_VERSION`: AfterShip Tracking API version (defaults to `2026-07`)

The Shipments page shows source transaction dates, product, category, market, quantity, shipping cost, channel, payment method, revenue, and transaction status. Its estimated shipped date adds the recorded supplier lead time (primary supplier first, otherwise inventory lead time) to the transaction date; it is an estimate, not an actual carrier dispatch date. Transaction statuses are not delivery statuses. The Live Tracking page shows market-level order activity and accepts a real tracking number and optional carrier slug; carrier lookup requires both a valid `API_WRITE_TOKEN` and `AFTERSHIP_API_KEY`.

Generate a suitable token with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep the generated value in the server's environment settings only; do not add it to client code or commit it.

## Run the application

### Local development

```bash
npm run dev
```

This starts the API and frontend together. The frontend is usually served at `http://localhost:5173`.

### Production build

```bash
npm run build
```

### Server start

```bash
npm start
```

## Data and source notes

The dashboard uses `client/public/commerce_dataset.json`, generated from the supplied `archive.zip`. Before public deployment, confirm that the source dataset can be redistributed. The import script excludes direct customer names, email addresses, customer/transaction/return IDs from browser data and retains customer information only as grouped aggregates.

## Regenerate dataset output

```bash
powershell -ExecutionPolicy Bypass -File scripts/import_commerce_dataset.ps1 -ArchivePath "C:\path\to\archive.zip"
```

The importer validates source columns and writes the privacy-filtered tables used by the dashboard. The source archive includes transactions, products, inventory, supplier costs, returns, price history, marketing spend, and customers. It does not contain shipment routes or carrier tracking numbers.

Displayed monetary values and monetary CSV exports are converted from the archive's USD values to INR using the latest published USD/INR reference rate from Frankfurter. If the exchange-rate service is unavailable, the UI clearly reports that it uses ₹94.86 per USD.

## Future enhancements

- Add authenticated admin workflows for operational updates
- Expand integration coverage for SAP and ERP data sources
- Add real-time alerting and notification pipelines
- Improve deployment observability with structured logs and monitoring
- Expand automation around validation and data-quality checks

## Project documentation

See the following files for deeper operational detail:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
- [TERMS_AND_CONDITIONS.md](./TERMS_AND_CONDITIONS.md)
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- [SETUP_GUIDE.md](./SETUP_GUIDE.md)

## Deployment note

The Render blueprint in [render.yaml](./render.yaml) configures separate deploy targets. Public hosting should only proceed after confirming that the underlying dataset can be redistributed and that production environment variables are set appropriately.
