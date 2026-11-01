import assert from 'node:assert/strict'
import test from 'node:test'
import { createAfterShipTracking, getAfterShipTracking, IntegrationError } from '../src/integrations.js'

test('AfterShip tracking requests return only the fields needed by the dashboard', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl
  let requestOptions

  globalThis.fetch = async (url, options) => {
    requestUrl = url
    requestOptions = options
    return Response.json({
      data: {
        id: 'tracking-12345678',
        tracking_number: 'ZX-1234',
        slug: 'fedex',
        tag: 'InTransit',
        subtag_message: 'Package is moving',
        updated_at: '2026-11-01T10:00:00Z',
        aftership_estimated_delivery_date: { estimated_delivery_date: '2026-11-04' },
        checkpoints: [{
          checkpoint_time: '2026-11-01T10:00:00Z',
          location: 'Chicago, US',
          message: 'Departed facility',
          tag: 'InTransit',
          coordinate: { latitude: 41.8781, longitude: -87.6298 },
        }],
        customer_email: 'private@example.test',
      },
    })
  }

  try {
    const tracking = await createAfterShipTracking({
      apiKey: 'aftership-server-secret',
      apiVersion: '2026-07',
      trackingNumber: 'ZX-1234',
      carrier: 'fedex',
    })
    assert.equal(requestUrl, 'https://api.aftership.com/tracking/2026-07/trackings')
    assert.equal(requestOptions.headers['as-api-key'], 'aftership-server-secret')
    assert.deepEqual(JSON.parse(requestOptions.body), {
      tracking: { tracking_number: 'ZX-1234', slug: 'fedex' },
    })
    assert.deepEqual(tracking, {
      id: 'tracking-12345678',
      trackingNumber: 'ZX-1234',
      carrier: 'fedex',
      status: 'InTransit',
      statusDetail: 'Package is moving',
      updatedAt: '2026-11-01T10:00:00Z',
      estimatedDelivery: '2026-11-04',
      checkpoints: [{
        time: '2026-11-01T10:00:00Z',
        location: 'Chicago, US',
        message: 'Departed facility',
        status: 'InTransit',
        coordinates: { latitude: 41.8781, longitude: -87.6298 },
      }],
    })

    await getAfterShipTracking({
      apiKey: 'aftership-server-secret',
      apiVersion: '2026-07',
      id: 'tracking/12345678',
    })
    assert.equal(requestUrl, 'https://api.aftership.com/tracking/2026-07/trackings/tracking%2F12345678')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AfterShip requires server-side configuration', async () => {
  await assert.rejects(
    createAfterShipTracking({ apiKey: '', apiVersion: '2026-07', trackingNumber: 'ZX-1234' }),
    error => error instanceof IntegrationError && error.status === 503,
  )
})
