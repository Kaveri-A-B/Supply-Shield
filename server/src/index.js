import 'dotenv/config'
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { Alert, InventoryItem, Shipment, Supplier, calculateInventoryCoverage } from './models.js'

const port = Number(process.env.PORT) || 4000
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url))
const authSecret = process.env.AUTH_SECRET
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD
const cookieName = 'supplyshield_session'
const sessionDurationSeconds = 8 * 60 * 60
const loginFailures = new Map()

for (const [name, value] of Object.entries({
  MONGODB_URI: process.env.MONGODB_URI,
  AUTH_SECRET: authSecret,
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
})) {
  if (!value) throw new Error(`${name} must be configured before the server can start.`)
}
if (authSecret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters.')
if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.')

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json({ limit: '100kb' }))

function hash(value) {
  return createHash('sha256').update(value).digest()
}

function signSession(email) {
  const payload = Buffer.from(JSON.stringify({
    email,
    expiresAt: Date.now() + sessionDurationSeconds * 1000,
  })).toString('base64url')
  const signature = createHmac('sha256', authSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function getSession(request) {
  const cookie = request.headers.cookie?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  if (!token) return null

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  const expected = createHmac('sha256', authSecret).update(payload).digest()
  let actual
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.email !== 'string' || data.email !== adminEmail || data.expiresAt <= Date.now()) return null
    return { email: data.email }
  } catch {
    return null
  }
}

function requireAuth(request, response, next) {
  const session = getSession(request)
  if (!session) {
    response.status(401).json({ error: 'Sign in is required.' })
    return
  }
  request.user = session
  next()
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationSeconds}${secure}`)
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`)
}

function serializeShipment(document) {
  return {
    id: document.id,
    supplier: document.supplier,
    route: document.route,
    carrier: document.carrier,
    eta: document.eta.toISOString(),
    status: document.status,
    risk: document.risk,
    initials: document.initials,
    tone: document.tone,
  }
}

function serializeInventory(document) {
  const { cover, status } = calculateInventoryCoverage(document.quantity, document.dailyDemand)
  return {
    id: document._id.toString(),
    item: document.item,
    detail: document.detail,
    quantity: document.quantity,
    safetyStock: document.safetyStock,
    dailyDemand: document.dailyDemand,
    cover,
    status,
  }
}

function serializeSupplier(document) {
  return {
    id: document._id.toString(),
    name: document.name,
    orders: document.completedOrders,
    onTime: `${document.onTimeRate.toFixed(1)}%`,
    fulfillment: `${document.fulfillmentRate.toFixed(1)}%`,
    score: document.reliabilityScore,
    initials: document.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
    tone: ['violet', 'blue', 'teal', 'orange'][document.name.length % 4],
  }
}

function serializeAlert(document) {
  return {
    id: document.id,
    severity: document.severity,
    title: document.title,
    description: document.description,
    time: document.createdAt.toISOString(),
    icon: document.icon,
    acknowledged: document.acknowledged,
  }
}

function isObjectBody(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
}

function validateFields(body, allowedFields, requiredFields = []) {
  if (!isObjectBody(body)) return 'Request body must be a JSON object.'
  const fields = Object.keys(body)
  const unexpected = fields.find(field => !allowedFields.includes(field))
  if (unexpected) return `Unexpected field: ${unexpected}.`
  const missing = requiredFields.find(field => body[field] === undefined)
  return missing ? `Missing required field: ${missing}.` : null
}

function sendDatabaseError(error, _request, response, _next) {
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    response.status(400).json({ error: error.message })
    return
  }
  if (error?.code === 11000) {
    response.status(409).json({ error: 'A record with that identifier already exists.' })
    return
  }
  console.error('Unhandled API error:', error.message)
  response.status(500).json({ error: 'An unexpected server error occurred.' })
}

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    dataMode: 'mongodb',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.get('/api/auth/session', (request, response) => {
  const session = getSession(request)
  response.json({ authenticated: Boolean(session), email: session?.email ?? null })
})

app.post('/api/auth/login', (request, response) => {
  if (!isObjectBody(request.body) || typeof request.body.email !== 'string' || typeof request.body.password !== 'string') {
    response.status(400).json({ error: 'Email and password are required.' })
    return
  }
  const now = Date.now()
  for (const [ip, failure] of loginFailures) {
    if (failure.resetAt <= now) loginFailures.delete(ip)
  }
  const failure = loginFailures.get(request.ip)
  if (failure && failure.count >= 10) {
    response.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' })
    return
  }
  const emailMatches = timingSafeEqual(hash(request.body.email.trim().toLowerCase()), hash(adminEmail))
  const passwordMatches = timingSafeEqual(hash(request.body.password), hash(adminPassword))
  if (!emailMatches || !passwordMatches) {
    loginFailures.set(request.ip, {
      count: failure && failure.resetAt > now ? failure.count + 1 : 1,
      resetAt: failure && failure.resetAt > now ? failure.resetAt : now + 15 * 60 * 1000,
    })
    response.status(401).json({ error: 'Email or password is incorrect.' })
    return
  }
  loginFailures.delete(request.ip)
  setSessionCookie(response, signSession(adminEmail))
  response.json({ authenticated: true, email: adminEmail })
})

app.post('/api/auth/logout', (_request, response) => {
  clearSessionCookie(response)
  response.status(204).end()
})

app.use('/api', requireAuth)

