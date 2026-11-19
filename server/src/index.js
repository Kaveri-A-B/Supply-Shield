import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { Alert, InventoryItem, ReturnRequest, Shipment, Supplier, calculateInventoryCoverage, calculateReturnRating } from './models.js'
import { createAfterShipTracking, getAfterShipTracking, IntegrationError } from './integrations.js'
import { createApiTokenAuthorization, createWriteAuthorization } from './writeAuthorization.js'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const environment = process.env.NODE_ENV || 'development'
const port = Number(process.env.PORT) || 4000
const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
function isAllowedDevelopmentOrigin(origin) {
  if (environment === 'production') return false
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url))
const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: environment === 'production',
}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('Origin is not allowed by CORS.'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: environment === 'production' ? 200 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and retry.' },
}))
app.use('/api', createWriteAuthorization(process.env.API_WRITE_TOKEN))
const requireApiToken = createApiTokenAuthorization(process.env.API_WRITE_TOKEN)
app.use((request, response, next) => {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
  next()
})
app.use(express.json({ limit: '100kb', strict: true }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

function serializeShipment(document) {
  return {
    id: document.id,
    supplier: document.supplier,
    route: document.route,
    carrier: document.carrier,
    eta: document.eta?.toISOString() ?? null,
    status: document.status ?? null,
    risk: document.risk ?? null,
    initials: document.initials,
    tone: document.tone,
    buyerRefunds: (document.buyerRefunds ?? []).map(refund => ({
      amount: refund.amount,
      currency: refund.currency,
      fromSupplier: refund.fromSupplier,
      toSupplier: refund.toSupplier,
      recordedAt: refund.recordedAt.toISOString(),
      status: refund.status,
    })),
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
    suppliers: document.suppliers || [],
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

function serializeReturnRequest(document) {
  return {
    id: document._id.toString(),
    product: document.product,
    supplier: document.supplier,
    requestedAt: document.requestedAt.toISOString(),
    completedAt: document.completedAt?.toISOString() ?? null,
    dayLimit: document.dayLimit,
    rating: calculateReturnRating(document.requestedAt, document.completedAt, document.dayLimit),
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
  console.error('Unhandled API error.')
  response.status(500).json({ error: 'An unexpected server error occurred.' })
}

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    dataMode: 'mongodb',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.get('/api/integrations/status', (_request, response) => {
  response.json({
    aftership: Boolean(process.env.AFTERSHIP_API_KEY),
    writes: Buffer.byteLength(process.env.API_WRITE_TOKEN ?? '', 'utf8') >= 32,
  })
})

app.use('/api', (request, response, next) => {
  if (
    request.path === '/health'
    || request.path === '/integrations/status'
    || request.path === '/tracking'
    || request.path.startsWith('/tracking/')
  ) {
    next()
    return
  }
  if (mongoose.connection.readyState !== 1) {
    response.status(503).json({ error: 'Database is unavailable. Check the MongoDB connection and retry.' })
    return
  }
  next()
})

function validateTrackingNumber(value) {
  return typeof value === 'string'
    && value.trim().length >= 4
    && value.trim().length <= 100
    && /^[A-Za-z0-9._/-]+$/.test(value.trim())
}

app.post('/api/tracking', async (request, response) => {
  const issue = validateFields(request.body, ['trackingNumber', 'carrier'], ['trackingNumber'])
  if (issue) return response.status(400).json({ error: issue })
  if (!validateTrackingNumber(request.body.trackingNumber)) {
    return response.status(400).json({ error: 'Tracking number must contain 4 to 100 letters, digits, dots, underscores, slashes, or hyphens.' })
  }
  if (request.body.carrier !== undefined && (
    typeof request.body.carrier !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,80}$/i.test(request.body.carrier.trim())
  )) {
    return response.status(400).json({ error: 'Carrier must be a valid AfterShip slug.' })
  }

  try {
    const tracking = await createAfterShipTracking({
      apiKey: process.env.AFTERSHIP_API_KEY,
      apiVersion: process.env.AFTERSHIP_API_VERSION || '2026-07',
      trackingNumber: request.body.trackingNumber.trim(),
      carrier: request.body.carrier?.trim().toLowerCase() || undefined,
    })
    response.status(201).json(tracking)
  } catch (error) {
    if (error instanceof IntegrationError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    console.error('AfterShip create-tracking request failed.')
    response.status(502).json({ error: 'AfterShip could not be reached. Check the server connection and try again.' })
  }
})

app.get('/api/tracking/:id', requireApiToken, async (request, response) => {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Tracking ID is invalid.' })
  }

  try {
    response.json(await getAfterShipTracking({
      apiKey: process.env.AFTERSHIP_API_KEY,
      apiVersion: process.env.AFTERSHIP_API_VERSION || '2026-07',
      id: request.params.id,
    }))
  } catch (error) {
    if (error instanceof IntegrationError) {
      response.status(error.status).json({ error: error.message })
      return
    }
    console.error('AfterShip get-tracking request failed.')
    response.status(502).json({ error: 'AfterShip could not be reached. Check the server connection and try again.' })
  }
})

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
  const issue = validateFields(request.body, fields, ['id', 'supplier', 'route', 'carrier', 'initials', 'tone'])
  if (issue) return response.status(400).json({ error: issue })
  try {
    const document = await Shipment.create(request.body)
    response.status(201).json(serializeShipment(document))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/shipments/:id', async (request, response, next) => {
  const fields = ['supplier', 'route', 'carrier', 'eta', 'status', 'risk', 'initials', 'tone', 'buyerRefundAmount']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  try {
    const existing = await Shipment.findOne({ id: request.params.id })
    if (!existing) return response.status(404).json({ error: 'Shipment not found.' })
    const requestedSupplier = typeof request.body.supplier === 'string' ? request.body.supplier.trim() : request.body.supplier
    const supplierChanged = requestedSupplier !== undefined && requestedSupplier !== existing.supplier
    if (supplierChanged && (typeof request.body.buyerRefundAmount !== 'number' || !Number.isFinite(request.body.buyerRefundAmount) || request.body.buyerRefundAmount <= 0)) {
      return response.status(400).json({ error: 'A positive refund amount in INR is required when changing supplier.' })
    }
    if (!supplierChanged && request.body.buyerRefundAmount !== undefined) {
      return response.status(400).json({ error: 'A refund amount can only be recorded when changing supplier.' })
    }
    if (supplierChanged) {
      const { buyerRefundAmount, ...updates } = request.body
      const previousSupplier = existing.supplier
      existing.set(updates)
      existing.buyerRefunds.push({
        amount: buyerRefundAmount,
        currency: 'INR',
        fromSupplier: previousSupplier,
        toSupplier: requestedSupplier,
        recordedAt: new Date(),
        status: 'Recorded - not processed',
      })
      await existing.save()
      return response.json(serializeShipment(existing))
    }
    const document = await Shipment.findOneAndUpdate({ id: request.params.id }, request.body, { new: true, runValidators: true })
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

function validateInventorySuppliers(body) {
  if (body.suppliers === undefined) return null
  if (!Array.isArray(body.suppliers) || body.suppliers.some(name =>
    typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 120)) {
    return 'Suppliers must be an array of non-empty names of at most 120 characters.'
  }
  return null
}

app.post('/api/inventory', async (request, response, next) => {
  const fields = ['item', 'detail', 'quantity', 'safetyStock', 'dailyDemand', 'suppliers']
  const issue = validateFields(request.body, fields, ['item', 'detail', 'quantity', 'safetyStock', 'dailyDemand'])
  if (issue) return response.status(400).json({ error: issue })
  const supplierIssue = validateInventorySuppliers(request.body)
  if (supplierIssue) return response.status(400).json({ error: supplierIssue })
  try {
    response.status(201).json(serializeInventory(await InventoryItem.create({
      ...request.body,
      suppliers: request.body.suppliers ?? [],
    })))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/inventory/:id', async (request, response, next) => {
  const fields = ['item', 'detail', 'quantity', 'safetyStock', 'dailyDemand', 'suppliers']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  const supplierIssue = validateInventorySuppliers(request.body)
  if (supplierIssue) return response.status(400).json({ error: supplierIssue })
  try {
    const document = await InventoryItem.findById(request.params.id)
    if (!document) return response.status(404).json({ error: 'Inventory item not found.' })
    document.set(request.body)
    await document.save()
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

app.get('/api/returns', async (_request, response, next) => {
  try {
    response.json((await ReturnRequest.find().sort({ requestedAt: -1 })).map(serializeReturnRequest))
  } catch (error) {
    next(error)
  }
})

function validateReturnDates(body) {
  if (body.completedAt === null || body.completedAt === '') return null
  if (body.completedAt !== undefined && body.requestedAt !== undefined) {
    const requestedAt = new Date(body.requestedAt)
    const completedAt = new Date(body.completedAt)
    if (!Number.isNaN(requestedAt.valueOf()) && !Number.isNaN(completedAt.valueOf()) && completedAt < requestedAt) {
      return 'Return completion cannot be before the request date.'
    }
  }
  return null
}

app.post('/api/returns', async (request, response, next) => {
  const fields = ['product', 'supplier', 'requestedAt', 'completedAt', 'dayLimit']
  const issue = validateFields(request.body, fields, ['product', 'supplier', 'requestedAt', 'dayLimit'])
  if (issue) return response.status(400).json({ error: issue })
  if (!Number.isInteger(request.body.dayLimit) || request.body.dayLimit < 1 || request.body.dayLimit > 365) {
    return response.status(400).json({ error: 'Return day limit must be a whole number from 1 to 365.' })
  }
  const dateIssue = validateReturnDates(request.body)
  if (dateIssue) return response.status(400).json({ error: dateIssue })
  try {
    const document = await ReturnRequest.create({ ...request.body, completedAt: request.body.completedAt || null })
    response.status(201).json(serializeReturnRequest(document))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/returns/:id', async (request, response, next) => {
  const fields = ['product', 'supplier', 'requestedAt', 'completedAt', 'dayLimit']
  const issue = validateFields(request.body, fields)
  if (issue) return response.status(400).json({ error: issue })
  if (request.body.dayLimit !== undefined && (!Number.isInteger(request.body.dayLimit) || request.body.dayLimit < 1 || request.body.dayLimit > 365)) {
    return response.status(400).json({ error: 'Return day limit must be a whole number from 1 to 365.' })
  }
  const dateIssue = validateReturnDates(request.body)
  if (dateIssue) return response.status(400).json({ error: dateIssue })
  try {
    const document = await ReturnRequest.findById(request.params.id)
    if (!document) return response.status(404).json({ error: 'Return record not found.' })
    for (const [field, value] of Object.entries(request.body)) {
      document.set(field, field === 'completedAt' && value === '' ? null : value)
    }
    await document.save()
    response.json(serializeReturnRequest(document))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/returns/:id', async (request, response, next) => {
  try {
    const document = await ReturnRequest.findByIdAndDelete(request.params.id)
    if (!document) return response.status(404).json({ error: 'Return record not found.' })
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
  const requestedStatus = request.body?.acknowledged
  if (requestedStatus !== undefined && typeof requestedStatus !== 'boolean') {
    return response.status(400).json({ error: 'Acknowledged status must be a boolean.' })
  }
  try {
    const document = await Alert.findOneAndUpdate({ id: request.params.id }, { acknowledged: requestedStatus ?? true }, { new: true })
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
app.use(express.static(clientDist, {
  index: false,
  maxAge: '1h',
  setHeaders(response, path) {
    if (path.endsWith('.html')) {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    }
  },
}))
app.get('*', (_request, response) => {
  response.sendFile(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)))
})
app.use(sendDatabaseError)

app.listen(port, () => {
  console.log(`SupplyShield server listening on port ${port}.`)
})

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not configured. API data operations are unavailable.')
} else {
  void mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB is connected.'))
    .catch(error => console.error('MongoDB connection failed:', error.message))
}

if (Buffer.byteLength(process.env.API_WRITE_TOKEN ?? '', 'utf8') < 32) {
  console.warn('API_WRITE_TOKEN is missing or too short; API write endpoints are disabled.')
}
