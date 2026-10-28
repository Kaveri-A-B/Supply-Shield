export const shipments = [
  { id: 'SHP-28491', supplier: 'Medline Industries', route: 'Rotterdam → Boston', carrier: 'DHL Global', eta: 'Today, 4:30 PM', status: 'At risk', risk: 78, initials: 'MI', tone: 'violet' },
  { id: 'SHP-28487', supplier: 'Cardinal Health', route: 'Hamburg → New York', carrier: 'Maersk', eta: 'Today, 8:15 PM', status: 'On track', risk: 18, initials: 'CH', tone: 'blue' },
  { id: 'SHP-28476', supplier: 'Baxter International', route: 'Singapore → Los Angeles', carrier: 'FedEx Freight', eta: 'Tomorrow, 9:00 AM', status: 'Delayed', risk: 91, initials: 'BI', tone: 'orange' },
  { id: 'SHP-28463', supplier: 'Owens & Minor', route: 'Antwerp → Chicago', carrier: 'Kuehne+Nagel', eta: 'Oct 30, 2:00 PM', status: 'On track', risk: 12, initials: 'OM', tone: 'teal' },
]

export const alerts = [
  { id: 'ALT-014', severity: 'High', title: 'Critical shipment at risk', description: 'SHP-28491 · Oncology supplies · ETA today', time: '12 min ago', icon: 'truck' },
  { id: 'ALT-013', severity: 'High', title: 'Stockout projected in 5 days', description: 'Nitrile gloves, size M · Boston Central', time: '38 min ago', icon: 'box' },
  { id: 'ALT-012', severity: 'Medium', title: 'Severe weather on route', description: 'Tropical storm advisory · Gulf of Mexico', time: '1 hr ago', icon: 'cloud' },
]
