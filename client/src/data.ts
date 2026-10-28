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
