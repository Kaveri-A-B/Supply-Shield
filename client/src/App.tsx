import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Box,
  Check, ChevronRight, CircleHelp, Clock3, Cloud, RotateCcw,
  Download, LayoutDashboard, Menu,
  Plus, Search, ShieldCheck, Sparkles,
  Truck, Users, X,
} from 'lucide-react'
import { createDemoWorkspace, type Alert, type InventoryItem, type ReturnRequest, type Shipment, type Supplier } from './data'

type Section = 'Overview' | 'Shipments' | 'Live Tracking' | 'Risk Prediction' | 'Disruption Intelligence' | 'Inventory' | 'Supplier Network' | 'Returns' | 'Alerts' | 'What-if Simulator' | 'AI Recovery Planner' | 'Reports & Analytics' | 'AI Assistant' | 'Settings' | 'Branding'
type SearchResult = { id: string; title: string; detail: string; kind: string; section: Section; filter: string }
type RecordKind = 'shipments' | 'inventory' | 'suppliers' | 'returns' | 'alerts'
type ManagedRecord = { id: string; [key: string]: unknown }
type DisruptionSelection = { kind: 'category'; name: string } | { kind: 'alert'; id: string } | { kind: 'inventory' } | null

type RecordField = {
  name: string
  label: string
  type?: 'text' | 'number' | 'datetime-local' | 'date' | 'select' | 'multiselect' | 'supplier' | 'inventory-item'
  options?: string[]
  min?: number
  max?: number
}

const recordLabels: Record<RecordKind, string> = {
  shipments: 'shipment',
  inventory: 'inventory item',
  suppliers: 'supplier',
  returns: 'return record',
  alerts: 'alert',
}

const recordDefinitions: Record<RecordKind, { endpoint: string; fields: RecordField[] }> = {
  shipments: {
    endpoint: '/api/shipments',
    fields: [
      { name: 'id', label: 'Shipment ID' },
      { name: 'supplier', label: 'Supplier' },
      { name: 'route', label: 'Route' },
      { name: 'carrier', label: 'Carrier' },
      { name: 'eta', label: 'Estimated arrival', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: ['On track', 'At risk', 'Delayed'] },
      { name: 'risk', label: 'Risk score', type: 'number', min: 0, max: 100 },
      { name: 'initials', label: 'Supplier initials' },
    ],
  },
  inventory: {
    endpoint: '/api/inventory',
    fields: [
      { name: 'item', label: 'Item' },
      { name: 'detail', label: 'Location / details' },
      { name: 'quantity', label: 'On hand', type: 'number', min: 0 },
      { name: 'safetyStock', label: 'Safety stock', type: 'number', min: 0 },
      { name: 'dailyDemand', label: 'Daily demand', type: 'number', min: 0 },
      { name: 'suppliers', label: 'Assigned suppliers', type: 'multiselect' },
    ],
  },
  suppliers: {
    endpoint: '/api/suppliers',
    fields: [
      { name: 'name', label: 'Supplier name' },
      { name: 'completedOrders', label: 'Completed orders', type: 'number', min: 0 },
      { name: 'onTimeRate', label: 'On-time rate (%)', type: 'number', min: 0, max: 100 },
      { name: 'fulfillmentRate', label: 'Fulfillment rate (%)', type: 'number', min: 0, max: 100 },
      { name: 'reliabilityScore', label: 'Reliability score', type: 'number', min: 0, max: 100 },
    ],
  },
  returns: {
    endpoint: '/api/returns',
    fields: [
      { name: 'product', label: 'Product / inventory item', type: 'inventory-item' },
      { name: 'supplier', label: 'Supplier', type: 'supplier' },
      { name: 'requestedAt', label: 'Return requested on', type: 'date' },
      { name: 'completedAt', label: 'Return completed on', type: 'date' },
      { name: 'dayLimit', label: 'Allowed return period (days)', type: 'number', min: 1, max: 365 },
    ],
  },
  alerts: {
    endpoint: '/api/alerts',
    fields: [
      { name: 'id', label: 'Alert ID' },
      { name: 'severity', label: 'Severity', type: 'select', options: ['High', 'Medium', 'Info'] },
      { name: 'title', label: 'Title' },
      { name: 'description', label: 'Description' },
      { name: 'icon', label: 'Icon', type: 'select', options: ['box', 'cloud', 'truck'] },
    ],
  },
}

const sections: { label: Section; icon: typeof LayoutDashboard; group: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, group: 'OPERATIONS' },
  { label: 'Shipments', icon: Truck, group: 'OPERATIONS' },
  { label: 'Live Tracking', icon: Truck, group: 'OPERATIONS' },
  { label: 'Inventory', icon: Box, group: 'OPERATIONS' },
  { label: 'Supplier Network', icon: Users, group: 'OPERATIONS' },
  { label: 'Returns', icon: RotateCcw, group: 'OPERATIONS' },
  { label: 'Risk Prediction', icon: Activity, group: 'INTELLIGENCE' },
  { label: 'Disruption Intelligence', icon: Cloud, group: 'INTELLIGENCE' },
  { label: 'Alerts', icon: Bell, group: 'INTELLIGENCE' },
  { label: 'What-if Simulator', icon: Activity, group: 'INTELLIGENCE' },
  { label: 'AI Recovery Planner', icon: ShieldCheck, group: 'INTELLIGENCE' },
  { label: 'Reports & Analytics', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'AI Assistant', icon: Sparkles, group: 'WORKSPACE' },
]

const sectionSearchAliases: Partial<Record<Section, string>> = {
  'Live Tracking': 'tracking route shipment location',
  'Supplier Network': 'supplier suppliers network vendor vendors',
  Inventory: 'inventory stock items products',
  Returns: 'return returns returned product',
  Shipments: 'shipment shipments freight route',
}

function toManagedRecords(records: Array<Shipment | Alert | InventoryItem | Supplier | ReturnRequest>): ManagedRecord[] {
  return records.map(record => ({ ...record })) as ManagedRecord[]
}

function managedFieldValue(record: ManagedRecord, field: RecordField, kind: RecordKind) {
  if (kind === 'inventory' && field.name === 'suppliers') {
    return Array.isArray(record.suppliers) && record.suppliers.length ? record.suppliers.join(', ') : '—'
  }
  if (kind === 'suppliers') {
    const supplierValue = field.name === 'completedOrders' ? record.orders
      : field.name === 'onTimeRate' ? record.onTime
        : field.name === 'fulfillmentRate' ? record.fulfillment
          : field.name === 'reliabilityScore' ? record.score
            : record[field.name]
    if (field.name === 'reliabilityScore' && supplierValue !== undefined && supplierValue !== null) return `${supplierValue}/100`
    return String(supplierValue ?? '—')
  }
  const value = record[field.name]
  if (field.type === 'date') {
    if (kind === 'returns' && field.name === 'completedAt' && !value) return ''
    return formatRecordDate(value)
  }
  return String(value ?? (kind === 'returns' && field.name === 'completedAt' ? 'Pending' : '—'))
}

function supplierReturnPerformance(supplierName: string, returnRequests: ReturnRequest[]) {
  const completedReturns = returnRequests.filter(item => item.supplier === supplierName && item.rating !== 'Pending')
  if (!completedReturns.length) return null
  const best = completedReturns.filter(item => item.rating === 'Best').length
  const good = completedReturns.filter(item => item.rating === 'Good').length
  const poor = completedReturns.filter(item => item.rating === 'Poor').length
  const onTime = best + good
  return { total: completedReturns.length, best, good, poor, onTime, percent: Math.round(onTime / completedReturns.length * 100) }
}

function shipmentNeedsReview(shipment: Shipment) {
  return shipment.status !== 'On track' || shipment.risk >= 70
}

function inventoryAtRiskSuppliers(item: InventoryItem, shipments: Shipment[]) {
  const assigned = item.suppliers ?? []
  return assigned.filter(name => shipments.some(shipment => shipment.supplier === name && shipmentNeedsReview(shipment)))
}

function selectedValues(value: string) {
  const parsed: unknown = JSON.parse(value || '[]')
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}

function formatRecordDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString()
}

function localDateInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function nextLocalDateInputValue(date = new Date()) {
  return localDateInputValue(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))
}

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Request failed with status ${response.status}.`)
  }
  return response
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  return await (await apiRequest(path, init)).json() as T
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, character => {
    if (character === '<') return '&lt;'
    if (character === '>') return '&gt;'
    if (character === '&') return '&amp;'
    if (character === "'") return '&apos;'
    return '&quot;'
  })
}

function createRoutePath(style: string) {
  return style === 'Shield + pulse'
    ? 'M34 49h10l6-12 8 25 6-13h8'
    : style === 'Shield + link'
      ? 'M31 39l-5 5a8 8 0 0 0 11 11l5-5m-9-9 10-10a8 8 0 0 1 11 11l-5 5'
      : 'M34 49h10l6-12 8 25 6-13h8'
}

function createLogoSvg(color: string, text: string, style: string) {
  const route = createRoutePath(style)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 96"><rect width="96" height="96" rx="27" fill="${color}"/><path d="M48 13 74 24v20c0 18-11 32-26 40-15-8-26-22-26-40V24l26-11Z" fill="#101b2b"/><path d="${route}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/><text x="116" y="61" fill="#edf4ff" font-family="Arial,sans-serif" font-size="35" font-weight="700">${escapeXml(text || 'SupplyShield')}</text></svg>`
}

function createLogoMarkSvg(color: string, style: string) {
  const route = createRoutePath(style)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="27" fill="${color}"/><path d="M48 13 74 24v20c0 18-11 32-26 40-15-8-26-22-26-40V24l26-11Z" fill="#101b2b"/><path d="${route}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/></svg>`
}

function makeDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Logo({ small = false }: { small?: boolean }) {
  return <div className={`brand-lockup ${small ? 'brand-lockup-small' : ''}`}>
    <img src="/supplyshield-mark.svg" alt="" className="brand-mark" />
    {!small && <span className="brand-name">supply<span>shield</span><i>.</i></span>}
  </div>
}

function TrendChart({ values }: { values: number[] }) {
  if (!values.length) return <div className="chart-empty">Add shipment records to display risk scores.</div>
  const points = values.map((value, index) => `${values.length === 1 ? 360 : (index / (values.length - 1)) * 720},${180 - value * 1.65}`).join(' ')
  const area = `0,180 ${points} 720,180`
  return <div className="chart-wrap">
    <div className="chart-labels"><span>80</span><span>60</span><span>40</span><span>20</span></div>
    <svg className="trend-chart" viewBox="0 0 720 190" preserveAspectRatio="none" role="img" aria-label="Current shipment risk scores from the database">
      <defs>
        <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9cc94c" stopOpacity=".25" />
          <stop offset="100%" stopColor="#9cc94c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[15, 65, 115, 165].map(y => <line key={y} x1="0" x2="720" y1={y} y2={y} className="chart-grid" />)}
      <polygon points={area} fill="url(#area-fill)" />
      <polyline points={points} fill="none" stroke="#709b39" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={values.length === 1 ? 360 : 720} cy={180 - values[values.length - 1] * 1.65} r="5" fill="#709b39" stroke="white" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="chart-dates"><span>Lower risk</span><span>Current shipment records</span><span>Higher risk</span></div>
  </div>
}

function SeverityIcon({ kind }: { kind: Alert['icon'] }) {
  if (kind === 'box') return <Box size={17} />
  if (kind === 'cloud') return <Cloud size={17} />
  return <Truck size={17} />
}

