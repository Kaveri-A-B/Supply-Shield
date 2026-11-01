# Security overview

## Current security posture

This project is a public-facing operational dashboard with a read-only dataset and no end-user accounts or authenticated sessions. The optional MongoDB API provides read endpoints without authentication; all API write endpoints require a server-only Bearer token.

## Implemented controls

- CORS is restricted to configured frontend origins.
- Express security headers are enabled via Helmet.
- Rate limiting is enabled for API routes to reduce abuse and brute-force pressure.
- API write endpoints require `API_WRITE_TOKEN`, a random server-side secret of at least 32 bytes. Writes are disabled when it is missing or too short.
- AfterShip credentials are read from server environment variables and are never returned by the integration-status endpoint. Dataset assistant answers are computed in the browser without sending questions or records to an AI provider.
- Request validation ensures schema fields and value constraints are enforced.
- Sensitive configuration is kept in environment variables and excluded from source control.
- Internal server errors are not exposed through the API response flow.

## Data handling expectations

- The supplied dashboard dataset is treated as public operational data only.
- No API keys, tokens, or private credentials are intentionally embedded in the client bundle.
- MongoDB credentials must be stored in environment variables and never checked into version control.
- Production deployment should set `CLIENT_ORIGIN`, `PORT`, and `MONGODB_URI` explicitly. Set `API_WRITE_TOKEN` only if API write access is needed.

## Remaining risks and recommendations

- The project does not include end-user authentication or role-based authorization. The API token grants write access to every write endpoint and should be handled as an administrative secret.
- Tracking actions require the API token. Provider keys must remain server-side; never expose them in Vite environment variables or client bundles.
- Read endpoints remain public. Do not store confidential business data in the connected database unless read access is protected by a future authentication layer.
- Additional monitoring, log redaction, and dependency review should be included in long-term operations.

## Operational guidance

- Rotate any database credentials if they are shared outside the local environment.
- Keep `NODE_ENV` set to `production` in the hosted environment.
- Review Render environment variables before every deployment.
- Re-test the app after dependency updates and before public release.
