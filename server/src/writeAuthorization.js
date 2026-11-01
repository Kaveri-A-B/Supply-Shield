import { timingSafeEqual } from 'node:crypto'

const minimumTokenBytes = 32
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export function createApiTokenAuthorization(configuredToken, disabledMessage = 'This protected API operation is disabled until API_WRITE_TOKEN is configured.') {
  const tokenBytes = Buffer.from(configuredToken ?? '', 'utf8')
  const tokenIsConfigured = tokenBytes.length >= minimumTokenBytes

  return function requireApiToken(request, response, next) {
    if (!tokenIsConfigured) {
      response.status(503).json({ error: disabledMessage })
      return
    }

    const authorization = request.get('authorization') ?? ''
    const match = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!match) {
      response.setHeader('WWW-Authenticate', 'Bearer')
      response.status(401).json({ error: 'A valid Bearer token is required for API writes.' })
      return
    }

    const providedBytes = Buffer.from(match[1], 'utf8')
    if (providedBytes.length !== tokenBytes.length || !timingSafeEqual(providedBytes, tokenBytes)) {
      response.setHeader('WWW-Authenticate', 'Bearer')
      response.status(401).json({ error: 'A valid Bearer token is required for API writes.' })
      return
    }

    next()
  }
}

export function createWriteAuthorization(configuredToken) {
  const requireApiToken = createApiTokenAuthorization(
    configuredToken,
    'API writes are disabled until API_WRITE_TOKEN is configured.',
  )

  return function requireWriteAuthorization(request, response, next) {
    if (safeMethods.has(request.method)) {
      next()
      return
    }

    requireApiToken(request, response, next)
  }
}
