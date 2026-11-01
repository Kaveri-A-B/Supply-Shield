import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiTokenAuthorization, createWriteAuthorization } from '../src/writeAuthorization.js'

const token = '0123456789abcdef0123456789abcdef'

function invokeAuthorization(middleware, { method = 'POST', authorization = '' } = {}) {
  const result = { statusCode: null, body: null, headers: {}, nextCalled: false }
  const response = {
    setHeader(name, value) {
      result.headers[name] = value
    },
    status(statusCode) {
      result.statusCode = statusCode
      return this
    },
    json(body) {
      result.body = body
      return this
    },
  }

  middleware(
    { method, get: name => name.toLowerCase() === 'authorization' ? authorization : undefined },
    response,
    () => {
      result.nextCalled = true
    },
  )

  return result
}

test('write authorization allows safe methods without a token', () => {
  const middleware = createWriteAuthorization(undefined)

  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(invokeAuthorization(middleware, { method }).nextCalled, true)
  }
})

test('write authorization disables mutations when the configured token is missing or too short', () => {
  for (const tokenValue of [undefined, 'too-short']) {
    const result = invokeAuthorization(createWriteAuthorization(tokenValue))
    assert.equal(result.statusCode, 503)
    assert.match(result.body.error, /API writes are disabled/)
    assert.equal(result.nextCalled, false)
  }
})

test('write authorization requires a matching Bearer token', () => {
  const middleware = createWriteAuthorization(token)

  for (const authorization of ['', 'Basic credentials', 'Bearer wrong-token']) {
    const result = invokeAuthorization(middleware, { authorization })
    assert.equal(result.statusCode, 401)
    assert.equal(result.headers['WWW-Authenticate'], 'Bearer')
    assert.equal(result.nextCalled, false)
  }

  assert.equal(invokeAuthorization(middleware, { authorization: `Bearer ${token}` }).nextCalled, true)
})

test('protected read endpoints require the same configured API token', () => {
  const middleware = createApiTokenAuthorization(token)
  const missing = invokeAuthorization(middleware, { method: 'GET' })
  assert.equal(missing.statusCode, 401)
  assert.equal(missing.nextCalled, false)

  const valid = invokeAuthorization(middleware, { method: 'GET', authorization: `Bearer ${token}` })
  assert.equal(valid.nextCalled, true)
})
