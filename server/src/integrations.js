export class IntegrationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sanitizeTracking(tracking) {
  if (!tracking || typeof tracking !== 'object') {
    throw new IntegrationError(502, 'AfterShip returned an invalid tracking record.')
  }

  return {
    id: tracking.id,
    trackingNumber: tracking.tracking_number,
    carrier: tracking.slug,
    status: tracking.tag,
    statusDetail: tracking.subtag_message,
    updatedAt: tracking.updated_at,
    estimatedDelivery: tracking.aftership_estimated_delivery_date?.estimated_delivery_date
      ?? tracking.courier_estimated_delivery_date?.estimated_delivery_date
      ?? null,
    checkpoints: Array.isArray(tracking.checkpoints)
      ? tracking.checkpoints.slice(0, 30).map(checkpoint => ({
        time: checkpoint.checkpoint_time,
        location: checkpoint.location,
        message: checkpoint.message,
        status: checkpoint.tag,
        coordinates: Number.isFinite(checkpoint.coordinate?.latitude)
          && Number.isFinite(checkpoint.coordinate?.longitude)
          ? {
            latitude: checkpoint.coordinate.latitude,
            longitude: checkpoint.coordinate.longitude,
          }
          : null,
      }))
      : [],
  }
}

async function requestAfterShip({ apiKey, apiVersion, path, method, body }) {
  if (!apiKey) throw new IntegrationError(503, 'AfterShip is not configured on the server.')
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw new IntegrationError(503, 'AFTERSHIP_API_VERSION must use the YYYY-MM format.')
  }

  const response = await fetch(`https://api.aftership.com/tracking/${apiVersion}/trackings${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'as-api-key': apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    console.error(`AfterShip returned HTTP ${response.status}.`)
    throw new IntegrationError(502, 'AfterShip could not complete the tracking request. Check the provider configuration and try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new IntegrationError(502, 'AfterShip returned an unreadable response.')
  }

  if (!payload?.data) throw new IntegrationError(502, 'AfterShip returned no tracking data.')
  return sanitizeTracking(payload.data)
}

export function createAfterShipTracking({ apiKey, apiVersion, trackingNumber, carrier }) {
  const tracking = { tracking_number: trackingNumber }
  if (carrier) tracking.slug = carrier

  return requestAfterShip({
    apiKey,
    apiVersion,
    path: '',
    method: 'POST',
    body: { tracking },
  })
}

export function getAfterShipTracking({ apiKey, apiVersion, id }) {
  return requestAfterShip({
    apiKey,
    apiVersion,
    path: `/${encodeURIComponent(id)}`,
    method: 'GET',
  })
}