function App() {
  const [section, setSection] = useState<Section>('Overview')
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [riskOnlyHigh, setRiskOnlyHigh] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertRecords, setAlertRecords] = useState<Alert[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([])
  const [demoMode, setDemoMode] = useState(true)
  const [apiError, setApiError] = useState('')
  const [toast, setToast] = useState('')
  const [logoColor, setLogoColor] = useState('#66d9e8')
  const [logoText, setLogoText] = useState('SupplyShield')
  const [logoStyle, setLogoStyle] = useState('Shield + route')

  function exportReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      source: 'Current workspace records only; no external dataset used.',
      shipments,
      suppliers,
      inventoryItems,
      returns: returnRequests,
      alerts: alertRecords,
    }
    makeDownload('supplyshield-report.json', new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    setToast('Workspace report downloaded.')
  }

  async function loadWorkspace() {
    try {
      const [shipmentData, inventoryData, supplierData, returnData, alertData] = await Promise.all([
        apiJson<Shipment[]>('/api/shipments'),
        apiJson<InventoryItem[]>('/api/inventory'),
        apiJson<Supplier[]>('/api/suppliers'),
        apiJson<ReturnRequest[]>('/api/returns'),
        apiJson<Alert[]>('/api/alerts'),
      ])
      if (![shipmentData, inventoryData, supplierData, returnData, alertData].some(records => records.length > 0)) {
        const demo = createDemoWorkspace()
        setShipments(demo.shipments)
        setInventoryItems(demo.inventoryItems)
        setSuppliers(demo.suppliers)
        setReturnRequests(demo.returnRequests)
        setAlertRecords(demo.alerts)
        setAlerts(demo.alerts)
        setDemoMode(true)
      } else {
        setShipments(shipmentData)
        setAlerts(alertData.filter(alert => !alert.acknowledged))
        setAlertRecords(alertData)
        setInventoryItems(inventoryData)
        setSuppliers(supplierData)
        setReturnRequests(returnData)
        setDemoMode(false)
      }
      setApiError('')
    } catch (error) {
      const demo = createDemoWorkspace()
      setShipments(demo.shipments)
      setInventoryItems(demo.inventoryItems)
      setSuppliers(demo.suppliers)
      setReturnRequests(demo.returnRequests)
      setAlertRecords(demo.alerts)
      setAlerts(demo.alerts)
      setDemoMode(true)
      throw error
    }
  }

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        await loadWorkspace()
      } catch (error) {
        if (active) setApiError(error instanceof Error ? error.message : 'Could not load workspace records.')
      }
    }
    void initialize()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function closeSearch(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setSearchTerm('')
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', closeSearch)
    return () => window.removeEventListener('keydown', closeSearch)
  }, [])

  const filteredShipments = useMemo(() => shipments.filter(item =>
    `${item.id} ${item.supplier} ${item.route} ${item.carrier}`.toLowerCase().includes(query.toLowerCase())), [shipments, query])
  const searchResults = useMemo(() => {
    const value = searchTerm.trim().toLowerCase()
    if (!value) return []
    const terms = value.split(/\s+/).filter(term => !['when', 'i', 'type', 'and', 'also', 'open', 'show', 'find', 'search', 'page', 'please', 'to', 'the', 'go', 'view'].includes(term))
    const results: SearchResult[] = sections.flatMap(item => {
      const searchableLabel = `${item.label} ${sectionSearchAliases[item.label] ?? ''}`.toLowerCase()
      const matchesLabel = searchableLabel.includes(value) || (terms.length > 0 && terms.every(term => searchableLabel.includes(term)))
      return matchesLabel ? [{ id: `page-${item.label}`, title: item.label, detail: `${item.group} · Open this section`, kind: 'Page', section: item.label, filter: '' }] : []
    })
    shipments.forEach(item => {
      if (`${item.id} ${item.supplier} ${item.route} ${item.carrier} ${item.status}`.toLowerCase().includes(value)) {
        results.push({ id: `shipment-${item.id}`, title: item.id, detail: `${item.route} · ${item.status} · entered score ${item.risk}/100`, kind: 'Shipment', section: 'Shipments', filter: item.id })
      }
    })
    suppliers.forEach(item => {
      if (`${item.id} ${item.name} ${item.initials}`.toLowerCase().includes(value)) {
        results.push({ id: `supplier-${item.id}`, title: item.name, detail: `Supplier · reliability ${item.score}/100 · on time ${item.onTime}`, kind: 'Supplier', section: 'Supplier Network', filter: item.name })
      }
    })
    inventoryItems.forEach(item => {
      if (`${item.id} ${item.item} ${item.detail} ${(item.suppliers ?? []).join(' ')}`.toLowerCase().includes(value)) {
        results.push({ id: `inventory-${item.id}`, title: item.item, detail: `Inventory · ${item.detail} · ${item.status}`, kind: 'Inventory', section: 'Inventory', filter: item.item })
      }
    })
    alertRecords.forEach(item => {
      if (`${item.id} ${item.title} ${item.description} ${item.severity}`.toLowerCase().includes(value)) {
        results.push({ id: `alert-${item.id}`, title: item.title, detail: `Alert · ${item.severity} · ${item.description}`, kind: 'Alert', section: 'Alerts', filter: item.title })
      }
    })
    returnRequests.forEach(item => {
      if (`${item.id} ${item.product} ${item.supplier} ${item.rating}`.toLowerCase().includes(value)) {
        results.push({ id: `return-${item.id}`, title: item.product, detail: `Return · ${item.supplier} · ${item.rating}`, kind: 'Return', section: 'Returns', filter: item.product })
      }
    })
    return results.slice(0, 8)
  }, [searchTerm, shipments, suppliers, inventoryItems, alertRecords, returnRequests])
  const activeAlerts = alerts.length
  const title = section === 'Overview' ? 'Supply chain overview' : section
  const description = section === 'Overview'
    ? 'Detect early. Understand exposure. Decide with the records you have.'
    : section === 'Branding'
      ? 'Make the SupplyShield mark your own.'
      : section === 'Live Tracking'
        ? 'Review shipment routes from workspace records. No live GPS feed is connected.'
        : section === 'Risk Prediction'
          ? 'Review shipment risk scores and bands.'
          : section === 'Disruption Intelligence'
            ? 'See recorded alerts and operational signals without filling in missing data.'
            : section === 'AI Recovery Planner'
              ? 'Compare existing supplier records for shipments that need review.'
              : section === 'AI Assistant'
                ? 'Ask for a quick summary of the records in this workspace.'
                : section === 'Reports & Analytics'
                  ? 'Explore shipment, supplier, and inventory values currently on file.'
                  : `Monitor and manage your ${section.toLowerCase()} across the network.`

  async function acknowledge(alertId: string, acknowledged: boolean) {
    if (demoMode) {
      const updatedAlerts = alertRecords.map(alert => alert.id === alertId ? { ...alert, acknowledged } : alert)
      setAlertRecords(updatedAlerts)
      setAlerts(updatedAlerts.filter(alert => !alert.acknowledged))
      setToast(acknowledged ? 'Demo alert marked resolved. This change is temporary.' : 'Demo alert reopened. This change is temporary.')
      return
    }
    try {
      await apiRequest(`/api/alerts/${encodeURIComponent(alertId)}/acknowledge`, { method: 'PATCH', body: JSON.stringify({ acknowledged }) })
      await loadWorkspace()
      setToast(acknowledged ? 'Alert marked resolved.' : 'Alert reopened.')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not acknowledge the alert.')
    }
  }

  function openSearchResult(result: SearchResult) {
    setSection(result.section)
    setQuery(result.filter)
    setRiskOnlyHigh(false)
    setSearchOpen(false)
    setSearchTerm('')
    setSidebarOpen(false)
  }

  function downloadLogo(format: 'svg' | 'png' | 'ico') {
    const svg = createLogoSvg(logoColor, logoText, logoStyle)
    if (format === 'svg') {
      makeDownload('supplyshield-logo.svg', new Blob([svg], { type: 'image/svg+xml' }))
      setToast('Your SVG logo is ready to use.')
      return
    }
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const iconOnly = format === 'ico'
      canvas.width = iconOnly ? 256 : 720
      canvas.height = iconOnly ? 256 : 192
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(async png => {
        if (!png) {
          setToast('Could not generate the logo. Please try SVG instead.')
          return
        }
        if (format === 'png') {
          makeDownload('supplyshield-logo.png', png)
        } else {
          const pngBytes = new Uint8Array(await png.arrayBuffer())
          const ico = new ArrayBuffer(22 + pngBytes.length)
          const view = new DataView(ico)
          view.setUint16(0, 0, true)
          view.setUint16(2, 1, true)
          view.setUint16(4, 1, true)
          view.setUint8(6, 0)
          view.setUint8(7, 0)
          view.setUint8(8, 0)
          view.setUint8(9, 0)
          view.setUint16(10, 1, true)
          view.setUint16(12, 32, true)
          view.setUint32(14, pngBytes.length, true)
          view.setUint32(18, 22, true)
          new Uint8Array(ico, 22).set(pngBytes)
          makeDownload('supplyshield-favicon.ico', new Blob([ico], { type: 'image/x-icon' }))
        }
        setToast(`Your ${format.toUpperCase()} logo is ready to use.`)
      }, 'image/png')
    }
    image.onerror = () => setToast('Could not generate the logo. Please try SVG instead.')
    const svgForImage = format === 'ico' ? createLogoMarkSvg(logoColor, logoStyle) : svg
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgForImage)}`
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand-row"><Logo /><button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">S</span><span className="workspace-meta"><strong>SupplyShield</strong><small>Operations workspace</small></span></div>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {(['OPERATIONS', 'INTELLIGENCE', 'WORKSPACE'] as const).map(group => <div className="nav-group" key={group}>
          <p className="nav-heading">{group}</p>
          {sections.filter(item => item.group === group).map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${section === item.label ? 'nav-active' : ''}`} onClick={() => { setSection(item.label); setRiskOnlyHigh(false); setSidebarOpen(false) }}>
              <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
              {item.label === 'Alerts' && <span className="nav-count">{activeAlerts}</span>}
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card">
          <div className="plan-icon"><Sparkles size={16} /></div>
          <strong>Supply chain, in sync.</strong>
          <p>Make every decision with a clearer picture.</p>
          <button onClick={() => setSection('Reports & Analytics')}>View reports <ArrowRight size={14} /></button>
          <div className="plan-orb orb-one" /><div className="plan-orb orb-two" />
        </div>
        <button className="nav-item support-item" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /><span>Help & support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">S</div><div className="profile-meta"><strong>Workspace user</strong><small>No sign-in required</small></div></div>
      </div>
    </aside>

    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{section}</strong></div></div>
        <div className="topbar-actions">
          <div className={`data-status ${apiError ? 'demo' : 'connected'}`}><span className="status-dot" />{demoMode ? 'Demo data' : apiError ? 'Database unavailable' : 'MongoDB connected'}</div>
          <button className="topbar-icon" aria-label="Search workspace" title="Search workspace (Ctrl+K)" aria-expanded={searchOpen} aria-controls="global-search-dialog" onClick={() => { setSearchOpen(open => !open); setSearchTerm('') }}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label={`${activeAlerts} notifications`} onClick={() => setSection('Alerts')}><Bell size={19} />{activeAlerts > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">S</div>
        </div>
      </header>
      {searchOpen && <>
        <button className="search-scrim" type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setSearchTerm('') }} />
        <section className="global-search-panel" id="global-search-dialog" role="dialog" aria-label="Search workspace records">
          <div className="global-search"><Search size={17} /><input autoFocus aria-label="Search workspace records" placeholder="Search shipments, suppliers, inventory, alerts, or returns..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && searchResults[0]) openSearchResult(searchResults[0]) }} /><kbd>ESC</kbd><button className="icon-btn" onClick={() => { setSearchOpen(false); setSearchTerm('') }} aria-label="Close search"><X size={16} /></button></div>
          <div className="global-search-results">
            {!searchTerm.trim() ? <div className="search-empty"><Search size={17} /><span>Search across shipments, suppliers, inventory, alerts, and returns.</span><small>Press Ctrl+K anytime to open search.</small></div> : searchResults.length ? searchResults.map(result => <button type="button" className="global-search-result" key={result.id} onClick={() => openSearchResult(result)}><span className="search-result-icon"><Search size={15} /></span><span className="search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span><span className="search-result-kind">{result.kind}</span><ChevronRight size={15} /></button>) : <div className="search-empty"><Search size={17} /><span>No matching workspace records.</span><small>Try a shipment ID, supplier name, product, or alert title.</small></div>}
          </div>
        </section>
      </>}

      <div className="content">
        {demoMode && <div className="demo-banner" role="status"><Sparkles size={16} /><span><strong>Demo workspace</strong> — five sample inventory items, suppliers, shipments, and returns are shown for preview. This generated data is not saved to MongoDB.</span></div>}
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> SUPPLY CHAIN · WORKSPACE</div><h1>{title}<span className="wave">✳</span></h1><p>{description}</p></div>
          <div className="heading-actions"><button className="button button-outline" onClick={exportReport}><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => setSection('Shipments')}><Plus size={17} /> Manage shipments</button></div>
        </div>
        {query && <button className="active-search-filter" onClick={() => setQuery('')}><span>Filtered by</span><strong>{query}</strong><X size={13} /><span>Clear</span></button>}

        {section === 'Branding' ? <section className="branding-layout">
          <div className="panel brand-editor">
            <div className="panel-heading"><div><h2>Logo studio</h2><p>Build a simple, memorable mark for your workspace.</p></div><span className="tool-pill"><Sparkles size={14} /> In-memory</span></div>
            <label className="field-label" htmlFor="brand-name">Brand name</label><input id="brand-name" className="text-field" value={logoText} maxLength={24} onChange={event => setLogoText(event.target.value)} />
            <label className="field-label" htmlFor="brand-style">Mark style</label><select id="brand-style" className="text-field" value={logoStyle} onChange={event => setLogoStyle(event.target.value)}><option>Shield + route</option><option>Shield + pulse</option><option>Shield + link</option></select>
            <p className="field-label color-label">Brand color</p><div className="swatch-list">{['#4c8fff', '#66d9e8', '#a879ff', '#48d597', '#f5b856'].map(color => <button key={color} aria-label={`Set brand color ${color}`} className={`color-swatch ${logoColor === color ? 'swatch-selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setLogoColor(color)} />)}</div>
            <div className="download-row"><button className="button button-dark" onClick={() => downloadLogo('svg')}><Download size={16} /> Download SVG</button><button className="button button-outline" onClick={() => downloadLogo('png')}><Download size={16} /> Download PNG</button><button className="button button-outline" onClick={() => downloadLogo('ico')}><Download size={16} /> Download ICO</button></div>
            <p className="privacy-note"><ShieldCheck size={15} /> Generated in your browser. No files are stored on a server.</p>
          </div>
          <div className="panel brand-preview-panel"><div className="panel-heading"><div><h2>Live preview</h2><p>Your updated mark, in context.</p></div><span className="preview-live"><i /> LIVE</span></div>
            <div className="brand-preview"><img className="custom-logo-preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(createLogoSvg(logoColor, logoText, logoStyle))}`} alt={`${logoText || 'SupplyShield'} logo preview`} /><p>Clear signals. Confident decisions.</p></div>
            <div className="preview-footer"><span><span className="preview-dot" /> {logoStyle}</span><span>360 × 96 px</span></div>
          </div>
        </section> : section !== 'Overview' ? <section className="panel module-panel">
          <div className="panel-heading"><div><h2>{section === 'Live Tracking' ? 'Route monitoring' : section === 'Risk Prediction' ? 'Recorded shipment risk' : section === 'AI Recovery Planner' ? 'Recovery options to review' : section === 'Reports & Analytics' ? 'Workspace analytics' : section === 'AI Assistant' ? 'Operations assistant' : `${section} overview`}</h2>{!['Risk Prediction', 'Alerts', 'Disruption Intelligence', 'AI Recovery Planner', 'AI Assistant'].includes(section) && <p>{section === 'Returns'
            ? 'Track return request and completion dates. Best = before deadline · Good = deadline date · Poor = after deadline.'
            : section === 'Live Tracking'
              ? 'Route labels only. This workspace has no coordinates or live carrier feed.'
              : section === 'Risk Prediction'
                ? 'Bands summarize manually entered scores; no model probabilities are available.'
                : section === 'Disruption Intelligence'
                  ? 'Counts come from alert text and inventory status currently stored in this workspace.'
                  : section === 'AI Recovery Planner'
                    ? 'Supplier reliability is entered data. Confirm capacity and price before making a change.'
                    : section === 'AI Assistant'
                      ? 'Local, rules-based summaries of workspace records. No AI service is connected.'
                      : section === 'Reports & Analytics'
                        ? 'Charts use current workspace records only; no historical dataset is loaded.'
                        : ['Shipments', 'Inventory', 'Supplier Network', 'Alerts'].includes(section)
                          ? demoMode ? 'Read-only sample records are shown because no saved workspace records are available.' : 'Records are saved in MongoDB.'
                          : 'Review workspace data and configuration.'}</p>}</div></div>
          {section === 'Live Tracking' ? <RoutePanel shipments={shipments} onView={id => { setSection('Shipments'); setQuery(id) }} /> :
            section === 'Risk Prediction' ? <RiskMonitorPanel shipments={shipments} highRiskOnly={riskOnlyHigh} onClearHighRisk={() => setRiskOnlyHigh(false)} onReview={id => { setSection('Shipments'); setQuery(id) }} /> :
              section === 'Disruption Intelligence' ? <DisruptionPanel alerts={alertRecords} inventoryItems={inventoryItems} onAcknowledge={acknowledge} onOpenSection={destination => { setSection(destination); setQuery('') }} /> :
                section === 'AI Recovery Planner' ? <RecoveryPlannerPanel shipments={shipments} suppliers={suppliers} onReview={id => { setSection('Shipments'); setQuery(id) }} /> :
                  section === 'Reports & Analytics' ? <AnalyticsPanel shipments={shipments} inventoryItems={inventoryItems} suppliers={suppliers} onExport={exportReport} /> :
                    section === 'AI Assistant' ? <AssistantPanel shipments={shipments} inventoryItems={inventoryItems} suppliers={suppliers} alerts={alertRecords} /> :
                      section === 'Alerts' ? <RecordManager kind="alerts" records={alertRecords} demoMode={demoMode} searchQuery={query} onChanged={loadWorkspace} onAcknowledge={acknowledge} /> :
                        section === 'Shipments' ? <RecordManager kind="shipments" records={shipments} demoMode={demoMode} suppliers={suppliers} searchQuery={query} onChanged={loadWorkspace} onDemoShipmentAdd={shipment => setShipments(current => [shipment, ...current])} onDemoShipmentChange={shipment => setShipments(current => current.map(item => item.id === shipment.id ? shipment : item))} onNotify={setToast} /> :
                          section === 'Inventory' ? <RecordManager kind="inventory" records={inventoryItems} demoMode={demoMode} suppliers={suppliers} shipments={shipments} searchQuery={query} onChanged={loadWorkspace} onDemoInventoryChange={item => setInventoryItems(current => current.map(existing => existing.id === item.id ? item : existing))} onNotify={setToast} /> :
                          section === 'Supplier Network' ? <RecordManager kind="suppliers" records={suppliers} demoMode={demoMode} returnRequests={returnRequests} searchQuery={query} onChanged={loadWorkspace} onDemoSupplierAdd={supplier => setSuppliers(current => [...current, supplier])} onNotify={setToast} /> :
                              section === 'Returns' ? <RecordManager kind="returns" records={returnRequests} demoMode={demoMode} suppliers={suppliers} inventoryItems={inventoryItems} searchQuery={query} onChanged={loadWorkspace} /> :
                                section === 'What-if Simulator' ? <WhatIfPanel items={inventoryItems} /> : <ModelDataPanel />}
        </section> : <>
          <section className="metric-grid" aria-label="Supply chain metrics">
            <MetricCard title="Total shipments" value={String(shipments.length)} change="current records" positive caption="all routes" icon={<Truck size={18} />} actionLabel="View shipments" onClick={() => { setSection('Shipments'); setQuery(''); setRiskOnlyHigh(false) }} />
            <MetricCard title="Delayed shipments" value={String(shipments.filter(item => item.status === 'Delayed').length)} change="current status" positive={false} caption="review routes" icon={<Clock3 size={18} />} actionLabel="Review delayed" onClick={() => { setSection('Shipments'); setQuery('Delayed'); setRiskOnlyHigh(false) }} />
            <MetricCard title="High-risk shipments" value={String(shipments.filter(item => item.risk >= 70).length)} change="entered score ≥70" positive={false} caption="not a prediction" icon={<Activity size={18} />} actionLabel="Review high-risk" onClick={() => { setSection('Risk Prediction'); setQuery(''); setRiskOnlyHigh(true) }} />
            <MetricCard title="Average entered risk" value={shipments.length ? (shipments.reduce((sum, item) => sum + item.risk, 0) / shipments.length).toFixed(0) : '—'} suffix="/100" change="current scores" positive={false} caption="manual values" icon={<ShieldCheck size={18} />} actionLabel="View risk bands" onClick={() => { setSection('Risk Prediction'); setQuery(''); setRiskOnlyHigh(false) }} />
          </section>
          <section className="dashboard-grid">
            <div className="panel risk-panel">
              <div className="panel-heading chart-heading"><div><div className="title-with-info"><h2>Operational risk profile</h2><button className="info-button" aria-label="Risk score information" title="These are manually entered scores, not generated predictions." onClick={() => setToast('Risk values are entered on shipment records. No prediction model or probability is connected.')}><CircleHelp size={15} /></button></div><p>Current shipment scores, in workspace order</p></div><span className="tool-pill">{shipments.length} records</span></div>
              <div className="risk-summary"><div><span className="summary-number">{shipments.filter(shipmentNeedsReview).length}</span><span className="summary-label">shipments flagged for review</span></div><button className="text-link" onClick={() => setSection('Risk Prediction')}>Review risk bands <ArrowRight size={14} /></button></div>
              <TrendChart values={shipments.slice(0, 24).map(item => item.risk)} />
              <div className="chart-legend"><span><i className="legend-line" /> Entered risk score</span><span className="chart-note">No prediction model connected</span></div>
            </div>
            <div className="panel status-panel">
              <div className="panel-heading"><div><h2>Shipment status</h2><p>Current records by entered status</p></div><span className="tool-pill">{shipments.length} total</span></div>
              <ShipmentStatusChart shipments={shipments} />
              <div className="status-panel-footer"><span>On track and delayed labels reflect saved records.</span><button className="text-link" onClick={() => setSection('Shipments')}>Open shipments <ArrowRight size={14} /></button></div>
            </div>
          </section>
          <section className="dashboard-grid tracking-dashboard-grid">
            <div className="panel route-dashboard-panel">
              <div className="panel-heading"><div><h2>Network route monitor</h2><p>Route text from shipment records · schematic view</p></div><button className="text-link" onClick={() => setSection('Live Tracking')}>Open tracking <ArrowRight size={14} /></button></div>
              <RoutePanel shipments={shipments.slice(0, 3)} onView={id => { setSection('Shipments'); setQuery(id) }} compact />
            </div>
            <div className="panel alerts-panel">
              <div className="panel-heading"><div><h2>Needs attention <span className="heading-count">{activeAlerts}</span></h2><p>Active workspace alerts</p></div><button className="text-link" onClick={() => setSection('Alerts')}>View all <ArrowRight size={14} /></button></div>
              <AlertList alerts={alertRecords.slice(0, 3)} onAcknowledge={acknowledge} compact />
              <button className="all-alerts-button" onClick={() => setSection('Disruption Intelligence')}>Open disruption intelligence <ArrowRight size={15} /></button>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel shipments-panel">
              <div className="panel-heading"><div><div className="title-with-info"><h2>Recent shipments</h2><span className="table-count">{shipments.length} records</span></div><p>Current shipment entries across all routes</p></div><button className="text-link" onClick={() => setSection('Shipments')}>All shipments <ArrowRight size={14} /></button></div>
              <ShipmentTable shipments={filteredShipments.slice(0, 4)} onView={id => { setSection('Shipments'); setQuery(id) }} />
            </div>
            <div className="panel inventory-panel">
              <div className="panel-heading"><div><h2>Inventory watchlist</h2><p>Items nearing safety stock</p></div><button className="text-link" onClick={() => setSection('Inventory')}>View all <ArrowRight size={14} /></button></div>
              <div className="inventory-list">{inventoryItems.slice(0, 3).map((item, index) => <div className="inventory-item" key={item.id}>
                <div className={`inventory-glyph glyph-${index}`}><Box size={16} /></div>
                <div className="inventory-info"><div className="inventory-name">{item.item}</div><div className="inventory-location">{item.detail}</div></div>
                <div className="inventory-cover"><strong>{item.cover ?? '—'}</strong><span>days</span><span className={`mini-status ${item.status.toLowerCase()}`}>{item.status}</span></div>
              </div>)}</div>
              <div className="inventory-foot"><span>{inventoryItems.length} inventory records</span><button onClick={() => setSection('Inventory')}>Review inventory <ArrowRight size={14} /></button></div>
            </div>
            <div className="panel supplier-health-panel">
              <div className="panel-heading"><div><h2>Supplier performance</h2><p>Entered reliability scores</p></div><button className="text-link" onClick={() => setSection('Supplier Network')}>View all <ArrowRight size={14} /></button></div>
              <SupplierHealthList suppliers={suppliers.slice().sort((a, b) => b.score - a.score).slice(0, 4)} />
              <div className="supplier-panel-foot">Scores and service rates are workspace entries.</div>
            </div>
          </section>
          <div className="footer-note"><ShieldCheck size={15} /><span>Decision support, not automated action.</span><span className="footer-divider">·</span><span>Risk values are manually entered; no prediction model is connected.</span><button onClick={() => setToast('MongoDB stores records entered in this open workspace.')}>About this workspace</button></div>
        </>}
      </div>
    </main>
    {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false) }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="panel-heading"><div><h2 id="help-title">SupplyShield help</h2><p>Using this workspace</p></div><button className="icon-btn" type="button" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={17} /></button></div>
        <ul>
          <li>Use the sidebar to review shipments, inventory, suppliers, alerts, and scenario tools.</li>
          <li>On the Shipments page, use <strong>Find alternative</strong> on at-risk or delayed shipments to compare suppliers already entered in this workspace.</li>
          <li>Switching suppliers updates the shipment record. Verify availability and delivery capability directly with the supplier; ETA and risk values are not automatically recalculated.</li>
          <li>Sample records are synthetic previews only. Live records are stored in MongoDB; no external dataset is loaded.</li>
        </ul>
        <button className="button button-dark" type="button" onClick={() => { setHelpOpen(false); setSection('Shipments') }}>Open shipments <ArrowRight size={14} /></button>
      </section>
    </div>}
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}

