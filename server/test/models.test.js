import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import { Alert, InventoryItem, Shipment, Supplier, calculateInventoryCoverage } from '../src/models.js'

test('shipment schema accepts a complete record and rejects out-of-range risk', async () => {
  const shipment = new Shipment({
    id: 'SHP-1001',
    supplier: 'Example Supplier',
    route: 'Port A to Port B',
    carrier: 'Example Carrier',
    eta: '2026-11-01T10:00:00.000Z',
    status: 'On track',
    risk: 35,
    initials: 'ES',
    tone: 'blue',
  })
  await shipment.validate()

  const invalid = new Shipment({ ...shipment.toObject(), id: 'SHP-1002', risk: 101 })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)
})

test('inventory schema requires non-negative quantities', async () => {
  const item = new InventoryItem({
    item: 'Protective gloves',
    detail: 'Warehouse A',
    quantity: 240,
    safetyStock: 80,
    dailyDemand: 20,
  })

  test('inventory coverage uses on-hand quantity and explicit demand thresholds', () => {
    assert.deepEqual(calculateInventoryCoverage(100, 10), { cover: 10, status: 'Watch' })
    assert.deepEqual(calculateInventoryCoverage(20, 10), { cover: 2, status: 'Critical' })
    assert.deepEqual(calculateInventoryCoverage(200, 10), { cover: 20, status: 'Healthy' })
    assert.deepEqual(calculateInventoryCoverage(100, 0), { cover: null, status: 'Unknown' })
  })
  await item.validate()

  const invalid = new InventoryItem({
    item: 'Invalid item',
    detail: 'Warehouse A',
    quantity: -1,
    safetyStock: 80,
    dailyDemand: 20,
  })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)
})

test('supplier rates and reliability are bounded percentages', async () => {
  const supplier = new Supplier({
    name: 'Example Supplier',
    completedOrders: 20,
    onTimeRate: 95,
    fulfillmentRate: 98,
    reliabilityScore: 90,
  })
  await supplier.validate()

  const invalid = new Supplier({
    name: 'Invalid Supplier',
    completedOrders: 20,
    onTimeRate: 110,
    fulfillmentRate: 98,
    reliabilityScore: 90,
  })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)
})

test('alerts default to unacknowledged and constrain severity', async () => {
  const alert = new Alert({
    id: 'ALT-1001',
    severity: 'High',
    title: 'Shipment delayed',
    description: 'The estimated delivery date has passed.',
    icon: 'truck',
  })
  await alert.validate()
  assert.equal(alert.acknowledged, false)

  const invalid = new Alert({
    id: 'ALT-1002',
    severity: 'Urgent',
    title: 'Invalid severity',
    description: 'This value is not part of the allowed severity set.',
    icon: 'truck',
  })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)
})
