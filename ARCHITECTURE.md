# Architecture overview

## Purpose

SupplyShield is a commerce operations dashboard backed by the supplied archive data. The workspace does not invent shipment, inventory, supplier, or return records when a source table is unavailable.

## System components

### Frontend

- React + TypeScript renders the dark-navy dashboard.
- Vite serves the app locally and builds the production bundle.
- The client validates and loads `client/public/commerce_dataset.json`.
- Monetary values from the USD source archive are converted to INR using a published USD/INR rate, with a visible ₹94.86 fallback.

### Dataset import

- `scripts/import_commerce_dataset.ps1` reads the supplied ZIP archive.
- It exports transactions, products, inventory, supplier costs, returns, price history, and marketing records.
- Direct customer names, email addresses, customer IDs, transaction IDs, and return IDs are excluded from the client dataset.
- Customer information is retained only as grouped counts.

### Backend API

- Express provides optional MongoDB-backed operational APIs and server-side AI/AfterShip integrations.
- Secrets remain in server environment variables; a valid API write token is required for protected requests.
- Live carrier events require a real tracking number supplied by the user and a configured AfterShip API key.

## Runtime flow

1. The client loads and validates the sanitized commerce JSON.
2. The workspace calculates summaries and renders source-table-backed pages.
3. Monetary UI values and exports convert source USD values to INR.
4. Tracking requests use an actual user-entered tracking number; no shipment rows are generated from commerce transactions.

## Security and source boundaries

- Customer direct identifiers are not included in the browser dataset.
- Provider keys are stored server-side and never sent to the client.
- The commerce archive does not contain shipment routes, tracking numbers, GPS events, or carrier checkpoints.
- Confirm dataset redistribution rights before public deployment.
