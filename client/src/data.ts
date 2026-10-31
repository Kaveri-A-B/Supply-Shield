export type Shipment = {
  id: string
  supplier: string
  route: string
  carrier: string
  eta: string
  status: 'On track' | 'At risk' | 'Delayed'
  risk: number
  initials: string
  tone: string
  refundRequired?: boolean
  refundAmountInr?: number | null
  retentionBenefit?: 'Super coins' | '20% cashback' | 'Surprise gift' | null
}

export type Alert = {
  id: string
  severity: 'High' | 'Medium' | 'Info'
  title: string
  description: string
  time: string
  icon: 'box' | 'cloud' | 'truck'
  acknowledged?: boolean
}

export type InventoryItem = {
  id: string
  item: string
  detail: string
  quantity: number
  safetyStock: number
  dailyDemand: number
  suppliers: string[]
  cover: number | null
  status: 'Critical' | 'Watch' | 'Healthy' | 'Unknown'
}

export type Supplier = {
  id: string
  name: string
  orders: number
  onTime: string
  fulfillment: string
  score: number
  tone: string
  initials: string
}

export type ReturnRequest = {
  id: string
  product: string
  supplier: string
  requestedAt: string
  completedAt: string | null
  dayLimit: number
  rating: 'Pending' | 'Best' | 'Good' | 'Poor'
}

function daysAgo(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString()
}

export function createDemoWorkspace() {
  const suppliers: Supplier[] = [
    { id: 'sample-supplier-1', name: 'Northstar Components', orders: 42, onTime: '96.0%', fulfillment: '98.0%', score: 94, tone: 'blue', initials: 'NC' },
    { id: 'sample-supplier-2', name: 'Coastal Industrial Supply', orders: 35, onTime: '89.0%', fulfillment: '93.0%', score: 86, tone: 'teal', initials: 'CI' },
    { id: 'sample-supplier-3', name: 'Central Parts Company', orders: 28, onTime: '82.0%', fulfillment: '90.0%', score: 78, tone: 'violet', initials: 'CP' },
    { id: 'sample-supplier-4', name: 'Westline Materials', orders: 19, onTime: '75.0%', fulfillment: '84.0%', score: 69, tone: 'orange', initials: 'WM' },
    { id: 'sample-supplier-5', name: 'Southridge Manufacturing', orders: 24, onTime: '92.0%', fulfillment: '95.0%', score: 89, tone: 'blue', initials: 'SM' },
  ]

  const shipments: Shipment[] = [
    { id: 'SHP-1001', supplier: suppliers[0].name, route: 'North Hub → Central Hub', carrier: 'Arrow Freight', eta: daysAgo(-3), status: 'On track', risk: 18, initials: suppliers[0].initials, tone: suppliers[0].tone },
    { id: 'SHP-1002', supplier: suppliers[1].name, route: 'Coast Hub → North Hub', carrier: 'BlueWave Logistics', eta: daysAgo(-1), status: 'At risk', risk: 74, initials: suppliers[1].initials, tone: suppliers[1].tone },
    { id: 'SHP-1003', supplier: suppliers[2].name, route: 'Central Hub → East Hub', carrier: 'Pioneer Transport', eta: daysAgo(1), status: 'Delayed', risk: 88, initials: suppliers[2].initials, tone: suppliers[2].tone },
    { id: 'SHP-1004', supplier: suppliers[3].name, route: 'West Hub → Central Hub', carrier: 'Summit Cargo', eta: daysAgo(-5), status: 'On track', risk: 31, initials: suppliers[3].initials, tone: suppliers[3].tone },
    { id: 'SHP-1005', supplier: suppliers[4].name, route: 'South Hub → Coast Hub', carrier: 'Evergreen Transit', eta: daysAgo(-2), status: 'At risk', risk: 61, initials: suppliers[4].initials, tone: suppliers[4].tone },
  ]

  const inventoryItems: InventoryItem[] = [
    { id: 'sample-inventory-1', item: 'Industrial ball bearings', detail: 'North warehouse', quantity: 240, safetyStock: 80, dailyDemand: 20, suppliers: [suppliers[0].name], cover: 12, status: 'Watch' },
    { id: 'sample-inventory-2', item: 'Protective work gloves', detail: 'Coast warehouse', quantity: 120, safetyStock: 60, dailyDemand: 15, suppliers: [suppliers[1].name], cover: 8, status: 'Watch' },
    { id: 'sample-inventory-3', item: 'Hydraulic pump seals', detail: 'Central warehouse', quantity: 180, safetyStock: 50, dailyDemand: 12, suppliers: [suppliers[2].name], cover: 15, status: 'Healthy' },
    { id: 'sample-inventory-4', item: 'Stainless steel fasteners', detail: 'West warehouse', quantity: 96, safetyStock: 40, dailyDemand: 16, suppliers: [suppliers[3].name], cover: 6, status: 'Critical' },
    { id: 'sample-inventory-5', item: 'Packaging cartons', detail: 'South warehouse', quantity: 320, safetyStock: 70, dailyDemand: 16, suppliers: [suppliers[4].name], cover: 20, status: 'Healthy' },
  ]

  const returnRequests: ReturnRequest[] = [
    { id: 'RTN-1001', product: inventoryItems[0].item, supplier: suppliers[0].name, requestedAt: daysAgo(9), completedAt: daysAgo(5), dayLimit: 7, rating: 'Best' },
    { id: 'RTN-1002', product: inventoryItems[1].item, supplier: suppliers[1].name, requestedAt: daysAgo(10), completedAt: daysAgo(3), dayLimit: 7, rating: 'Good' },
    { id: 'RTN-1003', product: inventoryItems[2].item, supplier: suppliers[2].name, requestedAt: daysAgo(12), completedAt: daysAgo(4), dayLimit: 7, rating: 'Poor' },
    { id: 'RTN-1004', product: inventoryItems[3].item, supplier: suppliers[3].name, requestedAt: daysAgo(2), completedAt: null, dayLimit: 7, rating: 'Pending' },
    { id: 'RTN-1005', product: inventoryItems[4].item, supplier: suppliers[4].name, requestedAt: daysAgo(8), completedAt: daysAgo(3), dayLimit: 7, rating: 'Best' },
  ]

  const alerts: Alert[] = [
    { id: 'ALT-1001', severity: 'High', title: 'Shipment delayed', description: 'A sample shipment is past its illustrative arrival date.', time: daysAgo(0), icon: 'truck' },
    { id: 'ALT-1002', severity: 'Medium', title: 'Inventory below safety stock', description: 'A sample product is below its illustrative safety stock.', time: daysAgo(1), icon: 'box' },
    { id: 'ALT-1003', severity: 'Info', title: 'Return pending', description: 'A sample product return has not been marked complete.', time: daysAgo(0), icon: 'box' },
  ]

  return { shipments, inventoryItems, suppliers, returnRequests, alerts }
}
