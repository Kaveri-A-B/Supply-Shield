# SupplyShield

SupplyShield is a responsive supply-chain risk dashboard based on the requirements in [`spec.md`](./spec.md). This first runnable project slice provides the React dashboard, a small Express API, interactive alert acknowledgement, and a browser-based logo studio. All displayed operational records are **synthetic demo data**; they are not connected to a real supply chain and do not establish model performance.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The Express API runs on `http://localhost:4000`. The client falls back to its labeled seed data if the API is unavailable.

Optional configuration: copy `.env.example` to `.env` and set `PORT`, `CLIENT_ORIGIN`, and `MONGODB_URI`. The current demo API continues to serve synthetic records; connecting MongoDB alone does not make the demo records persistent.

## What's included

- Overview with operational metrics, risk trend, active alerts, shipment activity, and inventory watchlist.
- Shipment, inventory, supplier, alert, what-if, model/data, and branding navigation.
- Search/filter affordances, responsive mobile navigation, alert acknowledgement, and clear synthetic-data indicators.
- Custom SupplyShield shield-and-route mark used as the app favicon and sidebar logo.
- Branding page to customize brand text/color and download generated SVG or PNG in-browser without server file writes.
- Express endpoints: `GET /api/health`, `GET /api/dashboard`, `GET /api/shipments`, and `POST /api/alerts/:alertId/acknowledge`.

## Build

```powershell
npm run build
```

## Deploy to Render

The repository includes a Render Blueprint in [`render.yaml`](./render.yaml). Connect the repository to Render and create a Blueprint Instance; Render will build the client and run the Express server, which serves both the app and API from one service. The default configuration uses synthetic demo data and does not require MongoDB.

The app's acknowledgement state is held in server memory and resets when the service restarts. Do not treat this demo deployment as a production system for real supply-chain data.

## Production data and ML

The UI prototype does not yet implement CSV ingestion, persistent MongoDB domain models, authentication, Python training/inference, live provider integrations, or Gemini recommendations. These remain implementation work from the contract in [`spec.md`](./spec.md). Gemini must never be used to calculate numeric disruption probabilities.
