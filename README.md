# SupplyShield

SupplyShield is a React dashboard and Node/Express API for recording shipments, inventory, suppliers, and alerts. MongoDB stores operational records. The dashboard is administrator-only: one administrator account is configured through environment variables, and its signed session is held in an HTTP-only cookie.

This project does not include a supply-chain dataset, CSV importer, trained prediction model, live logistics integrations, or production-ready multi-user account management. Records added through the interface are persisted, but risk and supplier scores are entered values—not model predictions. Do not use this prototype with patient information or other sensitive operational data.

## Run locally

Requirements: Node.js 20+, npm, and MongoDB running locally or in an authorized Atlas project.

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to your database connection string.
3. Set a random `AUTH_SECRET` of at least 32 characters, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` of at least 12 characters.
4. Install dependencies and start the frontend/API:

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The Express API runs on port `4000`. The administrator credentials configured in `.env` are used to sign in. Never commit `.env` or share its contents.

You can generate an authentication secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database-backed features

- MongoDB collections and validation for shipments, inventory items, suppliers, and alerts.
- Administrator sign-in with an HTTP-only, `SameSite=Strict` session cookie.
- Protected create, read, update, and delete operations for operational records.
- Persistent alert acknowledgement.
- Inventory coverage calculated from on-hand quantity divided by daily demand; zero demand is shown as unknown.
- Dashboard summary metrics calculated from stored records.
- API errors and unavailable database records are surfaced; there is no silent demo-data fallback.

## API

- `GET /api/health` — public server and database health.
- `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout` — administrator session.
- `GET /api/dashboard` — shipment and active-alert summary.
- `/api/shipments`, `/api/inventory`, `/api/suppliers`, `/api/alerts` — protected collection endpoints.
- `POST`, `PATCH`, and `DELETE` collection operations require an administrator session.
- `PATCH /api/alerts/:id/acknowledge` — persist an alert acknowledgement.

## Build

```powershell
npm run build
```

## Deploy to Render

The repository includes a Render Blueprint in [`render.yaml`](./render.yaml). Create or sync the Blueprint from the GitHub repository. Before the service can start, set the following secret environment variables in Render:

- `MONGODB_URI` — an authorized MongoDB Atlas connection string.
- `AUTH_SECRET` — a unique random value of at least 32 characters.
- `ADMIN_EMAIL` — the administrator sign-in email.
- `ADMIN_PASSWORD` — a unique password of at least 12 characters.

Enter secrets in Render's environment-variable settings, not in GitHub or chat. Configure Atlas Network Access and the database user with only the permissions the app needs. The Render service will fail to start if a required variable or MongoDB connection is missing.

## Future data integration

No public dataset has been imported. The supplied path `C:\Users\Kaveri A B\Downloads\Amazon Sale Report.csv` was not present when checked, and an Amazon sales report is order data rather than a complete shipment/supplier/inventory history. Choose a verified public dataset with a compatible license and document its source before importing it. Keep customer or patient identifiers out of the dataset.

The longer-term requirements in [`spec.md`](./spec.md) describe CSV ingestion, ML training, and external data integrations; those capabilities are not part of this database-backed milestone. Gemini must never be used to calculate numeric disruption probabilities.
