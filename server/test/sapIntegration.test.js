import assert from 'node:assert/strict'
import test from 'node:test'
import { createSapClient, SapIntegrationError } from '../src/sapIntegration.js'

const config = {
  baseUrl: 'https://example.s4hana.cloud.sap/sap/opu/odata/sap',
  tokenUrl: 'https://identity.example.test/oauth/token',
  clientId: 'client-id',
  clientSecret: 'server-secret',
}

test('SAP client uses OAuth client credentials and returns only selected supplier fields', async () => {
  const requests = []
  const client = createSapClient(config, async (url, options) => {
    requests.push({ url: String(url), options })
    if (options.method === 'POST') {
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    }
    return Response.json({
      d: {
        results: [{
          Supplier: '100001',
          SupplierName: 'Sample Supplier',
          SupplierFullName: 'Sample Supplier Ltd.',
          SupplierAccountGroup: '0001',
          EmailAddress: 'private@example.test',
        }],
      },
    })
  })

  const result = await client.getResource('suppliers', 20)
  assert.deepEqual(result, {
    resource: 'suppliers',
    count: 1,
    records: [{
      Supplier: '100001',
      SupplierName: 'Sample Supplier',
      SupplierFullName: 'Sample Supplier Ltd.',
      SupplierAccountGroup: '0001',
    }],
  })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, config.tokenUrl)
  assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('client-id:server-secret').toString('base64')}`)
  assert.equal(requests[1].options.headers.Authorization, 'Bearer access-token')
  const requestUrl = new URL(requests[1].url)
  assert.equal(requestUrl.pathname, '/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Supplier')
  assert.equal(requestUrl.searchParams.get('$top'), '20')
  assert.equal(requestUrl.searchParams.get('$select'), 'Supplier,SupplierName,SupplierFullName,SupplierAccountGroup')
})

test('SAP client supports OData v4 response shape and reuses an unexpired access token', async () => {
  let tokenRequests = 0
  let dataRequests = 0
  const client = createSapClient(config, async (_url, options) => {
    if (options.method === 'POST') {
      tokenRequests += 1
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    }
    dataRequests += 1
    return Response.json({ value: [{ Product: 'P-100', ProductType: 'HAWA', Extra: 'not exposed' }] })
  })

  await client.getResource('products')
  await client.getResource('products')
  assert.equal(tokenRequests, 1)
  assert.equal(dataRequests, 2)
})

test('SAP Integration Suite routes the supported resources through its configured API endpoint', async () => {
  const suiteConfig = {
    ...config,
    integrationSuiteBaseUrl: 'https://tenant.example.test/http/supplyshield',
  }
  const requests = []
  const client = createSapClient(suiteConfig, async (url, options) => {
    requests.push({ url: String(url), options })
    if (options.method === 'POST') {
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    }
    return Response.json({
      value: [{ Supplier: '100001', SupplierName: 'Sample Supplier', EmailAddress: 'private@example.test' }],
    })
  })

  assert.equal(client.isConfigured(), true)
  assert.equal(client.usesIntegrationSuite(), true)
  assert.deepEqual(await client.getResource('suppliers', 10), {
    resource: 'suppliers',
    count: 1,
    records: [{ Supplier: '100001', SupplierName: 'Sample Supplier' }],
  })
  const requestUrl = new URL(requests[1].url)
  assert.equal(requestUrl.pathname, '/http/supplyshield/suppliers')
  assert.equal(requestUrl.searchParams.get('top'), '10')
})

test('SAP client rejects missing configuration and invalid resource limits', async () => {
  const missing = createSapClient({})
  assert.equal(missing.isConfigured(), false)
  await assert.rejects(
    missing.getResource('suppliers'),
    error => error instanceof SapIntegrationError && error.status === 503,
  )

  const configured = createSapClient(config, async () => Response.json({}))
  await assert.rejects(
    configured.getResource('suppliers', 101),
    error => error instanceof SapIntegrationError && error.status === 400,
  )
})

test('SAP client rejects unsafe or invalid service configuration', async () => {
  const unsafe = createSapClient({
    ...config,
    baseUrl: 'http://localhost:4000',
  })
  assert.equal(unsafe.isConfigured(), false)
  await assert.rejects(
    unsafe.getResource('suppliers'),
    error => error instanceof SapIntegrationError && error.status === 503,
  )

  const unsafeSuite = createSapClient({
    ...config,
    integrationSuiteBaseUrl: 'http://localhost:4000/http/supplyshield',
  })
  assert.equal(unsafeSuite.isConfigured(), false)
  assert.equal(unsafeSuite.usesIntegrationSuite(), false)
})

test('SAP client reports OAuth configuration errors without masking their status', async () => {
  const invalidTokenUrl = createSapClient({
    ...config,
    tokenUrl: 'http://localhost/token',
  })
  await assert.rejects(
    invalidTokenUrl.getResource('suppliers'),
    error => error instanceof SapIntegrationError
      && error.status === 503
      && error.message.includes('token URL'),
  )
})

test('SAP client reports provider errors without returning response bodies', async () => {
  const client = createSapClient(config, async (_url, options) => {
    if (options.method === 'POST') {
      return Response.json({ access_token: 'access-token', expires_in: 3600 })
    }
    return new Response('sensitive provider detail', { status: 403 })
  })

  await assert.rejects(
    client.getResource('stock'),
    error => error instanceof SapIntegrationError
      && error.status === 502
      && !error.message.includes('sensitive provider detail'),
  )
})
