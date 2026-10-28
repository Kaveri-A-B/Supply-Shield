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
}

export const initialShipments: Shipment[] = [
  { id: 'SHP-28491', supplier: 'Medline Industries', route: 'Rotterdam → Boston', carrier: 'DHL Global', eta: 'Today, 4:30 PM', status: 'At risk', risk: 78, initials: 'MI', tone: 'violet' },
  { id: 'SHP-28487', supplier: 'Cardinal Health', route: 'Hamburg → New York', carrier: 'Maersk', eta: 'Today, 8:15 PM', status: 'On track', risk: 18, initials: 'CH', tone: 'blue' },
  { id: 'SHP-28476', supplier: 'Baxter International', route: 'Singapore → Los Angeles', carrier: 'FedEx Freight', eta: 'Tomorrow, 9:00 AM', status: 'Delayed', risk: 91, initials: 'BI', tone: 'orange' },
  { id: 'SHP-28463', supplier: 'Owens & Minor', route: 'Antwerp → Chicago', carrier: 'Kuehne+Nagel', eta: 'Oct 30, 2:00 PM', status: 'On track', risk: 12, initials: 'OM', tone: 'teal' },
]

export const initialAlerts: Alert[] = [
  { id: 'ALT-014', severity: 'High', title: 'Critical shipment at risk', description: 'SHP-28491 · Oncology supplies · ETA today', time: '12 min ago', icon: 'truck' },
  { id: 'ALT-013', severity: 'High', title: 'Stockout projected in 5 days', description: 'Nitrile gloves, size M · Boston Central', time: '38 min ago', icon: 'box' },
  { id: 'ALT-012', severity: 'Medium', title: 'Severe weather on route', description: 'Tropical storm advisory · Gulf of Mexico', time: '1 hr ago', icon: 'cloud' },
]

export const inventory = [
  { item: 'Nitrile examination gloves', detail: 'Size M · Boston Central', cover: 5, quantity: '2,400', status: 'Critical' },
  { item: 'Sterile saline solution', detail: '500ml bags · North Campus', cover: 12, quantity: '8,150', status: 'Watch' },
  { item: 'Surgical masks N95', detail: 'Standard · Boston Central', cover: 21, quantity: '16,800', status: 'Healthy' },
  { item: 'IV administration sets', detail: 'Standard · South Campus', cover: 8, quantity: '1,920', status: 'Watch' },
]

export const trend = [38, 42, 37, 49, 45, 54, 51, 58, 52, 65, 60, 69, 63, 76, 72, 81, 74, 86, 80, 91]
