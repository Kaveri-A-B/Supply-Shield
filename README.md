# SupplyShield

SupplyShield is a read-only dashboard for the supplied Global Supply Chain Risk 2026 CSV. It presents recorded shipment attributes and historical disruption labels; it does not generate live alerts, machine-learning predictions, or recommended actions. Inventory, supplier identities, and return records are not present in the file and are shown as unavailable rather than filled with demo values.

The dashboard dataset has 5,000 shipments dated January 2024 through December 2025. It contains shipment IDs, date, origin and destination ports, transport mode, product category, distance, weight, fuel price index, geopolitical risk, weather, carrier reliability score, lead time, and a disruption flag. The disruption rate and monthly/mode summaries describe these rows only.

## Dataset source and license

The CSV was supplied from a local file named `global_supply_chain_risk_2026.csv`. No external publisher, source page, or license information was provided with it. Confirm the right to redistribute and publicly host the source-derived dashboard data before deploying it publicly. The exporter omits fields outside the dashboard schema; it does not establish redistribution permission.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The dashboard reads `client/public/global_supply_chain_risk_2026.json` and does not require MongoDB or sign-in.

## Regenerate the dashboard data

Pass the path to the source CSV as the first argument:

```powershell
node ml/scripts/export_supply_chain_risk.mjs "C:\path\to\global_supply_chain_risk_2026.csv"
```

The exporter validates the expected columns, dates, numeric ranges, binary disruption labels, and unique shipment IDs before writing `client/public/global_supply_chain_risk_2026.json`. It retains only the dashboard fields and the source filename, not the source file's full path.

## Separate Render deployments

The Render Blueprint in [`render.yaml`](./render.yaml) defines two independent web services:

- `supplyshield` builds from `feature/sap-integration` and serves the CSV dashboard.
- `supplyshield-samples` builds from `main` and serves the earlier sample-data app.

Both use the same build and start commands, but each service deploys from its own branch. Sync the Blueprint in Render to create or update both services. Public deployment of the CSV dashboard should wait until the CSV's redistribution rights are confirmed.

## Build

```powershell
npm run build
```
