# Setup guide

## Prerequisites

- Node.js 20 or later
- npm
- Optional: MongoDB instance for the API layer

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy the sample environment file and update values as needed:

```bash
copy .env.example .env
```

Minimum settings:

```env
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/supplyshield
API_WRITE_TOKEN=
AFTERSHIP_API_KEY=
AFTERSHIP_API_VERSION=2026-07
```

API reads work without a token. API create, update, and delete requests stay disabled until `API_WRITE_TOKEN` is set to a random secret of at least 32 bytes. Keep it in the server environment only; do not put it in browser code. The AI assistant answers locally from the loaded archive and needs no provider key or API token. Live carrier tracking requires `AFTERSHIP_API_KEY`; keep that provider key on the server.

The dashboard loads dataset records from `client/public/commerce_dataset.json`. Rebuild that sanitized browser dataset from the source archive with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/import_commerce_dataset.ps1 -ArchivePath "C:\path\to\archive.zip"
```

The supplied archive does not include shipment tracking numbers. Live tracking therefore requires entering a real tracking number on the Live Tracking page, along with a valid `API_WRITE_TOKEN` and server-side `AFTERSHIP_API_KEY`. AfterShip may provide carrier events and checkpoints; continuous GPS availability is not guaranteed.

Generate a token with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 3. Start the app locally

```bash
npm run dev
```

This starts the frontend and API together.

## 4. Production build

```bash
npm run build
```

## 5. Start the server without the Vite dev server

```bash
npm start
```

## 6. Verify the deployment health

Open:

- `http://localhost:5173` for the dashboard
- `http://localhost:4000/api/health` for the backend health route

## 7. Render deployment

- Configure the required environment variables in Render.
- Ensure `CLIENT_ORIGIN` matches the deployed frontend origin.
- Add `MONGODB_URI` if the database-backed API needs to run.
- Add `API_WRITE_TOKEN` as a server environment variable only if API write access is needed.
- Confirm source-data licensing before publicly hosting the dataset.