function MetricCard({ title, value, suffix, change, positive, caption, icon, actionLabel, onClick }: {
  title: string; value: string; suffix?: string; change: string; positive: boolean; caption: string; icon: ReactNode; actionLabel?: string; onClick?: () => void
}) {
  const content = <>
    <div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon">{icon}</span></div>
    <div className="metric-value">{value}<span>{suffix}</span></div>
    <div className="metric-bottom"><span className={`metric-change ${positive ? 'change-positive' : 'change-negative'}`}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span className="metric-caption">{caption}</span></div>
    {actionLabel && <span className="metric-action-label">{actionLabel}<ArrowRight size={12} /></span>}
  </>
  return onClick
    ? <article role="button" tabIndex={0} aria-label={`${title}: ${value}${suffix ?? ''}. ${actionLabel ?? 'Open details'}`} className="panel metric-card metric-card-button" onClick={onClick} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick() } }}>{content}</article>
    : <article className="panel metric-card">{content}</article>
}

function AlertList({ alerts, onAcknowledge, compact = false, disabled = false, onSelect }: { alerts: Alert[]; onAcknowledge: (id: string, acknowledged: boolean) => void; compact?: boolean; disabled?: boolean; onSelect?: (alert: Alert) => void }) {
  if (!alerts.length) return <div className="empty-alerts"><ShieldCheck size={20} /><strong>All caught up</strong><span>No active alerts need attention.</span></div>
  return <div className={`alert-list ${compact ? 'alert-list-compact' : ''}`}>{alerts.map(alert => <article className={`alert-item ${alert.acknowledged ? 'alert-item-resolved' : ''}`} key={alert.id}>
    <div className={`alert-icon alert-${alert.severity.toLowerCase()}`}><SeverityIcon kind={alert.icon} /></div>
    <div className="alert-copy"><div className="alert-title-row">{onSelect ? <button type="button" className="alert-detail-link" onClick={() => onSelect(alert)}>{alert.title}</button> : <strong>{alert.title}</strong>}<span className={`severity-pill severity-${alert.acknowledged ? 'resolved' : alert.severity.toLowerCase()}`}>{alert.acknowledged ? 'Resolved' : alert.severity}</span></div><p>{alert.description}</p><span className="alert-time"><Clock3 size={12} />{alert.time}</span></div>
    <label className={`alert-ack-control ${alert.acknowledged ? 'alert-ack-checked' : ''}`} title={alert.acknowledged ? 'Uncheck to reopen this alert' : 'Check to mark this alert resolved'}>
      <input type="checkbox" checked={Boolean(alert.acknowledged)} disabled={disabled} aria-label={alert.acknowledged ? `Reopen ${alert.title}` : `Mark ${alert.title} resolved`} onChange={event => onAcknowledge(alert.id, event.currentTarget.checked)} />
      <span className="alert-ack-box"><Check size={14} /></span>
    </label>
    {onSelect && <button type="button" className="alert-detail-action" aria-label={`Open details for ${alert.title}`} title="Open alert details" onClick={() => onSelect(alert)}><ChevronRight size={17} /></button>}
  </article>)}</div>
}

