import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import { Alert, InventoryItem, ReturnRequest, Shipment, Supplier, calculateInventoryCoverage, calculateReturnRating } from '../src/models.js'

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
    buyerRefunds: [{
      amount: 1250.5,
      currency: 'INR',
      fromSupplier: 'Previous Supplier',
      toSupplier: 'Example Supplier',
    }],
  })
  await shipment.validate()
  assert.equal(shipment.buyerRefunds[0].status, 'Recorded - not processed')
  assert.ok(shipment.buyerRefunds[0].recordedAt instanceof Date)

  const invalid = new Shipment({ ...shipment.toObject(), id: 'SHP-1002', risk: 101 })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)

  const invalidRefund = new Shipment({
    ...shipment.toObject(),
    id: 'SHP-1003',
    buyerRefunds: [{ amount: 0, currency: 'INR', fromSupplier: 'Old', toSupplier: 'New' }],
  })
  await assert.rejects(invalidRefund.validate(), mongoose.Error.ValidationError)
})

test('inventory schema requires on-hand quantity to exceed safety stock', async () => {
  const item = new InventoryItem({
    item: 'Protective gloves',
    detail: 'Warehouse A',
    quantity: 240,
    safetyStock: 80,
    dailyDemand: 20,
    suppliers: ['Example Supplier'],
  })

  test('inventory coverage uses on-hand quantity and explicit demand thresholds', () => {
    assert.deepEqual(calculateInventoryCoverage(100, 10), { cover: 10, status: 'Watch' })
    assert.deepEqual(calculateInventoryCoverage(20, 10), { cover: 2, status: 'Critical' })
    assert.deepEqual(calculateInventoryCoverage(200, 10), { cover: 20, status: 'Healthy' })
    assert.deepEqual(calculateInventoryCoverage(100, 0), { cover: null, status: 'Unknown' })
  })
  await item.validate()
  assert.deepEqual(item.suppliers, ['Example Supplier'])

  const legacyItem = new InventoryItem({
    item: 'Legacy inventory item',
    detail: 'Warehouse A',
    quantity: 100,
    safetyStock: 20,
    dailyDemand: 10,
  })
  await legacyItem.validate()
  assert.deepEqual(legacyItem.suppliers, [])

  const invalid = new InventoryItem({
    item: 'Invalid item',
    detail: 'Warehouse A',
    quantity: 80,
    safetyStock: 80,
    dailyDemand: 20,
  })
  await assert.rejects(invalid.validate(), mongoose.Error.ValidationError)

  const belowSafetyStock = new InventoryItem({
    item: 'Below safety stock',
    detail: 'Warehouse A',
    quantity: 79,
    safetyStock: 80,
    dailyDemand: 20,
  })
  await assert.rejects(belowSafetyStock.validate(), mongoose.Error.ValidationError)

  const negativeQuantity = new InventoryItem({
    item: 'Negative quantity',
    detail: 'Warehouse A',
    quantity: -1,
    safetyStock: 0,
    dailyDemand: 20,
  })
  await assert.rejects(negativeQuantity.validate(), mongoose.Error.ValidationError)
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

test('return ratings distinguish early, deadline-day, late, and pending returns', () => {
  const requestedAt = new Date('2026-10-01T00:00:00.000Z')
  assert.equal(calculateReturnRating(requestedAt, null, 7), 'Pending')
  assert.equal(calculateReturnRating(requestedAt, new Date('2026-10-07T00:00:00.000Z'), 7), 'Best')
  assert.equal(calculateReturnRating(requestedAt, new Date('2026-10-08T00:00:00.000Z'), 7), 'Good')
  assert.equal(calculateReturnRating(requestedAt, new Date('2026-10-09T00:00:00.000Z'), 7), 'Poor')
})

test('return request schema requires a valid day limit and ordered dates', async () => {
  const request = new ReturnRequest({
    product: 'Protective gloves',
    supplier: 'Example Supplier',
    requestedAt: '2026-10-01T00:00:00.000Z',
    completedAt: '2026-10-08T00:00:00.000Z',
    dayLimit: 7,
  })
  await request.validate()

  const invalid = new ReturnRequest({
    product: 'Protective gloves',
    supplier: 'Example Supplier',
    requestedAt: '2026-10-08T00:00:00.000Z',
    completedAt: '2026-10-01T00:00:00.000Z',
    dayLimit: 0,
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
