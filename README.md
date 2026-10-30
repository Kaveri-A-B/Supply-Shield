# SupplyShield

SupplyShield is a React dashboard and Node/Express API for recording shipments, inventory, suppliers, returns, and alerts. MongoDB stores operational records. Sign-in is disabled: the dashboard opens directly, and all API operations are publicly accessible.

This project does not include a supply-chain dataset, CSV importer, trained prediction model, or live logistics integrations. Records added through the interface are persisted, but risk and supplier scores are entered values—not model predictions. Do not expose this app to the public internet or use it with sensitive operational data unless access controls are added.

## Run locally

Requirements: Node.js 20+, npm, and MongoDB running locally or in an authorized Atlas project.

1. Set `MONGODB_URI` in `.env` to your database connection string. MongoDB is optional for opening the dashboard, but required to load or save records.
2. Install dependencies and start the frontend/API:

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The Express API listens on port `4000` and reports when MongoDB is disconnected. Never commit `.env` or share its contents.

## Database-backed features

- MongoDB collections and validation for shipments, inventory items, suppliers, and alerts.
- Create, read, update, and delete operations for operational records (public; no sign-in).
- Persistent alert acknowledgement.
- Inventory coverage calculated from on-hand quantity divided by daily demand; zero demand is shown as unknown.
- Inventory records can be assigned one or more suppliers already stored in the workspace; the inventory table identifies assigned suppliers with at-risk or delayed shipments (including shipments with risk scores of 70+).
- Inventory items with an at-risk assigned supplier can switch that assignment to another existing supplier; demo workspace changes remain temporary.
- Return requests can be tracked per product and supplier with request/completion dates and a per-return day limit. Completion before the deadline is rated Best, on the deadline date Good, after the deadline Poor, and incomplete returns Pending; supplier return performance summarizes completed returns finished by the deadline.
- Dashboard summary metrics calculated from stored records.
- At-risk, delayed, or 70+ risk shipments can be switched to another supplier already recorded in the workspace; this does not change the shipment ETA or risk score.
- Workspace report export includes only the currently stored operational records and does not load an external dataset.
- When MongoDB is unavailable or has no records, the dashboard displays five clearly labeled synthetic demo records for shipments, inventory items, suppliers, and returns, plus sample alerts. Demo records are read-only and are never written to MongoDB.
- Sidebar navigation links directly to Overview, Shipments, Inventory, Suppliers, Returns, Alerts, What-if, Model & data, and Branding.
- API errors and unavailable database records are surfaced alongside a clearly labeled, read-only synthetic demo workspace.

## API

- `GET /api/health` — public server and database health.
- `GET /api/dashboard` — shipment and active-alert summary.
- `/api/shipments`, `/api/inventory`, `/api/suppliers`, `/api/returns`, `/api/alerts` — public collection endpoints.
- `POST`, `PATCH`, and `DELETE` collection operations are public. Do not expose the API to untrusted users.
- `PATCH /api/alerts/:id/acknowledge` — persist an alert acknowledgement.

## Build

```powershell
npm run build
```

## Deploy to Render

The repository includes a Render Blueprint in [`render.yaml`](./render.yaml). It intentionally leaves `MONGODB_URI` unset, so the public demo uses synthetic sample records and does not persist operational data. This prototype has no sign-in or API access control; do not configure a real database or use it with operational data unless access control is added first.

## Future data integration

No public dataset has been imported. The supplied path `C:\Users\Kaveri A B\Downloads\Amazon Sale Report.csv` was not present when checked, and an Amazon sales report is order data rather than a complete shipment/supplier/inventory history. Choose a verified public dataset with a compatible license and document its source before importing it. Keep customer or patient identifiers out of the dataset.

The longer-term requirements in [`spec.md`](./spec.md) describe CSV ingestion, ML training, and external data integrations; those capabilities are not part of this database-backed milestone. Gemini must never be used to calculate numeric disruption probabilities.