function ShipmentTable({ shipments, onView }: { shipments: Shipment[]; onView: (id: string) => void }) {
  if (!shipments.length) return <div className="empty-state"><Search size={21} /><strong>No shipment records</strong><span>Add shipments from the Shipments page.</span></div>
  return <div className="table-scroll"><table className="shipment-table"><thead><tr><th>SHIPMENT</th><th>ROUTE / CARRIER</th><th>ETA</th><th>STATUS</th><th>RISK</th><th aria-label="Actions" /></tr></thead><tbody>
    {shipments.map(shipment => <tr key={shipment.id} onClick={() => onView(shipment.id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onView(shipment.id) }}>
      <td><div className="shipment-identity"><span className={`supplier-avatar avatar-${shipment.tone}`}>{shipment.initials}</span><span><strong>{shipment.id}</strong><small>{shipment.supplier}</small></span></div></td>
      <td><div className="route-text">{shipment.route}</div><small className="carrier-text">{shipment.carrier}</small></td>
      <td className="eta-text">{formatRecordDate(shipment.eta)}</td>
      <td><span className={`shipment-status status-${shipment.status.toLowerCase().replace(' ', '-')}`}><i />{shipment.status}</span></td>
      <td><div className="risk-cell"><div className="risk-track"><span style={{ width: `${shipment.risk}%` }} className={shipment.risk > 70 ? 'risk-high' : shipment.risk > 35 ? 'risk-medium' : 'risk-low'} /></div><strong>{shipment.risk}%</strong></div></td>
      <td><button className="row-action" aria-label={`View ${shipment.id}`} onClick={event => { event.stopPropagation(); onView(shipment.id) }}><ChevronRight size={16} /></button></td>
    </tr>)}
  </tbody></table></div>
}

function ShipmentStatusChart({ shipments }: { shipments: Shipment[] }) {
  const statuses: { label: Shipment['status']; className: string }[] = [
    { label: 'On track', className: 'status-chart-track' },
    { label: 'At risk', className: 'status-chart-risk' },
    { label: 'Delayed', className: 'status-chart-delayed' },
  ]
  return <div className="status-chart">
    {statuses.map(status => {
      const count = shipments.filter(shipment => shipment.status === status.label).length
      const percentage = shipments.length ? Math.round((count / shipments.length) * 100) : 0
      return <div className="status-chart-row" key={status.label}>
        <div className="status-chart-label"><span className={`status-chart-dot ${status.className}`} /><strong>{status.label}</strong><span>{count}</span></div>
        <div className="status-chart-track"><span className={status.className} style={{ width: `${percentage}%` }} /></div>
        <small>{percentage}%</small>
      </div>
    })}
    {!shipments.length && <p className="chart-empty">Add shipment records to see current status totals.</p>}
  </div>
}

function RoutePanel({ shipments, onView, compact = false }: { shipments: Shipment[]; onView: (id: string) => void; compact?: boolean }) {
  if (!shipments.length) return <div className="empty-state"><Truck size={21} /><strong>No shipment routes recorded</strong><span>Add route names on the Shipments page.</span></div>
  const routeNodes = [
    { x: 70, y: 112 }, { x: 180, y: 42 }, { x: 290, y: 135 }, { x: 405, y: 62 },
    { x: 520, y: 144 }, { x: 650, y: 58 }, { x: 748, y: 121 }, { x: 350, y: 191 },
  ]
  return <div className={`route-panel ${compact ? 'route-panel-compact' : ''}`}>
    <div className="route-disclaimer"><span className="route-signal"><Activity size={14} /> ROUTE SCHEMATIC</span><span>No coordinates or live GPS feed</span></div>
    {!compact && <div className="route-map-canvas">
      <div className="route-map-caption">SIMULATED POSITIONS · ILLUSTRATIVE LAYOUT, NOT GPS</div>
      <svg viewBox="0 0 800 230" role="img" aria-label="Illustrative shipment route schematic with simulated markers, not GPS positions">
        <defs><pattern id="route-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#355171" /></pattern></defs>
        <rect width="800" height="230" rx="12" fill="url(#route-dots)" />
        {shipments.map((shipment, index) => {
          const start = routeNodes[index % routeNodes.length]
          const end = routeNodes[(index + 3) % routeNodes.length]
          const marker = { x: start.x + (end.x - start.x) * 0.58, y: start.y + (end.y - start.y) * 0.58 }
          return <g key={shipment.id} className="route-map-shipment" role="button" tabIndex={0} aria-label={`Open ${shipment.id}; simulated marker, not GPS`} onClick={() => onView(shipment.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onView(shipment.id) } }}>
            <title>{shipment.id}: simulated route marker, not GPS</title>
            <path className="route-map-line" d={`M ${start.x} ${start.y} Q ${(start.x + end.x) / 2} ${(start.y + end.y) / 2 - 28} ${end.x} ${end.y}`} />
            <circle className="route-map-hub" cx={start.x} cy={start.y} r="4" />
            <circle className="route-map-hub" cx={end.x} cy={end.y} r="4" />
            <circle className={`route-map-pulse map-${shipment.status.toLowerCase().replace(' ', '-')}`} cx={marker.x} cy={marker.y} r="10" />
            <circle className={`route-map-marker map-${shipment.status.toLowerCase().replace(' ', '-')}`} cx={marker.x} cy={marker.y} r="4" />
          </g>
        })}
      </svg>
      <div className="route-map-key"><span><i /> Marker positions are simulated for layout only</span><span>Click a route marker to open its shipment record</span></div>
    </div>}
    <div className="route-list">{shipments.map(shipment => {
      const points = shipment.route.split('→').map(point => point.trim())
      const origin = points[0] || shipment.route
      const destination = points[1] || 'Destination not recorded'
      return <article className="route-row" key={shipment.id}>
        <div className="route-row-main"><span className={`route-status-dot route-${shipment.status.toLowerCase().replace(' ', '-')}`} /><div className="route-row-copy"><strong>{shipment.id}</strong><span>{shipment.carrier}</span></div><span className={`shipment-status status-${shipment.status.toLowerCase().replace(' ', '-')}`}><i />{shipment.status}</span></div>
        <div className="route-lane">
          <div className="route-endpoint"><span>ORIGIN</span><strong className="route-point-label" title={origin}>{origin}</strong></div>
          <span className="route-line" aria-hidden="true"><ArrowRight size={16} /></span>
          <div className="route-endpoint route-endpoint-destination"><span>DESTINATION</span><strong className="route-point-label" title={destination}>{destination}</strong></div>
          <button className="row-action" aria-label={`Open ${shipment.id}`} onClick={() => onView(shipment.id)}><ChevronRight size={16} /></button>
        </div>
      </article>
    })}</div>
    {!compact && <p className="route-footnote">The line connects the route names entered on each shipment. It does not show a geographic position, progress, or estimated arrival.</p>}
  </div>
}

