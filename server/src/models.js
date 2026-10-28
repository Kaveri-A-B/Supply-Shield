import mongoose from 'mongoose'

const shipmentSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
  supplier: { type: String, required: true, trim: true, maxlength: 120 },
  route: { type: String, required: true, trim: true, maxlength: 160 },
  carrier: { type: String, required: true, trim: true, maxlength: 120 },
  eta: { type: Date, required: true },
  status: { type: String, enum: ['On track', 'At risk', 'Delayed'], required: true },
  risk: { type: Number, min: 0, max: 100, required: true },
  initials: { type: String, required: true, trim: true, maxlength: 3 },
  tone: { type: String, enum: ['violet', 'blue', 'orange', 'teal'], required: true },
}, { timestamps: true })

const inventorySchema = new mongoose.Schema({
  item: { type: String, required: true, trim: true, unique: true, maxlength: 160 },
  detail: { type: String, required: true, trim: true, maxlength: 160 },
  quantity: { type: Number, min: 0, required: true },
  safetyStock: { type: Number, min: 0, required: true },
  dailyDemand: { type: Number, min: 0, required: true },
}, { timestamps: true })

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 120 },
  completedOrders: { type: Number, min: 0, required: true },
  onTimeRate: { type: Number, min: 0, max: 100, required: true },
  fulfillmentRate: { type: Number, min: 0, max: 100, required: true },
  reliabilityScore: { type: Number, min: 0, max: 100, required: true },
}, { timestamps: true })

const alertSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
  severity: { type: String, enum: ['High', 'Medium', 'Info'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  icon: { type: String, enum: ['box', 'cloud', 'truck'], required: true },
  acknowledged: { type: Boolean, default: false },
}, { timestamps: true })

export const Shipment = mongoose.model('Shipment', shipmentSchema)
export const InventoryItem = mongoose.model('InventoryItem', inventorySchema)
export const Supplier = mongoose.model('Supplier', supplierSchema)
export const Alert = mongoose.model('Alert', alertSchema)

export function calculateInventoryCoverage(quantity, dailyDemand) {
  if (dailyDemand === 0) return { cover: null, status: 'Unknown' }
  const cover = Math.round((quantity / dailyDemand) * 10) / 10
  return {
    cover,
    status: cover <= 7 ? 'Critical' : cover <= 14 ? 'Watch' : 'Healthy',
  }
}