app.get('/api/dashboard', async (_request, response, next) => {
  try {
    const [shipments, alerts, inventoryCount, supplierCount] = await Promise.all([
      Shipment.find().sort({ updatedAt: -1 }).limit(50),
      Alert.find({ acknowledged: false }).sort({ createdAt: -1 }).limit(50),
      InventoryItem.countDocuments(),
      Supplier.countDocuments(),
    ])
    response.json({
      dataMode: 'mongodb',
      updatedAt: new Date().toISOString(),
      shipments: shipments.map(serializeShipment),
      alerts: alerts.map(serializeAlert),
      inventoryCount,
      supplierCount,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/shipments', async (_request, response, next) => {
  try {
    response.json((await Shipment.find().sort({ updatedAt: -1 })).map(serializeShipment))
  } catch (error) {
    next(error)
  }
})

app.post('/api/shipments', async (request, response, next) => {
  const fields = ['id', 'supplier', 'route', 'carrier', 'eta', 'status', 'risk', 'initials', 'tone']
  const issue = validateFields(request.body, fields, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await Shipment.create(request.body)
    response.status(201).json(serializeShipment(document))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/shipments/:id', async (request, response, next) => {
  const fields = ['supplier', 'route', 'carrier', 'eta', 'status', 'risk', 'initials', 'tone']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await Shipment.findOneAndUpdate({ id: request.params.id }, request.body, { new: true, runValidators: true })
    if (!document) return response.status(404).json({ error: 'Shipment not found.' })
    response.json(serializeShipment(document))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/shipments/:id', async (request, response, next) => {
  try {
    const document = await Shipment.findOneAndDelete({ id: request.params.id })
    if (!document) return response.status(404).json({ error: 'Shipment not found.' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/inventory', async (_request, response, next) => {
  try {
    response.json((await InventoryItem.find().sort({ item: 1 })).map(serializeInventory))
  } catch (error) {
    next(error)
  }
})

app.post('/api/inventory', async (request, response, next) => {
  const fields = ['item', 'detail', 'quantity', 'safetyStock', 'dailyDemand']
  const issue = validateFields(request.body, fields, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    response.status(201).json(serializeInventory(await InventoryItem.create(request.body)))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/inventory/:id', async (request, response, next) => {
  const fields = ['item', 'detail', 'quantity', 'safetyStock', 'dailyDemand']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await InventoryItem.findByIdAndUpdate(request.params.id, request.body, { new: true, runValidators: true })
    if (!document) return response.status(404).json({ error: 'Inventory item not found.' })
    response.json(serializeInventory(document))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/inventory/:id', async (request, response, next) => {
  try {
    const document = await InventoryItem.findByIdAndDelete(request.params.id)
    if (!document) return response.status(404).json({ error: 'Inventory item not found.' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/suppliers', async (_request, response, next) => {
  try {
    response.json((await Supplier.find().sort({ name: 1 })).map(serializeSupplier))
  } catch (error) {
    next(error)
  }
})

app.post('/api/suppliers', async (request, response, next) => {
  const fields = ['name', 'completedOrders', 'onTimeRate', 'fulfillmentRate', 'reliabilityScore']
  const issue = validateFields(request.body, fields, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    response.status(201).json(serializeSupplier(await Supplier.create(request.body)))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/suppliers/:id', async (request, response, next) => {
  const fields = ['name', 'completedOrders', 'onTimeRate', 'fulfillmentRate', 'reliabilityScore']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await Supplier.findByIdAndUpdate(request.params.id, request.body, { new: true, runValidators: true })
    if (!document) return response.status(404).json({ error: 'Supplier not found.' })
    response.json(serializeSupplier(document))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/suppliers/:id', async (request, response, next) => {
  try {
    const document = await Supplier.findByIdAndDelete(request.params.id)
    if (!document) return response.status(404).json({ error: 'Supplier not found.' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/alerts', async (_request, response, next) => {
  try {
    response.json((await Alert.find().sort({ createdAt: -1 })).map(serializeAlert))
  } catch (error) {
    next(error)
  }
})

app.post('/api/alerts', async (request, response, next) => {
  const fields = ['id', 'severity', 'title', 'description', 'icon']
  const issue = validateFields(request.body, fields, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    response.status(201).json(serializeAlert(await Alert.create(request.body)))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/alerts/:id', async (request, response, next) => {
  const fields = ['severity', 'title', 'description', 'icon']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await Alert.findOneAndUpdate({ id: request.params.id }, request.body, { new: true, runValidators: true })
    if (!document) return response.status(404).json({ error: 'Alert not found.' })
    response.json(serializeAlert(document))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/alerts/:id/acknowledge', async (request, response, next) => {
  try {
    const document = await Alert.findOneAndUpdate({ id: request.params.id }, { acknowledged: true }, { new: true })
    if (!document) return response.status(404).json({ error: 'Alert not found.' })
    response.json(serializeAlert(document))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/alerts/:id', async (request, response, next) => {
  try {
    const document = await Alert.findOneAndDelete({ id: request.params.id })
    if (!document) return response.status(404).json({ error: 'Alert not found.' })
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
app.use(express.static(clientDist))
app.get('*', (_request, response) => {
  response.sendFile(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)))
})
app.use(sendDatabaseError)

await mongoose.connect(process.env.MONGODB_URI)
app.listen(port, () => {
  console.log(`SupplyShield server listening on port ${port}. MongoDB is connected.`)
})
