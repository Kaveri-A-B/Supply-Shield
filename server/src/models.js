import mongoose from 'mongoose'

const buyerRefundSchema = new mongoose.Schema({
  amount: { type: Number, min: 0.01, required: true },
  currency: { type: String, enum: ['INR'], required: true },
  fromSupplier: { type: String, required: true, trim: true, maxlength: 120 },
  toSupplier: { type: String, required: true, trim: true, maxlength: 120 },
  recordedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['Recorded - not processed'], default: 'Recorded - not processed', required: true },
}, { _id: false })

const shipmentSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
  supplier: { type: String, required: true, trim: true, maxlength: 120 },
  route: { type: String, required: true, trim: true, maxlength: 160 },
  carrier: { type: String, required: true, trim: true, maxlength: 120 },
  eta: { type: Date },
  status: { type: String, enum: ['On track', 'At risk', 'Delayed'] },
  risk: { type: Number, min: 0, max: 100 },
  initials: { type: String, required: true, trim: true, maxlength: 3 },
  tone: { type: String, enum: ['violet', 'blue', 'orange', 'teal'], required: true },
  buyerRefunds: { type: [buyerRefundSchema], default: [] },
}, { timestamps: true })

const inventorySchema = new mongoose.Schema({
  item: { type: String, required: true, trim: true, unique: true, maxlength: 160 },
  detail: { type: String, required: true, trim: true, maxlength: 160 },
  quantity: { type: Number, min: 0, required: true },
  safetyStock: { type: Number, min: 0, required: true },
  dailyDemand: { type: Number, min: 0, required: true },
  suppliers: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
}, { timestamps: true })

inventorySchema.pre('validate', function validateInventoryStock(next) {
  if (this.quantity <= this.safetyStock) {
    this.invalidate('quantity', 'On-hand quantity must be greater than safety stock.')
  }
  next()
})

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 120 },
  completedOrders: { type: Number, min: 0, required: true },
  onTimeRate: { type: Number, min: 0, max: 100, required: true },
  fulfillmentRate: { type: Number, min: 0, max: 100, required: true },
  reliabilityScore: { type: Number, min: 0, max: 100, required: true },
}, { timestamps: true })

const returnRequestSchema = new mongoose.Schema({
  product: { type: String, required: true, trim: true, maxlength: 160 },
  supplier: { type: String, required: true, trim: true, maxlength: 120 },
  requestedAt: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  dayLimit: { type: Number, min: 1, max: 365, validate: Number.isInteger, required: true },
}, { timestamps: true })

returnRequestSchema.pre('validate', function validateReturnDates(next) {
  if (this.completedAt && this.requestedAt && this.completedAt < this.requestedAt) {
    this.invalidate('completedAt', 'Return completion cannot be before the request date.')
  }
  next()
})

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
export const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema)
export const Alert = mongoose.model('Alert', alertSchema)

export function calculateInventoryCoverage(quantity, dailyDemand) {
  if (dailyDemand === 0) return { cover: null, status: 'Unknown' }
  const cover = Math.round((quantity / dailyDemand) * 10) / 10
  return {
    cover,
    status: cover <= 7 ? 'Critical' : cover <= 14 ? 'Watch' : 'Healthy',
  }
}

function utcCalendarDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function calculateReturnRating(requestedAt, completedAt, dayLimit) {
  if (!completedAt) return 'Pending'
  const elapsedDays = Math.round((utcCalendarDay(completedAt) - utcCalendarDay(requestedAt)) / 86_400_000)
  if (elapsedDays < dayLimit) return 'Best'
  if (elapsedDays === dayLimit) return 'Good'
  return 'Poor'
}