function riskBand(score: number) {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Medium'
  return 'Low'
}

function RiskMonitorPanel({ shipments, highRiskOnly = false, onClearHighRisk, onReview }: { shipments: Shipment[]; highRiskOnly?: boolean; onClearHighRisk: () => void; onReview: (id: string) => void }) {
  const visibleShipments = highRiskOnly ? shipments.filter(shipment => shipment.risk >= 70) : shipments
  const bands = ['Low', 'Medium', 'High', 'Critical'] as const
  return <div className="risk-monitor">
    {highRiskOnly && <div className="risk-focus-filter"><span>Showing high-risk shipments · predicted score ≥70</span><button className="text-link" onClick={onClearHighRisk}>Show all risk bands <ArrowRight size={13} /></button></div>}
    <div className="risk-band-grid">{bands.map(band => {
      const count = visibleShipments.filter(shipment => riskBand(shipment.risk) === band).length
      return <div className={`risk-band-card band-${band.toLowerCase()}`} key={band}><span>{band} score</span><strong>{count}</strong><small>{band === 'Low' ? '0–24' : band === 'Medium' ? '25–49' : band === 'High' ? '50–74' : '75–100'} / 100</small></div>
    })}</div>
    {visibleShipments.length ? <div className="table-scroll"><table className="shipment-table module-table"><thead><tr><th>SHIPMENT</th><th>STATUS</th><th>PREDICTED SCORE</th><th>SCORE BAND</th><th>ACTION</th></tr></thead><tbody>
      {visibleShipments.slice().sort((a, b) => b.risk - a.risk).map(shipment => <tr key={shipment.id}>
        <td><div className="shipment-identity"><span className={`supplier-avatar avatar-${shipment.tone}`}>{shipment.initials}</span><span><strong>{shipment.id}</strong><small>{shipment.supplier}</small></span></div></td>
        <td><span className={`shipment-status status-${shipment.status.toLowerCase().replace(' ', '-')}`}><i />{shipment.status}</span></td>
        <td><div className="risk-cell"><div className="risk-track"><span style={{ width: `${shipment.risk}%` }} className={shipment.risk >= 75 ? 'risk-high' : shipment.risk >= 50 ? 'risk-medium' : 'risk-low'} /></div><strong>{shipment.risk}/100</strong></div></td>
        <td><span className={`risk-band-label band-${riskBand(shipment.risk).toLowerCase()}`}>{riskBand(shipment.risk)}</span></td>
        <td><button className="button button-outline button-small" onClick={() => onReview(shipment.id)}>Review</button></td>
      </tr>)}
    </tbody></table></div> : <div className="empty-state"><Activity size={21} /><strong>{highRiskOnly ? 'No high-risk shipments found' : 'No shipment scores available'}</strong><span>{highRiskOnly ? 'No predicted shipment scores are 70 or higher.' : 'Add a shipment with a risk score to review bands.'}</span></div>}
  </div>
}

function DisruptionPanel({ alerts, inventoryItems, onAcknowledge, onOpenSection }: { alerts: Alert[]; inventoryItems: InventoryItem[]; onAcknowledge: (id: string, acknowledged: boolean) => void; onOpenSection: (section: 'Alerts' | 'Inventory') => void }) {
  const [selection, setSelection] = useState<DisruptionSelection>(null)
  const categoryCounts = [
    { name: 'Weather', terms: ['weather', 'storm', 'rain', 'flood', 'hurricane'] },
    { name: 'Port congestion', terms: ['port', 'congestion', 'harbor', 'vessel'] },
    { name: 'Traffic delays', terms: ['traffic', 'road closure', 'highway'] },
    { name: 'Geopolitical', terms: ['geopolitical', 'border', 'sanction', 'conflict'] },
    { name: 'Supplier disruption', terms: ['supplier disruption', 'supplier outage', 'supplier failure'] },
  ].map(category => {
    const matchingAlerts = alerts.filter(alert => category.terms.some(term => `${alert.title} ${alert.description}`.toLowerCase().includes(term)))
    return { ...category, matchingAlerts, count: matchingAlerts.length }
  })
  const criticalInventoryItems = inventoryItems.filter(item => item.status === 'Critical')
  const selectedAlert = selection?.kind === 'alert' ? alerts.find(alert => alert.id === selection.id) : undefined
  const selectedCategory = selection?.kind === 'category' ? categoryCounts.find(category => category.name === selection.name) : undefined
  const selectedAlertCategories = selectedAlert ? categoryCounts.filter(category => category.matchingAlerts.some(alert => alert.id === selectedAlert.id)) : []
  const detailTitle = selectedAlert?.title ?? selectedCategory?.name ?? 'Critical inventory'
  const formatAlertTime = (time: string) => {
    const date = new Date(time)
    return Number.isNaN(date.valueOf()) ? time : date.toLocaleString()
  }
  return <div className="disruption-panel">
    <div className="disruption-category-grid">{categoryCounts.map(category => <button type="button" className="disruption-category" key={category.name} aria-haspopup="dialog" onClick={() => setSelection({ kind: 'category', name: category.name })}><span className="disruption-category-icon"><Cloud size={16} /></span><span className="disruption-category-copy"><strong>{category.name}</strong><small>{category.count ? `${category.count} matching alert${category.count === 1 ? '' : 's'}` : 'No matching alerts recorded'}</small></span><b>{category.count}</b></button>)}
      <button type="button" className="disruption-category" aria-haspopup="dialog" onClick={() => setSelection({ kind: 'inventory' })}><span className="disruption-category-icon inventory-icon"><Box size={16} /></span><span className="disruption-category-copy"><strong>Critical inventory</strong><small>Items currently marked critical</small></span><b>{criticalInventoryItems.length}</b></button>
    </div>
    <AlertList alerts={alerts.slice(0, 5)} onAcknowledge={onAcknowledge} onSelect={alert => setSelection({ kind: 'alert', id: alert.id })} />
    {selection && <div className="disruption-drawer-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelection(null) }}>
      <aside className="disruption-drawer" role="dialog" aria-modal="true" aria-labelledby="disruption-drawer-title" onKeyDown={event => { if (event.key === 'Escape') setSelection(null) }}>
        <header className="disruption-drawer-header">
          <div><span className="disruption-drawer-eyebrow">{selectedAlert ? 'ALERT DETAILS' : selection.kind === 'inventory' ? 'INVENTORY ISSUE' : 'DISRUPTION DETAILS'}</span><h2 id="disruption-drawer-title">{detailTitle}</h2><p>{selectedAlert ? selectedAlert.id : selectedCategory ? `${selectedCategory.count} matching alert${selectedCategory.count === 1 ? '' : 's'}` : `${criticalInventoryItems.length} critical inventory item${criticalInventoryItems.length === 1 ? '' : 's'}`}</p></div>
          <button type="button" className="icon-btn disruption-drawer-close" aria-label="Close disruption details" onClick={() => setSelection(null)}><X size={18} /></button>
        </header>
        <div className="disruption-drawer-body">
          {selectedAlert ? <>
            <div className="disruption-detail-status"><span className={`severity-pill severity-${selectedAlert.acknowledged ? 'resolved' : selectedAlert.severity.toLowerCase()}`}>{selectedAlert.acknowledged ? 'Resolved' : selectedAlert.severity}</span><span>{formatAlertTime(selectedAlert.time)}</span></div>
            <section className="disruption-detail-section"><h3>Issue overview</h3><p>{selectedAlert.description}</p></section>
            <section className="disruption-detail-section"><h3>Alert information</h3><dl className="disruption-detail-facts"><div><dt>Alert ID</dt><dd>{selectedAlert.id}</dd></div><div><dt>Type</dt><dd>{selectedAlert.icon === 'truck' ? 'Shipment' : selectedAlert.icon === 'box' ? 'Inventory / returns' : 'Weather'}</dd></div><div><dt>Status</dt><dd>{selectedAlert.acknowledged ? 'Resolved' : 'Needs attention'}</dd></div></dl></section>
            <section className="disruption-detail-section"><h3>Matching disruption categories</h3>{selectedAlertCategories.length ? <div className="disruption-detail-tags">{selectedAlertCategories.map(category => <span key={category.name}>{category.name}</span>)}</div> : <p>This alert does not match a listed disruption category.</p>}</section>
          </> : selectedCategory ? <>
            <div className="disruption-detail-status"><span>{selectedCategory.count} matching alert{selectedCategory.count === 1 ? '' : 's'}</span><span>Current workspace</span></div>
            <section className="disruption-detail-section"><h3>Issue overview</h3><p>{selectedCategory.count ? `Alerts recorded for ${selectedCategory.name.toLowerCase()} are listed below.` : `No alerts are currently recorded for ${selectedCategory.name.toLowerCase()}.`}</p></section>
            <section className="disruption-detail-section"><h3>Matching alerts</h3>{selectedCategory.matchingAlerts.length ? <div className="disruption-detail-list">{selectedCategory.matchingAlerts.map(alert => <button type="button" className="disruption-detail-alert" key={alert.id} onClick={() => setSelection({ kind: 'alert', id: alert.id })}><span className={`severity-pill severity-${alert.acknowledged ? 'resolved' : alert.severity.toLowerCase()}`}>{alert.acknowledged ? 'Resolved' : alert.severity}</span><strong>{alert.title}</strong><span>{alert.description}</span><small>{formatAlertTime(alert.time)}</small></button>)}</div> : <div className="disruption-detail-empty">No matching alerts recorded.</div>}</section>
          </> : <>
            <div className="disruption-detail-status"><span>{criticalInventoryItems.length} critical item{criticalInventoryItems.length === 1 ? '' : 's'}</span><span>Inventory status</span></div>
            <section className="disruption-detail-section"><h3>Critical stock items</h3>{criticalInventoryItems.length ? <div className="disruption-detail-list">{criticalInventoryItems.map(item => <article className="disruption-detail-inventory" key={item.id}><strong>{item.item}</strong><span>{item.detail}</span><dl className="disruption-detail-facts"><div><dt>On hand</dt><dd>{item.quantity}</dd></div><div><dt>Safety stock</dt><dd>{item.safetyStock}</dd></div><div><dt>Days of cover</dt><dd>{item.cover ?? 'Unavailable'}</dd></div></dl></article>)}</div> : <div className="disruption-detail-empty">No inventory items are currently marked critical.</div>}</section>
          </>}
        </div>
        <footer className="disruption-drawer-footer">{selectedAlert
          ? <button className="button button-dark" type="button" onClick={() => onAcknowledge(selectedAlert.id, !selectedAlert.acknowledged)}>{selectedAlert.acknowledged ? 'Reopen alert' : 'Resolve alert'}</button>
          : <button className="button button-dark" type="button" onClick={() => onOpenSection(selection.kind === 'inventory' ? 'Inventory' : 'Alerts')}>{selection.kind === 'inventory' ? 'Review inventory' : 'Open alerts'}</button>}
          <button className="button button-outline" type="button" onClick={() => setSelection(null)}>Close details</button>
        </footer>
      </aside>
    </div>}
  </div>
}

