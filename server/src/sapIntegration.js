import { isIP } from 'node:net'

export class SapIntegrationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const resources = {
  suppliers: {
    service: 'API_BUSINESS_PARTNER',
    entity: 'A_Supplier',
    fields: ['Supplier', 'SupplierName', 'SupplierFullName', 'SupplierAccountGroup'],
  },
  products: {
    service: 'API_PRODUCT_SRV',
    entity: 'A_Product',
    fields: ['Product', 'ProductType', 'ProductGroup', 'BaseUnit', 'IndustrySector'],
  },
  purchaseOrders: {
    service: 'API_PURCHASEORDER_PROCESS_SRV',
    entity: 'A_PurchaseOrder',
    fields: [
      'PurchaseOrder',
      'Supplier',
      'PurchaseOrderDate',
      'PurchaseOrderType',
      'PurchasingOrganization',
      'CompanyCode',
      'DocumentCurrency',
      'PurchaseOrderNetAmount',
    ],
  },
  stock: {
    service: 'API_MATERIAL_STOCK_SRV',
    entity: 'A_MaterialStock',
    fields: ['Material', 'Plant', 'StorageLocation', 'MatlWrhsStkQtyInMatlBaseUnit', 'MaterialBaseUnit'],
  },
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && isIP(hostname) === 0
  } catch {
    return false
  }
}

function sanitizeRecords(payload, fields) {
  const records = payload?.d?.results ?? payload?.value
  if (!Array.isArray(records)) {
    throw new SapIntegrationError(502, 'SAP returned an invalid OData response.')
  }

  return records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new SapIntegrationError(502, 'SAP returned an invalid OData record.')
    }
    return Object.fromEntries(
      fields
        .filter(field => Object.hasOwn(record, field))
        .map(field => [field, record[field]]),
    )
  })
}

export function createSapClient({
  baseUrl,
  integrationSuiteBaseUrl,
  tokenUrl,
  clientId,
  clientSecret,
  scope,
}, fetchImpl = globalThis.fetch) {
  const endpointBaseUrl = integrationSuiteBaseUrl || baseUrl
  const usesIntegrationSuite = Boolean(integrationSuiteBaseUrl)
  const configured = Boolean(endpointBaseUrl && tokenUrl && clientId && clientSecret)
  const validConfiguration = configured
    && isValidHttpsUrl(endpointBaseUrl)
    && isValidHttpsUrl(tokenUrl)
  let cachedToken
  let tokenExpiresAt = 0

  async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken
    if (!isValidHttpsUrl(tokenUrl)) {
      throw new SapIntegrationError(503, 'SAP OAuth token URL must be a valid HTTPS URL.')
    }

    let response
    try {
      response = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          ...(scope ? { scope } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new SapIntegrationError(502, 'SAP authentication could not be reached.')
    }

    if (!response.ok) {
      throw new SapIntegrationError(502, 'SAP authentication failed. Check the server-side OAuth configuration.')
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new SapIntegrationError(502, 'SAP authentication returned an unreadable response.')
    }
    if (typeof payload?.access_token !== 'string' || !payload.access_token) {
      throw new SapIntegrationError(502, 'SAP authentication returned no access token.')
    }

    cachedToken = payload.access_token
    const expiresIn = Number(payload.expires_in)
    tokenExpiresAt = Date.now() + Math.max(0, (Number.isFinite(expiresIn) ? expiresIn : 0) - 60) * 1000
    return cachedToken
  }

  return {
    isConfigured() {
      return validConfiguration
    },

    usesIntegrationSuite() {
      return validConfiguration && usesIntegrationSuite
    },

    async getResource(resourceName, top = 50) {
      if (!configured) {
        throw new SapIntegrationError(503, 'SAP integration is not configured on the server.')
      }
      if (!isValidHttpsUrl(endpointBaseUrl)) {
        throw new SapIntegrationError(503, 'SAP integration endpoint must be a valid HTTPS URL.')
      }
      const resource = resources[resourceName]
      if (!resource) throw new SapIntegrationError(404, 'SAP resource was not found.')
      if (!Number.isInteger(top) || top < 1 || top > 100) {
        throw new SapIntegrationError(400, 'The SAP result limit must be an integer from 1 to 100.')
      }

      const url = usesIntegrationSuite
        ? new URL(encodeURIComponent(resourceName), `${endpointBaseUrl.replace(/\/+$/, '')}/`)
        : new URL(
          `${resource.service}/${resource.entity}`,
          `${endpointBaseUrl.replace(/\/+$/, '')}/`,
        )
      if (usesIntegrationSuite) {
        url.searchParams.set('top', String(top))
      } else {
        url.searchParams.set('$top', String(top))
        url.searchParams.set('$select', resource.fields.join(','))
        url.searchParams.set('$format', 'json')
      }

      const accessToken = await getAccessToken()
      let response
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        throw new SapIntegrationError(502, 'SAP OData could not be reached.')
      }
      if (!response.ok) {
        const provider = usesIntegrationSuite ? 'SAP Integration Suite' : 'SAP OData'
        throw new SapIntegrationError(502, `${provider} request failed with HTTP ${response.status}.`)
      }

      let payload
      try {
        payload = await response.json()
      } catch {
        throw new SapIntegrationError(502, 'SAP OData returned an unreadable response.')
      }

      const records = sanitizeRecords(payload, resource.fields)
      return { resource: resourceName, count: records.length, records }
    },
  }
}
