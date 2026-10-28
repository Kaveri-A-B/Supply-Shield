import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { alerts, shipments } from './demoData.js'

const app = express()
const port = Number(process.env.PORT) || 4000
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url))

app.disable('x-powered-by')
app.use(cors({ origin: clientOrigin }))
app.use(express.json({ limit: '100kb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    dataMode: 'synthetic-demo',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'not-configured',
  })
})

app.get('/api/dashboard', (_request, response) => {
  response.json({
    dataMode: 'synthetic-demo',
    updatedAt: new Date().toISOString(),
    shipments,
    alerts: alerts.filter(alert => !acknowledgedAlerts.has(alert.id)),
  })
})

app.get('/api/shipments', (_request, response) => {
  response.json({ dataMode: 'synthetic-demo', shipments })
})

app.post('/api/alerts/:alertId/acknowledge', (request, response) => {
  const alert = alerts.find(item => item.id === request.params.alertId)
  if (!alert) {
    response.status(404).json({ error: 'Alert not found.' })
    return
  }
  acknowledgedAlerts.add(alert.id)
  response.json({ id: alert.id, state: 'acknowledged', acknowledgedAt: new Date().toISOString() })
})

const acknowledgedAlerts = new Set()

app.use(express.static(clientDist))
app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next()
    return
  }
  response.sendFile(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)))
})

app.use((error, _request, response, _next) => {
  console.error('Unhandled API error:', error.message)
  response.status(500).json({ error: 'An unexpected server error occurred.' })
})

app.listen(port, () => {
  console.log(`SupplyShield demo API listening on http://localhost:${port}`)
  if (!process.env.MONGODB_URI) {
    console.log('MongoDB is not configured; serving clearly labeled synthetic demo data.')
  } else {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('MongoDB connected. Demo routes remain synthetic until data import is configured.'))
      .catch(error => console.error(`MongoDB connection failed: ${error.message}`))
  }
})