function RecoveryPlannerPanel({ shipments, suppliers, onReview }: { shipments: Shipment[]; suppliers: Supplier[]; onReview: (id: string) => void }) {
  const candidates = shipments.filter(shipmentNeedsReview).sort((a, b) => b.risk - a.risk)
  return <div className="recovery-panel">
    {!candidates.length ? <div className="empty-state"><ShieldCheck size={21} /><strong>No shipments are currently flagged</strong><span>Shipments marked At risk, Delayed, or with a score of 70+ will appear here.</span></div> : <div className="recovery-list">{candidates.map(shipment => {
      const alternative = suppliers.filter(supplier => supplier.name !== shipment.supplier).sort((a, b) => b.score - a.score)[0]
      return <article className="recovery-row" key={shipment.id}>
        <div className="recovery-shipment"><span className={`supplier-avatar avatar-${shipment.tone}`}>{shipment.initials}</span><div><strong>{shipment.id}</strong><small>{shipment.route} · predicted score {shipment.risk}/100</small></div></div>
        <div className="recovery-suggestion"><span>Recorded-score candidate</span><strong>{alternative?.name ?? 'No alternative supplier recorded'}</strong><small>{alternative ? `Reliability ${alternative.score}/100 · on time ${alternative.onTime}` : 'Add a supplier record to compare alternatives.'}</small></div>
        <div className="recovery-action"><button className="button button-outline button-small" onClick={() => onReview(shipment.id)}>Review shipment</button></div>
      </article>
    })}</div>}
  </div>
}

function SupplierHealthList({ suppliers }: { suppliers: Supplier[] }) {
  if (!suppliers.length) return <div className="empty-state"><Users size={21} /><strong>No suppliers recorded</strong><span>Add supplier records to compare entered service values.</span></div>
  return <div className="supplier-health-list">{suppliers.map(supplier => <div className="supplier-health-row" key={supplier.id}>
    <span className={`supplier-avatar avatar-${supplier.tone}`}>{supplier.initials}</span><div className="supplier-health-name"><strong>{supplier.name}</strong><small>On time {supplier.onTime} · fulfillment {supplier.fulfillment}</small></div><div className="supplier-score"><strong>{supplier.score}</strong><span>/100</span></div>
  </div>)}</div>
}

function AnalyticsPanel({ shipments, inventoryItems, suppliers, onExport }: { shipments: Shipment[]; inventoryItems: InventoryItem[]; suppliers: Supplier[]; onExport: () => void }) {
  const critical = inventoryItems.filter(item => item.status === 'Critical').length
  const averageRisk = shipments.length ? Math.round(shipments.reduce((sum, item) => sum + item.risk, 0) / shipments.length) : null
  return <div className="analytics-panel">
    <div className="analytics-toolbar"><span className="tool-pill"><Activity size={14} /> CURRENT WORKSPACE RECORDS</span><button className="button button-outline button-small" onClick={onExport}><Download size={14} /> Export JSON report</button></div>
    <div className="analytics-summary-grid"><div><span>Total shipments</span><strong>{shipments.length}</strong></div><div><span>Average entered risk</span><strong>{averageRisk === null ? '—' : `${averageRisk}/100`}</strong></div><div><span>Suppliers recorded</span><strong>{suppliers.length}</strong></div><div><span>Critical inventory items</span><strong>{critical}</strong></div></div>
    <div className="analytics-chart-grid"><div className="analytics-chart-card"><div className="panel-heading"><div><h3>Shipment status mix</h3><p>Current shipment records</p></div></div><ShipmentStatusChart shipments={shipments} /></div><div className="analytics-chart-card"><div className="panel-heading"><div><h3>Supplier reliability</h3><p>Entered score, sorted high to low</p></div></div><SupplierHealthList suppliers={suppliers.slice().sort((a, b) => b.score - a.score).slice(0, 5)} /></div></div>
  </div>
}

