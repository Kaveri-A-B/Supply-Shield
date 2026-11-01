# API documentation

## Overview

The project includes an Express API at `/api` for operational data access. This API is optional and exists alongside the static dashboard. MongoDB connectivity is required for database-backed endpoints.

All create, update, and delete requests require `Authorization: Bearer <API_WRITE_TOKEN>`. Configure `API_WRITE_TOKEN` only on the server as a random secret of at least 32 bytes; never include it in browser code. If it is missing or too short, write requests return `503` and remain disabled. Read requests do not require a token.

The dataset assistant runs locally in the dashboard and does not send prompts or dataset records to an AI provider. Tracking requests use server-side provider credentials and require the API token. The API returns only a limited tracking summary and checkpoint list, including coordinates only when the carrier supplies valid values.

### `GET /api/integrations/status`

Returns whether AfterShip and API write authorization are configured. It does not expose credentials.

### `POST /api/tracking`

Creates an AfterShip tracking record. Accepts `{ "trackingNumber": "...", "carrier": "optional-aftership-slug" }` and requires the API Bearer token. Configure `AFTERSHIP_API_KEY` server-side.

### `GET /api/tracking/:id`

Refreshes an AfterShip tracking record by its provider ID. Requires the API Bearer token. Returned checkpoint data comes from the carrier; GPS coordinates may be unavailable.

## Base URL

- Local development: `http://localhost:4000/api`
- Production: deployed service URL + `/api`

## Health check

### `GET /api/health`

Returns the health status of the API and database connection.

Example response:

```json
{
  "status": "ok",
  "dataMode": "mongodb",
  "database": "connected"
}
```

## Dashboard summary

### `GET /api/dashboard`

Returns summary data used by the operations dashboard.

Includes:

- shipments
- alerts
- inventoryCount
- supplierCount
- updatedAt

## Shipment endpoints

### `GET /api/shipments`

Returns all shipment records sorted by most recent update.

### `POST /api/shipments`

Creates a shipment record. Requires the Bearer token described above.

Required fields:

- `id`
- `supplier`
- `route`
- `carrier`
- `initials`
- `tone`

### `PATCH /api/shipments/:id`

Updates an existing shipment. Requires the Bearer token described above.

### `DELETE /api/shipments/:id`

Deletes a shipment record. Requires the Bearer token described above.

## Inventory endpoints

### `GET /api/inventory`

Returns inventory records.

### `POST /api/inventory`

Creates an inventory item. Requires the Bearer token described above.

### `PATCH /api/inventory/:id`

Updates an inventory item. Requires the Bearer token described above.

### `DELETE /api/inventory/:id`

Deletes an inventory item. Requires the Bearer token described above.

## Supplier endpoints

### `GET /api/suppliers`

Returns supplier records.

### `POST /api/suppliers`

Creates a supplier record. Requires the Bearer token described above.

### `PATCH /api/suppliers/:id`

Updates a supplier record. Requires the Bearer token described above.

### `DELETE /api/suppliers/:id`

Deletes a supplier record. Requires the Bearer token described above.

## Return endpoints

### `GET /api/returns`

Returns return request records.

### `POST /api/returns`

Creates a return record. Requires the Bearer token described above.

### `PATCH /api/returns/:id`

Updates a return record. Requires the Bearer token described above.

### `DELETE /api/returns/:id`

Deletes a return record. Requires the Bearer token described above.

## Alert endpoints

### `GET /api/alerts`

Returns alert records.

### `POST /api/alerts`

Creates an alert record. Requires the Bearer token described above.

### `PATCH /api/alerts/:id`

Updates an alert record. Requires the Bearer token described above.

### `PATCH /api/alerts/:id/acknowledge`

Marks an alert as acknowledged or not acknowledged. Requires the Bearer token described above.

### `DELETE /api/alerts/:id`

Deletes an alert record. Requires the Bearer token described above.

## Error handling

The API returns JSON errors with a standard error message when validation fails or a resource is unavailable.

Examples:

- 400: validation failure
- 401: missing or invalid Bearer token for a write request
- 404: resource not found
- 409: duplicate identifier
- 503: MongoDB or data source unavailable, or writes disabled because `API_WRITE_TOKEN` is missing or too short