function AssistantPanel({ shipments, inventoryItems, suppliers, alerts }: { shipments: Shipment[]; inventoryItems: InventoryItem[]; suppliers: Supplier[]; alerts: Alert[] }) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([
    { role: 'assistant', text: 'I can summarize shipments, inventory, suppliers, and alerts from this workspace.' },
  ])
  function answer(question: string) {
    const text = question.toLowerCase()
    if (text.includes('inventory') || text.includes('stock')) {
      const items = inventoryItems.filter(item => item.status === 'Critical' || item.status === 'Watch')
      return items.length ? `Items marked Critical or Watch:\n${items.map(item => `• ${item.item} — ${item.status}, ${item.cover ?? 'unknown'} days of cover`).join('\n')}` : 'No inventory items are currently marked Critical or Watch.'
    }
    if (text.includes('supplier')) {
      const ranked = suppliers.slice().sort((a, b) => b.score - a.score).slice(0, 4)
      return ranked.length ? `Highest entered supplier scores:\n${ranked.map(item => `• ${item.name} — ${item.score}/100; on time ${item.onTime}`).join('\n')}` : 'No supplier records are available.'
    }
    if (text.includes('alert') || text.includes('disruption')) {
      return alerts.length ? `${alerts.length} alert record${alerts.length === 1 ? '' : 's'} in the workspace:\n${alerts.slice(0, 5).map(item => `• ${item.severity}: ${item.title}`).join('\n')}` : 'There are no alert records in the workspace.'
    }
    if (text.includes('shipment') || text.includes('delay') || text.includes('risk')) {
      const review = shipments.filter(shipmentNeedsReview).sort((a, b) => b.risk - a.risk)
      return review.length ? `${review.length} shipments are flagged by status or entered score:\n${review.slice(0, 5).map(item => `• ${item.id} — ${item.status}, score ${item.risk}/100`).join('\n')}` : 'No shipments are currently flagged by status or entered score.'
    }
    return 'Try asking about shipments at risk, inventory stock, supplier scores, or current alerts.'
  }
  function submit(question: string) {
    const value = question.trim()
    if (!value) return
    setMessages(current => [...current, { role: 'user', text: value }, { role: 'assistant', text: answer(value) }])
    setPrompt('')
  }
  return <div className="assistant-panel">
    <div className="assistant-disclaimer"><Sparkles size={16} /><span>Workspace helper · rule-based · current records only</span></div>
    <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div className={`assistant-message message-${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? 'S' : 'You'}</span><p>{message.text}</p></div>)}</div>
    <div className="assistant-suggestions"><button onClick={() => submit('Which shipments need review?')}>Shipments needing review</button><button onClick={() => submit('Which inventory items are low?')}>Low inventory</button><button onClick={() => submit('Summarize supplier scores')}>Supplier scores</button></div>
    <form className="assistant-form" onSubmit={event => { event.preventDefault(); submit(prompt) }}><input aria-label="Ask about workspace records" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask about shipments, inventory, suppliers, or alerts" /><button className="button button-dark" type="submit" disabled={!prompt.trim()}><ArrowRight size={16} /><span className="visually-hidden">Send</span></button></form>
  </div>
}

function RecordManager({ kind, records, demoMode = false, suppliers = [], shipments = [], inventoryItems = [], returnRequests = [], searchQuery = '', onChanged, onDemoShipmentAdd, onDemoSupplierAdd, onDemoShipmentChange, onDemoInventoryChange, onAcknowledge, onNotify }: {
  kind: RecordKind
  records: Array<Shipment | Alert | InventoryItem | Supplier | ReturnRequest>
  demoMode?: boolean
  suppliers?: Supplier[]
  shipments?: Shipment[]
  inventoryItems?: InventoryItem[]
  returnRequests?: ReturnRequest[]
  searchQuery?: string
  onChanged: () => Promise<void>
  onDemoShipmentAdd?: (shipment: Shipment) => void
  onDemoSupplierAdd?: (supplier: Supplier) => void
  onDemoShipmentChange?: (shipment: Shipment) => void
  onDemoInventoryChange?: (item: InventoryItem) => void
  onAcknowledge?: (id: string, acknowledged: boolean) => Promise<void>
  onNotify?: (message: string) => void
}) {
  const definition = recordDefinitions[kind]
  const managedRecords = toManagedRecords(records)
  const shipmentRecords = kind === 'shipments'
    ? records.filter((record): record is Shipment => 'supplier' in record && 'risk' in record)
    : []
  const linkedShipments = shipments
  const displayedRecords = managedRecords.filter(record =>
    !searchQuery || Object.values(record).some(value => {
      const searchableValue = Array.isArray(value) ? value.join(' ') : String(value ?? '')
      return searchableValue.toLowerCase().includes(searchQuery.toLowerCase())
    }))
  const [editing, setEditing] = useState<ManagedRecord | null | undefined>(undefined)
  const [alternativeFor, setAlternativeFor] = useState<Shipment | null>(null)
  const [inventoryAlternativeFor, setInventoryAlternativeFor] = useState<InventoryItem | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [minEtaDate, setMinEtaDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [switchBusy, setSwitchBusy] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const [selectedBenefit, setSelectedBenefit] = useState<NonNullable<Shipment['retentionBenefit']> | ''>('')
  const [refundAmountInr, setRefundAmountInr] = useState('')
  const formFields = definition.fields.filter(field =>
    !(kind === 'shipments' && !editing && (field.name === 'status' || field.name === 'risk')))
  const alternatives = suppliers
    .filter(supplier => supplier.name !== alternativeFor?.supplier)
    .sort((first, second) => second.score - first.score || Number.parseFloat(second.onTime) - Number.parseFloat(first.onTime))
  const parsedRefundAmountInr = Number(refundAmountInr)
  const hasValidRefundAmount = refundAmountInr.trim() !== '' && Number.isFinite(parsedRefundAmountInr) && parsedRefundAmountInr > 0
  const inventoryAlternatives = suppliers
    .filter(supplier => !inventoryAlternativeFor?.suppliers.includes(supplier.name))
    .sort((first, second) => second.score - first.score || Number.parseFloat(second.onTime) - Number.parseFloat(first.onTime))

  async function switchSupplier(supplier: Supplier) {
    if (!alternativeFor || !hasValidRefundAmount) return
    setSwitchBusy(true)
    setSwitchError('')
    try {
      if (demoMode) {
        onDemoShipmentChange?.({
          ...alternativeFor,
          supplier: supplier.name,
          initials: supplier.initials,
          tone: supplier.tone,
          refundRequired: true,
          refundAmountInr: parsedRefundAmountInr,
          retentionBenefit: null,
        })
      } else {
        await apiRequest(`${definition.endpoint}/${encodeURIComponent(alternativeFor.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ supplier: supplier.name, initials: supplier.initials, tone: supplier.tone, refundRequired: true, refundAmountInr: parsedRefundAmountInr, retentionBenefit: null }),
        })
        await onChanged()
      }
      setAlternativeFor(null)
      onNotify?.(demoMode
        ? `Demo preview: ${alternativeFor.id} changed to ${supplier.name}; a buyer refund is marked due. This was not saved or paid.`
        : `Supplier for ${alternativeFor.id} changed to ${supplier.name}; a buyer refund is marked due for processing.`)
    } catch (switchError) {
      setSwitchError(switchError instanceof Error ? switchError.message : 'Could not change the shipment supplier.')
    } finally {
      setSwitchBusy(false)
    }
  }

  async function keepSupplierWithBenefit() {
    if (!alternativeFor || !selectedBenefit) return
    setSwitchBusy(true)
    setSwitchError('')
    try {
      if (demoMode) {
        onDemoShipmentChange?.({ ...alternativeFor, refundRequired: false, refundAmountInr: null, retentionBenefit: selectedBenefit })
      } else {
        await apiRequest(`${definition.endpoint}/${encodeURIComponent(alternativeFor.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ refundRequired: false, refundAmountInr: null, retentionBenefit: selectedBenefit }),
        })
        await onChanged()
      }
      setAlternativeFor(null)
      onNotify?.(demoMode
        ? `Demo preview: ${selectedBenefit} selected for ${alternativeFor.id}. This was not saved or fulfilled.`
        : `${selectedBenefit} selected for ${alternativeFor.id}; fulfilment is still required.`)
    } catch (benefitError) {
      setSwitchError(benefitError instanceof Error ? benefitError.message : 'Could not save the selected benefit.')
    } finally {
      setSwitchBusy(false)
    }
  }

  async function switchInventorySupplier(supplier: Supplier) {
    if (!inventoryAlternativeFor) return
    setSwitchBusy(true)
    setSwitchError('')
    const atRiskNames = inventoryAtRiskSuppliers(inventoryAlternativeFor, shipments)
    const updatedItem: InventoryItem = {
      ...inventoryAlternativeFor,
      suppliers: [...inventoryAlternativeFor.suppliers.filter(name => !atRiskNames.includes(name)), supplier.name],
    }
    try {
      if (demoMode) {
        onDemoInventoryChange?.(updatedItem)
      } else {
        await apiRequest(`${definition.endpoint}/${encodeURIComponent(inventoryAlternativeFor.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ suppliers: updatedItem.suppliers }),
        })
        await onChanged()
      }
      setInventoryAlternativeFor(null)
      onNotify?.(demoMode
        ? `Demo preview: alternative supplier added for ${inventoryAlternativeFor.item}. This was not saved.`
        : `Alternative supplier saved for ${inventoryAlternativeFor.item}.`)
    } catch (switchError) {
      setSwitchError(switchError instanceof Error ? switchError.message : 'Could not update the inventory suppliers.')
    } finally {
      setSwitchBusy(false)
    }
  }

  function openForm(record?: ManagedRecord) {
    const formValues: Record<string, string> = {}
    for (const field of definition.fields) {
      const current = record?.[field.name]
      const value = current === undefined || current === null ? '' : String(current)
      formValues[field.name] = field.type === 'date'
        ? value ? new Date(value).toISOString().slice(0, 10) : ''
        : field.type === 'multiselect'
        ? JSON.stringify(Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : [])
        : field.type === 'datetime-local' && value
          ? new Date(value).toISOString().slice(0, 16)
          : value
    }
    setValues(formValues)
    setMinEtaDate(kind === 'shipments' && !record ? nextLocalDateInputValue() : '')
    setEditing(record ?? null)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const recordPayload = Object.fromEntries(definition.fields
      .filter(field => !(editing && (field.name === 'id')))
      .map(field => {
        const value = values[field.name] ?? ''
        if (field.type === 'number') return [field.name, Number(value)]
        if (field.type === 'date') return [field.name, value ? `${value}T00:00:00.000Z` : null]
        if (field.type === 'datetime-local') return [field.name, new Date(value).toISOString()]
        if (field.type === 'multiselect') return [field.name, selectedValues(value)]
        return [field.name, value]
      }))
    const payload = kind === 'shipments' && !editing
      ? {
        ...recordPayload,
        status: 'On track',
        risk: 0,
        tone: suppliers.find(supplier => supplier.name === values.supplier)?.tone ?? 'blue',
      }
      : recordPayload
    try {
      if (demoMode && kind === 'shipments' && !editing) {
        onDemoShipmentAdd?.({
          id: String(payload.id ?? ''),
          supplier: String(payload.supplier ?? ''),
          route: String(payload.route ?? ''),
          carrier: String(payload.carrier ?? ''),
          eta: String(payload.eta ?? ''),
          status: 'On track',
          risk: 0,
          initials: String(payload.initials ?? ''),
          tone: String(payload.tone ?? 'blue'),
        })
        setEditing(undefined)
        onNotify?.('Demo shipment added for this session. It is not saved.')
        return
      }
      if (demoMode && kind === 'suppliers' && !editing) {
        const name = String(payload.name ?? '').trim()
        const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase()
        const tones = ['violet', 'blue', 'teal', 'orange']
        onDemoSupplierAdd?.({
          id: `demo-supplier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          orders: Number(payload.completedOrders),
          onTime: `${Number(payload.onTimeRate).toFixed(1)}%`,
          fulfillment: `${Number(payload.fulfillmentRate).toFixed(1)}%`,
          score: Number(payload.reliabilityScore),
          tone: tones[name.length % tones.length],
          initials,
        })
        setEditing(undefined)
        onNotify?.('Demo supplier added for this session. It is not saved.')
        return
      }
      const url = editing
        ? `${definition.endpoint}/${encodeURIComponent(editing.id)}`
        : definition.endpoint
      await apiRequest(url, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setEditing(undefined)
      await onChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this record.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(record: ManagedRecord) {
    if (!window.confirm(`Delete this ${kind.slice(0, -1)} record? This cannot be undone.`)) return
    try {
      await apiRequest(`${definition.endpoint}/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
      await onChanged()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not delete this record.')
    }
  }

  return <div className="record-manager">
    <div className="record-toolbar">
      <span>{demoMode ? `${displayedRecords.length} sample ${recordLabels[kind]}${records.length === 1 ? '' : 's'}` : `${displayedRecords.length} of ${records.length} saved record${records.length === 1 ? '' : 's'}`}</span>
      <button className="button button-dark button-small" disabled={demoMode && kind !== 'shipments' && kind !== 'suppliers'} title={demoMode && (kind === 'shipments' || kind === 'suppliers') ? `Demo ${recordLabels[kind]} will be temporary for this session.` : demoMode ? 'Connect MongoDB to add saved records.' : undefined} onClick={() => openForm()}><Plus size={15} /> Add {recordLabels[kind]}</button>
    </div>
    {kind === 'returns' && (!suppliers.length || !inventoryItems.length) && <p className="record-prerequisite-note">Add at least one supplier and one inventory item before recording returns.</p>}
    {error && !editing && <p className="form-error" role="alert">{error}</p>}
    {displayedRecords.length === 0 ? <div className="empty-state"><Search size={21} /><strong>{records.length === 0 ? `No ${recordLabels[kind]} records yet` : 'No matching shipments'}</strong><span>{records.length === 0 ? 'Add a record to get started.' : 'Clear the search field to see all shipments.'}</span></div> :
      <div className="table-scroll"><table className="shipment-table module-table">
        <thead><tr>{definition.fields.map(field => <th key={field.name}>{field.name === 'suppliers' && kind === 'inventory' ? 'ASSIGNED SUPPLIERS' : field.label.toUpperCase()}</th>)}{kind === 'inventory' && <th>SUPPLIERS AT RISK</th>}{kind === 'returns' && <th>RATING</th>}{kind === 'suppliers' && <th>RETURN PERFORMANCE</th>}{kind !== 'inventory' && kind !== 'returns' && <th>{kind === 'shipments' ? 'NEXT STEP' : 'ACTIONS'}</th>}</tr></thead>
        <tbody>{displayedRecords.map(record => <tr key={record.id}>
          {definition.fields.map(field => <td key={field.name}>{managedFieldValue(record, field, kind)}</td>)}
          {kind === 'inventory' && <td className="inventory-risk-suppliers">
            {(() => {
              const assigned = Array.isArray(record.suppliers)
                ? record.suppliers.filter((name): name is string => typeof name === 'string')
                : []
              const inventoryItem = records.find((item): item is InventoryItem => 'quantity' in item && item.id === record.id)
              const atRisk = inventoryItem ? inventoryAtRiskSuppliers(inventoryItem, linkedShipments) : []
              return <>{atRisk.length
                ? atRisk.map(name => {
                  const shipment = linkedShipments.find(item => item.supplier === name && shipmentNeedsReview(item))
                  return <span className="inventory-supplier-risk" key={name} title={shipment ? `${shipment.status} · ${shipment.risk}% risk` : undefined}><i />{name}<small>At risk</small></span>
                })
                : <span className="inventory-supplier-clear">{assigned.length ? 'None reported' : 'No suppliers assigned'}</span>}
                {kind === 'inventory' && atRisk.length > 0 && inventoryItem && <button className="button button-outline button-small inventory-alternative-button" type="button" onClick={() => {
                  setInventoryAlternativeFor(inventoryItem)
                  setSwitchError('')
                }}>Alternative supplier</button>}
              </>
            })()}
          </td>}
          {kind === 'returns' && <td><span className={`return-rating return-rating-${String(record.rating).toLowerCase()}`}>{String(record.rating || 'Pending')}</span></td>}
          {kind === 'suppliers' && <td className="return-performance-cell">
            {(() => {
              const performance = supplierReturnPerformance(String(record.name ?? ''), returnRequests)
              return performance
                ? <><strong>{performance.percent}% on time</strong><small>{performance.best} Best · {performance.good} Good · {performance.poor} Poor</small></>
                : <span className="inventory-supplier-clear">No return history</span>
            })()}
          </td>}
          {kind !== 'inventory' && kind !== 'returns' && <td className="record-actions">
            {kind === 'shipments' ? (() => {
              const shipment = shipmentRecords.find(item => item.id === record.id)
              if (!shipment) return <span className="shipment-action-status">No action needed</span>
              return <>
                {shipmentNeedsReview(shipment) && <button className="button button-outline button-small" type="button" onClick={() => {
                  setAlternativeFor(shipment)
                  setSelectedBenefit(shipment.retentionBenefit ?? '')
                  setRefundAmountInr(shipment.refundAmountInr == null ? '' : String(shipment.refundAmountInr))
                  setSwitchError('')
                }}>Find alternative</button>}
                {shipment.refundRequired
                  ? <span className="shipment-action-status shipment-refund-status">Buyer refund due{shipment.refundAmountInr != null ? ` · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(shipment.refundAmountInr)}` : ' · amount missing'}</span>
                  : shipment.retentionBenefit
                    ? <span className="shipment-action-status shipment-benefit-status">Benefit: {shipment.retentionBenefit}</span>
                    : !shipmentNeedsReview(shipment) && <span className="shipment-action-status">No action needed</span>}
              </>
            })() : kind === 'suppliers' ? (() => {
              const performance = supplierReturnPerformance(String(record.name ?? ''), returnRequests)
              if (!performance) return <span className="supplier-action-status">No completed returns to assess</span>
              if (performance.percent < 40) return <div className="supplier-action-warning" role="status">
                <strong>Issue with this supplier · {performance.percent}% return score</strong>
                <span>Returns are not being completed properly in Supplier Network: only {performance.onTime} of {performance.total} completed returns met the target. Please investigate and take relevant action.</span>
              </div>
              return <span className="supplier-action-status">No action needed</span>
            })() : kind === 'alerts' ? onAcknowledge && <button className="button button-outline button-small" onClick={() => void onAcknowledge(record.id, record.acknowledged !== true)}>{record.acknowledged === true ? 'Reopen' : 'Resolve'}</button> : <>
              <button className="button button-outline button-small" disabled={demoMode} onClick={() => openForm(record)}>Edit</button>
              <button className="button button-outline button-small" disabled={demoMode} onClick={() => void remove(record)}>Delete</button>
            </>}
          </td>}
        </tr>)}</tbody>
      </table></div>}
    {editing !== undefined && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(undefined) }}>
      <form className="record-form" onSubmit={event => void save(event)}>
        <div className="panel-heading"><div><h2>{editing ? 'Edit' : 'Add'} {recordLabels[kind]}</h2><p>{demoMode && !editing && (kind === 'shipments' || kind === 'suppliers') ? `This demo ${recordLabels[kind]} is temporary for the current session.` : 'Saved securely to the connected database.'}</p></div><button className="icon-btn" type="button" aria-label="Close form" onClick={() => setEditing(undefined)}><X size={17} /></button></div>
        {formFields.map(field => <label className="record-field" key={field.name}>{field.label}
          {field.type === 'multiselect'
            ? <select className="text-field multi-select-field" multiple value={selectedValues(values[field.name] ?? '')} disabled={!suppliers.length} onChange={event => {
              const selected = Array.from(event.currentTarget.selectedOptions, option => option.value)
              setValues(current => ({ ...current, [field.name]: JSON.stringify(selected) }))
            }}>
              {suppliers.map(supplier => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
            </select>
            : field.type === 'supplier' || field.type === 'inventory-item'
              ? <select className="text-field" required value={values[field.name] ?? ''} disabled={field.type === 'supplier' ? !suppliers.length : !inventoryItems.length} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>
                <option value="" disabled>Select…</option>
                {field.type === 'supplier'
                  ? suppliers.map(supplier => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)
                  : inventoryItems.map(item => <option key={item.id} value={item.item}>{item.item}</option>)}
              </select>
            : field.type === 'select'
            ? <select className="text-field" required value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>
              <option value="" disabled>Select…</option>{field.options?.map(option => <option key={option}>{option}</option>)}
            </select>
            : <input className="text-field" type={field.type || 'text'} required={field.type !== 'date' || field.name !== 'completedAt'} min={kind === 'shipments' && field.name === 'eta' && field.type === 'date' && !editing ? minEtaDate : field.min} max={field.max} step={field.type === 'number' ? '1' : undefined} disabled={Boolean(editing) && field.name === 'id'} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />}
          {kind === 'shipments' && field.name === 'eta' && field.type === 'date' && !editing && <small className="record-field-help">Choose a date after today.</small>}
          {field.type === 'multiselect' && <small className="record-field-help">{suppliers.length ? 'Hold Ctrl (Windows) or Command (Mac) to select multiple suppliers.' : 'Add supplier records before assigning suppliers to inventory.'}</small>}
        </label>)}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="record-form-actions"><button className="button button-outline" type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></div>
      </form>
    </div>}
    {alternativeFor && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !switchBusy) setAlternativeFor(null) }}>
      <section className="supplier-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-switch-title">
        <div className="panel-heading">
          <div><h2 id="supplier-switch-title">Emergency alternatives for {alternativeFor.id}</h2><p>{alternativeFor.supplier} · {alternativeFor.route} · {alternativeFor.status}</p></div>
          <button className="icon-btn" type="button" aria-label="Close alternatives" disabled={switchBusy} onClick={() => setAlternativeFor(null)}><X size={17} /></button>
        </div>
        <p className="supplier-switch-note">{demoMode
          ? 'Preview only: these synthetic supplier records are for demonstration. A switch or benefit choice updates this page temporarily and is not saved.'
          : 'Options use only supplier records already entered in this workspace. Confirm capacity and emergency delivery with the supplier before switching.'}</p>
        <section className="refund-choice" aria-labelledby="refund-choice-title">
          <h3 id="refund-choice-title">Change supplier and refund the buyer</h3>
          <p>Enter the buyer’s paid amount in rupees. Switching marks that amount as due for refund; you will still need to process the payment separately.</p>
          <label className="refund-amount-field" htmlFor="refund-amount-inr">Refund amount (INR / ₹)
            <span className="refund-input-wrap"><span aria-hidden="true">₹</span><input id="refund-amount-inr" className="text-field" type="number" inputMode="decimal" min="0.01" step="0.01" required value={refundAmountInr} disabled={switchBusy} onChange={event => setRefundAmountInr(event.target.value)} placeholder="0.00" /></span>
          </label>
        </section>
        {switchError && <p className="form-error" role="alert">{switchError}</p>}
        {alternatives.length ? <div className="alternative-list">{alternatives.map(supplier => <article className="alternative-card" key={supplier.id}>
          <div className={`supplier-avatar avatar-${supplier.tone}`}>{supplier.initials}</div>
          <div className="alternative-details"><strong>{supplier.name}</strong><span>Reliability {supplier.score}/100 · On time {supplier.onTime} · Fulfillment {supplier.fulfillment}</span><small>{supplier.orders} completed orders recorded</small></div>
          <button className="button button-dark button-small" type="button" disabled={switchBusy || !hasValidRefundAmount} onClick={() => void switchSupplier(supplier)}>{switchBusy ? 'Updating…' : 'Switch + refund due'}</button>
        </article>)}</div> : <div className="empty-state"><Users size={21} /><strong>No alternative suppliers available</strong><span>Add another supplier in the Suppliers section to compare workspace records.</span></div>}
        <section className="retention-choice" aria-labelledby="retention-choice-title">
          <h3 id="retention-choice-title">Keep the current supplier and choose a benefit</h3>
          <p>Choose one option for the buyer. Selecting it records the choice; it does not issue cashback, coins, or a gift.</p>
          <div className="benefit-options" role="radiogroup" aria-labelledby="retention-choice-title">
            {(['Super coins', '20% cashback', 'Surprise gift'] as const).map(benefit => <label className={`benefit-option${selectedBenefit === benefit ? ' benefit-option-selected' : ''}`} key={benefit}>
              <input type="radio" name={`benefit-${alternativeFor.id}`} value={benefit} checked={selectedBenefit === benefit} disabled={switchBusy} onChange={() => setSelectedBenefit(benefit)} />
              <span>{benefit}</span>
            </label>)}
          </div>
          <button className="button button-outline button-small" type="button" disabled={switchBusy || !selectedBenefit} onClick={() => void keepSupplierWithBenefit()}>{switchBusy ? 'Saving…' : 'Keep supplier + save benefit'}</button>
        </section>
        <p className="supplier-switch-footnote">Switching updates the supplier name and display initials/avatar; ETA and risk stay unchanged. A refund or benefit needs separate payment/reward fulfilment.</p>
      </section>
    </div>}
    {inventoryAlternativeFor && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !switchBusy) setInventoryAlternativeFor(null) }}>
      <section className="supplier-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="inventory-supplier-switch-title">
        <div className="panel-heading">
          <div><h2 id="inventory-supplier-switch-title">Alternative suppliers for {inventoryAlternativeFor.item}</h2><p>{inventoryAtRiskSuppliers(inventoryAlternativeFor, shipments).join(', ')} · supplier at risk</p></div>
          <button className="icon-btn" type="button" aria-label="Close alternatives" disabled={switchBusy} onClick={() => setInventoryAlternativeFor(null)}><X size={17} /></button>
        </div>
        <p className="supplier-switch-note">{demoMode
          ? 'Preview only: selecting a supplier updates this inventory item temporarily and is not saved.'
          : 'Select an existing supplier to replace the at-risk supplier assignment. Verify product availability and delivery capability directly with the supplier.'}</p>
        {switchError && <p className="form-error" role="alert">{switchError}</p>}
        {inventoryAlternatives.length ? <div className="alternative-list">{inventoryAlternatives.map(supplier => <article className="alternative-card" key={supplier.id}>
          <div className={`supplier-avatar avatar-${supplier.tone}`}>{supplier.initials}</div>
          <div className="alternative-details"><strong>{supplier.name}</strong><span>Reliability {supplier.score}/100 · On time {supplier.onTime} · Fulfillment {supplier.fulfillment}</span><small>{supplier.orders} completed orders recorded</small></div>
          <button className="button button-dark button-small" type="button" disabled={switchBusy} onClick={() => void switchInventorySupplier(supplier)}>{switchBusy ? 'Updating…' : 'Use supplier'}</button>
        </article>)}</div> : <div className="empty-state"><Users size={21} /><strong>No alternatives available</strong><span>Add another supplier in the Suppliers section to replace this at-risk assignment.</span></div>}
        <p className="supplier-switch-footnote">The selected supplier replaces at-risk assignments. Other assigned suppliers are kept; shipment ETA and risk values are unchanged.</p>
      </section>
    </div>}
  </div>
}

function WhatIfPanel({ items }: { items: InventoryItem[] }) {
  const [delay, setDelay] = useState(3)
  const [demandIncrease, setDemandIncrease] = useState(20)
  const selectedItem = items[0]
  const currentCover = selectedItem?.cover ?? null
  const projectedCover = currentCover === null
    ? null
    : Math.max(0, Math.round(currentCover / (1 + demandIncrease / 100) - delay / 3))
  return <div className="scenario-layout">
    <div className="scenario-controls"><div className="field-label">Scenario type</div><select className="text-field" defaultValue="Delivery delay"><option>Delivery delay</option><option>Demand increase</option><option>Supplier disruption</option></select>
      <label className="field-label" htmlFor="delay-days">Shipment delay (days)</label><input id="delay-days" className="text-field" type="number" min="0" max="90" value={delay} onChange={event => setDelay(Math.max(0, Number(event.target.value)))} />
      <label className="field-label" htmlFor="demand-percent">Demand increase (%)</label><input id="demand-percent" className="text-field" type="number" min="0" max="300" value={demandIncrease} onChange={event => setDemandIncrease(Math.max(0, Number(event.target.value)))} />
    </div>
    <div className="scenario-results"><span className="tool-pill"><Activity size={14} /> SIMULATED OUTCOME</span><h3>{selectedItem ? `${selectedItem.detail} · ${selectedItem.item}` : 'No inventory records'}</h3><p>Scenario arithmetic based on the first inventory record currently in MongoDB.</p><div className="scenario-metrics"><div><span>Current coverage</span><strong>{currentCover === null ? 'Not calculable' : `${currentCover} days`}</strong></div><ArrowRight size={17} /><div className="scenario-impact"><span>Projected coverage</span><strong>{projectedCover === null ? '—' : `${projectedCover} days`}</strong></div></div><div className="scenario-warning"><span className="status-dot" />{projectedCover === null ? 'Add an inventory item with positive daily demand to run this scenario.' : projectedCover <= 3 ? 'Potential stockout before replenishment. Review source records.' : 'Coverage remains above the illustrative 3-day threshold.'}</div></div>
  </div>
}

function ModelDataPanel() {
  return <div className="model-data-grid">
    <div className="model-status-card"><span className="tool-pill"><Activity size={14} /> MODEL STATUS</span><div className="model-status-title"><span className="model-status-dot" /> No prediction model connected</div><p>Shipment risk values are entered manually by an administrator. This app does not calculate disruption probabilities.</p><div className="model-fallback"><ShieldCheck size={16} /><span>The app does not take automated operational actions.</span></div></div>
    <div className="model-status-card"><span className="tool-pill"><Box size={14} /> DATA PROVENANCE</span><div className="model-status-title">MongoDB operational records</div><p>No dataset has been imported yet. Add verified records manually; future CSV import should preserve source and validation information.</p><div className="model-fallback"><Clock3 size={16} /><span>Public supply-chain dataset loading is a separate follow-up step.</span></div></div>
  </div>
}

export default App
