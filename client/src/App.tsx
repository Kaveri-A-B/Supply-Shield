import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Box, Database,
  Check, ChevronRight, CircleHelp, Clock3, Cloud, RotateCcw,
  Download, LayoutDashboard, Menu,
  PackageCheck, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Truck, Users, X,
} from 'lucide-react'
import { createDemoWorkspace, type Alert, type BuyerRefund, type InventoryItem, type ReturnRequest, type Shipment, type Supplier } from './data'

type Section = 'Overview' | 'Shipments' | 'Inventory' | 'Suppliers' | 'Returns' | 'Alerts' | 'What-if' | 'Model & data' | 'SAP Demo' | 'Branding'
type RecordKind = 'shipments' | 'inventory' | 'suppliers' | 'returns' | 'alerts'
type ManagedRecord = { id: string; [key: string]: unknown }
type SupplierRetentionBenefit = 'Super coins' | '20% cashback' | 'Surprise gift'

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
  { label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'Shipments', icon: Truck, group: 'WORKSPACE' },
  { label: 'Inventory', icon: Box, group: 'WORKSPACE' },
  { label: 'Suppliers', icon: Users, group: 'WORKSPACE' },
  { label: 'Returns', icon: RotateCcw, group: 'WORKSPACE' },
  { label: 'Alerts', icon: Bell, group: 'MONITOR' },
  { label: 'What-if', icon: Activity, group: 'MONITOR' },
  { label: 'Model & data', icon: SlidersHorizontal, group: 'MANAGE' },
  { label: 'SAP Demo', icon: Database, group: 'MANAGE' },
  { label: 'Branding', icon: Sparkles, group: 'MANAGE' },
]

function toManagedRecords(records: Array<Shipment | Alert | InventoryItem | Supplier | ReturnRequest>): ManagedRecord[] {
  return records.map(record => ({ ...record })) as ManagedRecord[]
}

function shipmentNeedsReview(shipment: Shipment) {
  return shipment.status === 'At risk' || shipment.status === 'Delayed' || (shipment.risk !== null && shipment.risk >= 70)
}

function shipmentIsAtRiskOrDelayed(shipment: Shipment) {
  return shipment.status === 'At risk' || shipment.status === 'Delayed'
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 96"><rect width="96" height="96" rx="27" fill="${color}"/><path d="M48 13 74 24v20c0 18-11 32-26 40-15-8-26-22-26-40V24l26-11Z" fill="#16352c"/><path d="${route}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/><text x="116" y="61" fill="#16352c" font-family="Arial,sans-serif" font-size="35" font-weight="700">${escapeXml(text || 'SupplyShield')}</text></svg>`
}

function createLogoMarkSvg(color: string, style: string) {
  const route = createRoutePath(style)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="27" fill="${color}"/><path d="M48 13 74 24v20c0 18-11 32-26 40-15-8-26-22-26-40V24l26-11Z" fill="#16352c"/><path d="${route}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/></svg>`
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
  if (!values.length) return <div className="chart-empty">No risk scores have been entered yet.</div>
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
  const [showOnlyAtRiskShipments, setShowOnlyAtRiskShipments] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertRecords, setAlertRecords] = useState<Alert[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([])
  const [demoMode, setDemoMode] = useState(true)
  const [apiError, setApiError] = useState('')
  const [toast, setToast] = useState('')
  const [logoColor, setLogoColor] = useState('#d9f36a')
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
        setQuery('')
      }
    }
    window.addEventListener('keydown', closeSearch)
    return () => window.removeEventListener('keydown', closeSearch)
  }, [])

  const filteredShipments = useMemo(() => shipments.filter(item =>
    `${item.id} ${item.supplier} ${item.route} ${item.carrier}`.toLowerCase().includes(query.toLowerCase())), [shipments, query])
  const globalSearchResults = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    const entries = [
      ...shipments.map(record => ({ section: 'Shipments' as const, title: record.id, detail: `${record.supplier} · ${record.route} · ${record.status ?? 'Status not set'}`, searchable: Object.values(record).join(' ') })),
      ...inventoryItems.map(record => ({ section: 'Inventory' as const, title: record.item, detail: `${record.detail} · ${record.status}`, searchable: Object.values(record).join(' ') })),
      ...suppliers.map(record => ({ section: 'Suppliers' as const, title: record.name, detail: `${record.score}/100 reliability · ${record.onTime} on time`, searchable: Object.values(record).join(' ') })),
      ...returnRequests.map(record => ({ section: 'Returns' as const, title: record.product, detail: `${record.supplier} · ${record.rating}`, searchable: Object.values(record).join(' ') })),
      ...alertRecords.map(record => ({ section: 'Alerts' as const, title: record.title, detail: `${record.severity} · ${record.description}`, searchable: Object.values(record).join(' ') })),
    ]
    const sectionAliases: { section: Section; title: string; aliases: string[] }[] = [
      { section: 'Overview', title: 'Overview', aliases: ['overview', 'dashboard', 'home'] },
      { section: 'Shipments', title: 'Shipments', aliases: ['shipment', 'shipments', 'delivery', 'deliveries'] },
      { section: 'Returns', title: 'Returns', aliases: ['return', 'returns'] },
      { section: 'Suppliers', title: 'Suppliers', aliases: ['supplier', 'suppliers', 'vendor', 'vendors'] },
      { section: 'Inventory', title: 'Inventory', aliases: ['inventory', 'stock', 'items'] },
      { section: 'Alerts', title: 'Alerts', aliases: ['alert', 'alerts', 'notification', 'notifications'] },
      { section: 'SAP Demo', title: 'SAP Demo', aliases: ['sap demo', 'sap', 'mock sap'] },
    ]
    const words = term.split(/\s+/)
    const sectionMatches = sectionAliases
      .filter(item => words.some(word => item.aliases.some(alias => alias === word || (word.length >= 4 && alias.startsWith(word)))))
      .map(item => ({ section: item.section, title: item.title, detail: `Open ${item.title.toLowerCase()}`, searchable: term, isSection: true }))
    const recordMatches = entries
      .filter(entry => entry.searchable.toLowerCase().includes(term))
      .map(entry => ({ ...entry, isSection: false }))
    return [...sectionMatches, ...recordMatches].slice(0, 8)
  }, [query, shipments, inventoryItems, suppliers, returnRequests, alertRecords])
  const activeAlerts = alerts.length
  const title = section === 'Overview' ? 'Supply chain overview' : section
  const description = section === 'Overview'
    ? 'Here’s what’s happening across your supply chain today.'
    : section === 'Branding'
      ? 'Make the SupplyShield mark your own.'
      : section === 'SAP Demo'
        ? 'Preview the proposed SAP data flow with local simulated records.'
      : `Monitor and manage your ${section.toLowerCase()} across the network.`

  async function setAlertResolved(alertId: string, resolved: boolean) {
    if (demoMode) {
      const updatedRecords = alertRecords.map(alert => alert.id === alertId ? { ...alert, acknowledged: resolved } : alert)
      setAlertRecords(updatedRecords)
      setAlerts(updatedRecords.filter(alert => !alert.acknowledged))
      setToast(resolved ? 'Alert marked resolved. This demo change is temporary.' : 'Alert reopened. This demo change is temporary.')
      return
    }
    try {
      await apiRequest(`/api/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
        method: 'PATCH',
        body: JSON.stringify({ acknowledged: resolved }),
      })
      await loadWorkspace()
      setToast(resolved ? 'Alert marked resolved.' : 'Alert reopened.')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not update the alert status.')
    }
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
        {(['WORKSPACE', 'MONITOR', 'MANAGE'] as const).map(group => <div className="nav-group" key={group}>
          <p className="nav-heading">{group}</p>
          {sections.filter(item => item.group === group).map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${section === item.label ? 'nav-active' : ''}`} onClick={() => { setSection(item.label); if (item.label === 'Shipments') setShowOnlyAtRiskShipments(false); setSidebarOpen(false) }}>
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
          <button onClick={() => setSection('Model & data')}>Explore data status <ArrowRight size={14} /></button>
          <div className="plan-orb orb-one" /><div className="plan-orb orb-two" />
        </div>
        <button className="nav-item support-item" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /><span>Help & support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">S</div><div className="profile-meta"><strong>Open workspace</strong><small>No sign-in required</small></div></div>
      </div>
    </aside>

    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{section}</strong></div></div>
        <div className="topbar-actions">
          <div className={`data-status ${apiError ? 'demo' : 'connected'}`}><span className="status-dot" />{demoMode ? 'Demo data' : apiError ? 'Database unavailable' : 'MongoDB connected'}</div>
          <button className="topbar-icon" aria-label="Search" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery('') }}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label={`${activeAlerts} notifications`} onClick={() => setSection('Alerts')}><Bell size={19} />{activeAlerts > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">S</div>
        </div>
      </header>
      {searchOpen && <div className="global-search-wrap">
        <div className="global-search"><Search size={17} /><input autoFocus aria-label="Search workspace records" placeholder="Search shipments, suppliers, inventory, returns, or alerts…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && globalSearchResults[0]) {
            setSection(globalSearchResults[0].section)
            if (globalSearchResults[0].section === 'Shipments') setShowOnlyAtRiskShipments(false)
            setSearchOpen(false)
            if (globalSearchResults[0].isSection) setQuery('')
          }
        }} /><kbd>ESC</kbd><button className="icon-btn" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="Close search"><X size={16} /></button></div>
        {query.trim() && <div className="global-search-results" role="listbox" aria-label="Search results">
          {globalSearchResults.length ? globalSearchResults.map((result, index) => <button key={`${result.section}-${result.title}-${index}`} className="global-search-result" role="option" aria-selected="false" onClick={() => { setSection(result.section); if (result.section === 'Shipments') setShowOnlyAtRiskShipments(false); setSearchOpen(false); if (result.isSection) setQuery('') }}>
            <span className="global-search-result-icon"><Search size={14} /></span><span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.detail}</small></span><span className="global-search-result-section">{result.isSection ? 'Section' : result.section}</span>
          </button>) : <div className="global-search-empty">No matching workspace records.</div>}
        </div>}
      </div>}

      <div className="content">
        {demoMode && <div className="demo-banner" role="status"><Sparkles size={16} /><span><strong>Demo workspace</strong> — {inventoryItems.length} inventory items, {suppliers.length} suppliers, {shipments.length} shipments, and {returnRequests.length} returns are shown for preview. Demo additions are temporary and are not saved to MongoDB.</span></div>}
        {apiError && <div className="api-error" role="alert">{apiError} <button onClick={() => void loadWorkspace().catch(error => setApiError(error instanceof Error ? error.message : 'Could not load database records.'))}>Retry</button></div>}
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> SUPPLY CHAIN · WORKSPACE</div><h1>{title}<span className="wave">✳</span></h1><p>{description}</p></div>
          <div className="heading-actions"><button className="button button-outline" onClick={exportReport}><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => { setShowOnlyAtRiskShipments(false); setSection('Shipments') }}><Plus size={17} /> Manage shipments</button></div>
        </div>

        {section === 'Branding' ? <section className="branding-layout">
          <div className="panel brand-editor">
            <div className="panel-heading"><div><h2>Logo studio</h2><p>Build a simple, memorable mark for your workspace.</p></div><span className="tool-pill"><Sparkles size={14} /> In-memory</span></div>
            <label className="field-label" htmlFor="brand-name">Brand name</label><input id="brand-name" className="text-field" value={logoText} maxLength={24} onChange={event => setLogoText(event.target.value)} />
            <label className="field-label" htmlFor="brand-style">Mark style</label><select id="brand-style" className="text-field" value={logoStyle} onChange={event => setLogoStyle(event.target.value)}><option>Shield + route</option><option>Shield + pulse</option><option>Shield + link</option></select>
            <p className="field-label color-label">Brand color</p><div className="swatch-list">{['#d9f36a', '#b7d9ff', '#ffd4ad', '#dccbff', '#a8e6d2'].map(color => <button key={color} aria-label={`Set brand color ${color}`} className={`color-swatch ${logoColor === color ? 'swatch-selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setLogoColor(color)} />)}</div>
            <div className="download-row"><button className="button button-dark" onClick={() => downloadLogo('svg')}><Download size={16} /> Download SVG</button><button className="button button-outline" onClick={() => downloadLogo('png')}><Download size={16} /> Download PNG</button><button className="button button-outline" onClick={() => downloadLogo('ico')}><Download size={16} /> Download ICO</button></div>
            <p className="privacy-note"><ShieldCheck size={15} /> Generated in your browser. No files are stored on a server.</p>
          </div>
          <div className="panel brand-preview-panel"><div className="panel-heading"><div><h2>Live preview</h2><p>Your updated mark, in context.</p></div><span className="preview-live"><i /> LIVE</span></div>
            <div className="brand-preview"><img className="custom-logo-preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(createLogoSvg(logoColor, logoText, logoStyle))}`} alt={`${logoText || 'SupplyShield'} logo preview`} /><p>Clear signals. Confident decisions.</p></div>
            <div className="preview-footer"><span><span className="preview-dot" /> {logoStyle}</span><span>360 × 96 px</span></div>
          </div>
        </section> : section !== 'Overview' ? <section className="panel module-panel">
          <div className="panel-heading"><div><h2>{section} overview</h2><p>{section === 'Shipments' && showOnlyAtRiskShipments
            ? 'Showing only shipments marked At risk or Delayed.'
            : section === 'Returns'
            ? 'Track return request and completion dates. Best = before deadline · Good = deadline date · Poor = after deadline.'
            : section === 'SAP Demo' ? 'Local preview only — no SAP system is connected.' : 'Records are saved in MongoDB.'}</p></div>{section === 'Shipments' && showOnlyAtRiskShipments && <button className="text-link" onClick={() => { setShowOnlyAtRiskShipments(false); setQuery('') }}>Show all shipments <ArrowRight size={14} /></button>}</div>
          {section === 'Alerts' ? <RecordManager kind="alerts" records={alertRecords} demoMode={demoMode} searchQuery={query} onChanged={loadWorkspace} onSetResolved={setAlertResolved} /> :
            section === 'Shipments' ? <RecordManager kind="shipments" records={shipments} demoMode={demoMode} suppliers={suppliers} searchQuery={query} onlyAtRiskOrDelayed={showOnlyAtRiskShipments} onChanged={loadWorkspace} onDemoShipmentAdd={shipment => setShipments(current => [...current, shipment])} onDemoShipmentChange={shipment => setShipments(current => current.map(item => item.id === shipment.id ? shipment : item))} onNotify={setToast} /> :
              section === 'Inventory' ? <RecordManager kind="inventory" records={inventoryItems} demoMode={demoMode} suppliers={suppliers} shipments={shipments} searchQuery={query} onChanged={loadWorkspace} onDemoInventoryChange={item => setInventoryItems(current => current.map(existing => existing.id === item.id ? item : existing))} onNotify={setToast} /> :
                section === 'Suppliers' ? <RecordManager kind="suppliers" records={suppliers} demoMode={demoMode} returnRequests={returnRequests} searchQuery={query} onChanged={loadWorkspace} onDemoSupplierAdd={supplier => setSuppliers(current => [...current, supplier])} onNotify={setToast} /> :
                  section === 'Returns' ? <RecordManager kind="returns" records={returnRequests} demoMode={demoMode} suppliers={suppliers} inventoryItems={inventoryItems} searchQuery={query} onChanged={loadWorkspace} /> :
                    section === 'What-if' ? <WhatIfPanel items={inventoryItems} /> : section === 'SAP Demo' ? <SapDemoPanel /> : <ModelDataPanel />}
        </section> : <>
          <section className="metric-grid" aria-label="Supply chain metrics">
            <MetricCard title="On-time delivery" value={suppliers.length ? `${(suppliers.reduce((sum, item) => sum + Number.parseFloat(item.onTime), 0) / suppliers.length).toFixed(1)}%` : '—'} change={`${suppliers.length} suppliers`} positive caption="View suppliers" destination="the Suppliers page" onActivate={() => setSection('Suppliers')} icon={<PackageCheck size={18} />} />
            <MetricCard title="Shipments at risk" value={String(shipments.filter(shipmentIsAtRiskOrDelayed).length)} change={`${shipments.length} total`} positive={false} caption="View shipments" destination="at-risk or delayed shipments" onActivate={() => { setQuery(''); setSearchOpen(false); setShowOnlyAtRiskShipments(true); setSection('Shipments') }} icon={<Truck size={18} />} />
            <MetricCard title="Inventory coverage" value={inventoryItems.some(item => item.cover !== null) ? (inventoryItems.reduce((sum, item) => sum + (item.cover ?? 0), 0) / inventoryItems.filter(item => item.cover !== null).length).toFixed(1) : '—'} suffix=" days" change={`${inventoryItems.length} items`} positive={false} caption="View inventory" destination="the Inventory page" onActivate={() => setSection('Inventory')} icon={<Box size={18} />} />
            <MetricCard title="Supplier health" value={suppliers.length ? (suppliers.reduce((sum, item) => sum + item.score, 0) / suppliers.length).toFixed(0) : '—'} suffix="/100" change={`${suppliers.length} suppliers`} positive caption="View suppliers" destination="the Suppliers page" onActivate={() => setSection('Suppliers')} icon={<Users size={18} />} />
          </section>
          <section className="dashboard-grid">
            <div className="panel risk-panel">
              <div className="panel-heading chart-heading"><div><div className="title-with-info"><h2>Current shipment risk</h2><button className="info-button" aria-label="Risk score information" title="Risk scores are manually entered, not generated predictions. At-risk and delayed shipments, or scores of 70+, can be reviewed for supplier alternatives." onClick={() => setToast('Risk values are manually entered, not predictions. At-risk, delayed, and 70+ risk shipments can be reviewed for supplier alternatives.')}><CircleHelp size={15} /></button></div><p>Scores entered on current shipment records</p></div><span className="tool-pill">{shipments.length} records</span></div>
              <div className="risk-summary"><div><span className="summary-number">{shipments.filter(shipmentNeedsReview).length}</span><span className="summary-label">shipments needing review</span></div></div>
              <TrendChart values={shipments.slice(0, 24).flatMap(item => item.risk === null ? [] : [item.risk])} />
              <div className="chart-legend"><span><i className="legend-line" /> Risk score</span><span className="chart-note">Entered record values · Not a model prediction</span></div>
            </div>
            <div className="panel alerts-panel">
              <div className="panel-heading"><div><h2>Needs attention <span className="heading-count">{activeAlerts}</span></h2><p>Priority items to review</p></div><button className="text-link" onClick={() => setSection('Alerts')}>View all <ArrowRight size={14} /></button></div>
              <AlertList alerts={alertRecords.slice(0, 3)} onSetResolved={setAlertResolved} compact />
              <button className="all-alerts-button" onClick={() => setSection('Alerts')}>Go to alert center <ArrowRight size={15} /></button>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel shipments-panel">
              <div className="panel-heading"><div><div className="title-with-info"><h2>Shipment activity</h2><span className="table-count">{shipments.length} records</span></div><p>Your most recent shipments across all routes</p></div><button className="text-link" onClick={() => { setShowOnlyAtRiskShipments(false); setSection('Shipments') }}>All shipments <ArrowRight size={14} /></button></div>
              <ShipmentTable shipments={filteredShipments.slice(0, 4)} onView={id => { setShowOnlyAtRiskShipments(false); setSection('Shipments'); setQuery(id) }} />
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
        <button className="button button-dark" type="button" onClick={() => { setHelpOpen(false); setShowOnlyAtRiskShipments(false); setSection('Shipments') }}>Open shipments <ArrowRight size={14} /></button>
      </section>
    </div>}
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}

function MetricCard({ title, value, suffix, change, positive, caption, destination, onActivate, icon }: {
  title: string; value: string; suffix?: string; change: string; positive: boolean; caption: string; destination: string; onActivate: () => void; icon: ReactNode
}) {
  return <article className="panel metric-card" role="button" tabIndex={0} aria-label={`${title}: ${value}${suffix ?? ''}. Open ${destination}.`} onClick={onActivate} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onActivate()
    }
  }}>
    <div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon">{icon}</span></div>
    <div className="metric-value">{value}<span>{suffix}</span></div>
    <div className="metric-bottom"><span className={`metric-change ${positive ? 'change-positive' : 'change-negative'}`}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span className="metric-caption">{caption}</span></div>
  </article>
}

function AlertList({ alerts, onSetResolved, compact = false }: { alerts: Alert[]; onSetResolved: (id: string, resolved: boolean) => void; compact?: boolean }) {
  if (!alerts.length) return <div className="empty-alerts"><ShieldCheck size={20} /><strong>All caught up</strong><span>No active alerts need attention.</span></div>
  return <div className={`alert-list ${compact ? 'alert-list-compact' : ''}`}>{alerts.map(alert => <article className={`alert-item ${alert.acknowledged ? 'alert-item-resolved' : ''}`} key={alert.id}>
    <div className={`alert-icon alert-${alert.severity.toLowerCase()}`}><SeverityIcon kind={alert.icon} /></div>
    <div className="alert-copy"><div className="alert-title-row"><strong>{alert.title}</strong><span className={`severity-pill severity-${alert.severity.toLowerCase()}`}>{alert.severity}</span>{alert.acknowledged && <span className="alert-resolved-pill">Resolved</span>}</div><p>{alert.description}</p><span className="alert-time"><Clock3 size={12} />{alert.time}</span></div>
    <button className={`alert-ack ${alert.acknowledged ? 'alert-ack-checked' : ''}`} aria-pressed={Boolean(alert.acknowledged)} onClick={() => onSetResolved(alert.id, !alert.acknowledged)} aria-label={alert.acknowledged ? `Mark ${alert.title} unresolved` : `Mark ${alert.title} resolved`} title={alert.acknowledged ? 'Reopen alert' : 'Mark alert resolved'}>{alert.acknowledged && <Check size={15} />}</button>
  </article>)}</div>
}

function ShipmentTable({ shipments, onView }: { shipments: Shipment[]; onView: (id: string) => void }) {
  if (!shipments.length) return <div className="empty-state"><Search size={21} /><strong>No shipment records</strong><span>Add shipments from the Shipments page.</span></div>
  return <div className="table-scroll"><table className="shipment-table"><thead><tr><th>SHIPMENT</th><th>ROUTE / CARRIER</th><th>ETA</th><th>STATUS</th><th>RISK</th><th aria-label="Actions" /></tr></thead><tbody>
    {shipments.map(shipment => <tr key={shipment.id} onClick={() => onView(shipment.id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onView(shipment.id) }}>
      <td><div className="shipment-identity"><span className={`supplier-avatar avatar-${shipment.tone}`}>{shipment.initials}</span><span><strong>{shipment.id}</strong><small>{shipment.supplier}</small></span></div></td>
      <td><div className="route-text">{shipment.route}</div><small className="carrier-text">{shipment.carrier}</small></td>
      <td className="eta-text">{shipment.eta ? formatRecordDate(shipment.eta) : 'Not set'}</td>
      <td><span className={`shipment-status ${shipment.status ? `status-${shipment.status.toLowerCase().replace(' ', '-')}` : 'status-unset'}`}><i />{shipment.status ?? 'Not set'}</span></td>
      <td>{shipment.risk === null ? <span className="risk-unset">Not set</span> : <div className="risk-cell"><div className="risk-track"><span style={{ width: `${shipment.risk}%` }} className={shipment.risk > 70 ? 'risk-high' : shipment.risk > 35 ? 'risk-medium' : 'risk-low'} /></div><strong>{shipment.risk}%</strong></div>}</td>
      <td><button className="row-action" aria-label={`View ${shipment.id}`} onClick={event => { event.stopPropagation(); onView(shipment.id) }}><ChevronRight size={16} /></button></td>
    </tr>)}
  </tbody></table></div>
}

function RecordManager({ kind, records, demoMode = false, suppliers = [], shipments = [], inventoryItems = [], returnRequests = [], searchQuery = '', onlyAtRiskOrDelayed = false, onChanged, onDemoShipmentAdd, onDemoShipmentChange, onDemoInventoryChange, onDemoSupplierAdd, onSetResolved, onNotify }: {
  kind: RecordKind
  records: Array<Shipment | Alert | InventoryItem | Supplier | ReturnRequest>
  demoMode?: boolean
  suppliers?: Supplier[]
  shipments?: Shipment[]
  inventoryItems?: InventoryItem[]
  returnRequests?: ReturnRequest[]
  searchQuery?: string
  onlyAtRiskOrDelayed?: boolean
  onChanged: () => Promise<void>
  onDemoShipmentAdd?: (shipment: Shipment) => void
  onDemoShipmentChange?: (shipment: Shipment) => void
  onDemoInventoryChange?: (item: InventoryItem) => void
  onDemoSupplierAdd?: (supplier: Supplier) => void
  onSetResolved?: (id: string, resolved: boolean) => Promise<void>
  onNotify?: (message: string) => void
}) {
  const definition = recordDefinitions[kind]
  const managedRecords = toManagedRecords(records)
  const shipmentRecords = kind === 'shipments'
    ? records.filter((record): record is Shipment => 'supplier' in record && 'risk' in record)
    : []
  const linkedShipments = shipments
  function hasDemoRowAction(record: ManagedRecord) {
    if (kind === 'shipments') return shipmentRecords.some(shipment => shipment.id === record.id && shipmentNeedsReview(shipment))
    if (kind === 'alerts') return true
    return false
  }
  const showActionsColumn = !demoMode || managedRecords.some(hasDemoRowAction)
  const statusFilteredRecords = kind === 'shipments' && onlyAtRiskOrDelayed
    ? managedRecords.filter(record => record.status === 'At risk' || record.status === 'Delayed')
    : managedRecords
  const displayedRecords = statusFilteredRecords.filter(record =>
    !searchQuery || Object.values(record).some(value => String(value ?? '').toLowerCase().includes(searchQuery.trim().toLowerCase())))
  const [editing, setEditing] = useState<ManagedRecord | null | undefined>(undefined)
  const [alternativeFor, setAlternativeFor] = useState<Shipment | null>(null)
  const [inventoryAlternativeFor, setInventoryAlternativeFor] = useState<InventoryItem | null>(null)
  const [minimumShipmentEta, setMinimumShipmentEta] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [switchBusy, setSwitchBusy] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [retentionBenefit, setRetentionBenefit] = useState<SupplierRetentionBenefit | ''>('')
  const alternatives = suppliers
    .filter(supplier => supplier.name !== alternativeFor?.supplier)
    .sort((first, second) => second.score - first.score || Number.parseFloat(second.onTime) - Number.parseFloat(first.onTime))
  const inventoryAlternatives = suppliers
    .filter(supplier => !inventoryAlternativeFor?.suppliers.includes(supplier.name))
    .sort((first, second) => second.score - first.score || Number.parseFloat(second.onTime) - Number.parseFloat(first.onTime))

  function getFieldValue(record: ManagedRecord | null | undefined, fieldName: string) {
    if (!record) return undefined
    if (kind !== 'suppliers') return record[fieldName]
    const supplierFieldMap: Record<string, string> = {
      completedOrders: 'orders',
      onTimeRate: 'onTime',
      fulfillmentRate: 'fulfillment',
      reliabilityScore: 'score',
    }
    const value = record[supplierFieldMap[fieldName] ?? fieldName]
    return (fieldName === 'onTimeRate' || fieldName === 'fulfillmentRate') && typeof value === 'string'
      ? value.replace(/%$/, '')
      : value
  }

  async function switchSupplier(supplier: Supplier) {
    if (!alternativeFor) return
    const amount = Number(refundAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setSwitchError('Enter a refund amount greater than zero.')
      return
    }
    setSwitchBusy(true)
    setSwitchError('')
    const refund: BuyerRefund = {
      amount,
      currency: 'INR',
      fromSupplier: alternativeFor.supplier,
      toSupplier: supplier.name,
      recordedAt: new Date().toISOString(),
      status: 'Recorded - not processed',
    }
    try {
      if (demoMode) {
        onDemoShipmentChange?.({
          ...alternativeFor,
          supplier: supplier.name,
          initials: supplier.initials,
          tone: supplier.tone,
          buyerRefunds: [...(alternativeFor.buyerRefunds ?? []), refund],
        })
      } else {
        await apiRequest(`${definition.endpoint}/${encodeURIComponent(alternativeFor.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ supplier: supplier.name, initials: supplier.initials, tone: supplier.tone, buyerRefundAmount: amount }),
        })
        await onChanged()
      }
      setAlternativeFor(null)
      onNotify?.(demoMode
        ? `Demo preview: supplier for ${alternativeFor.id} changed and an INR ${amount.toFixed(2)} refund was recorded. No money was transferred.`
        : `Supplier for ${alternativeFor.id} changed and an INR ${amount.toFixed(2)} refund was recorded. No money was transferred.`)
    } catch (switchError) {
      setSwitchError(switchError instanceof Error ? switchError.message : 'Could not change the shipment supplier.')
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
    if (kind === 'shipments' && !record) {
      const earliestDate = new Date()
      earliestDate.setDate(earliestDate.getDate() + 1)
      setMinimumShipmentEta(`${earliestDate.getFullYear()}-${String(earliestDate.getMonth() + 1).padStart(2, '0')}-${String(earliestDate.getDate()).padStart(2, '0')}`)
    } else {
      setMinimumShipmentEta('')
    }
    const formValues: Record<string, string> = {}
    const formFields = kind === 'shipments' && record
      ? [...definition.fields, { name: 'buyerRefundAmount', label: 'Buyer refund amount (INR)', type: 'number' as const, min: 0.01 }]
      : definition.fields
    for (const field of formFields) {
      const current = getFieldValue(record, field.name)
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
    setEditing(record ?? null)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supplierChanged = kind === 'shipments' && Boolean(editing) && values.supplier !== editing?.supplier
    if (supplierChanged && (!Number.isFinite(Number(values.buyerRefundAmount)) || Number(values.buyerRefundAmount) <= 0)) {
      setError('Enter a refund amount greater than zero to change the supplier.')
      return
    }
    if (kind === 'inventory' && Number(values.quantity) <= Number(values.safetyStock)) {
      setError('On hand must be greater than safety stock.')
      return
    }
    setBusy(true)
    setError('')
    const formFields = kind === 'shipments' && editing
      ? [...definition.fields, { name: 'buyerRefundAmount', label: 'Buyer refund amount (INR)', type: 'number' as const, min: 0.01 }]
      : definition.fields
    const payload = Object.fromEntries(formFields
      .filter(field => !(editing && field.name === 'id') && !(kind === 'shipments' && !editing && ['status', 'risk'].includes(field.name)) && !(field.name === 'buyerRefundAmount' && (!values[field.name] || !supplierChanged)))
      .map(field => {
        const value = values[field.name] ?? ''
        if (field.type === 'number') return [field.name, Number(value)]
        if (field.type === 'date') return [field.name, value ? `${value}T00:00:00.000Z` : null]
        if (field.type === 'datetime-local') return [field.name, new Date(value).toISOString()]
        if (field.type === 'multiselect') return [field.name, selectedValues(value)]
        return [field.name, value]
      }))
    if (kind === 'shipments' && !editing) {
      const supplier = suppliers.find(item => item.name === payload.supplier)
      const tones = ['violet', 'blue', 'orange', 'teal']
      payload.tone = supplier?.tone ?? tones[records.length % tones.length]
    }
    try {
      if (demoMode && kind === 'shipments' && !editing) {
        const id = String(payload.id ?? '').trim()
        if (records.some(record => record.id === id)) {
          setError('A shipment with this ID already exists.')
          return
        }
        const shipment: Shipment = {
          id,
          supplier: String(payload.supplier ?? '').trim(),
          route: String(payload.route ?? '').trim(),
          carrier: String(payload.carrier ?? '').trim(),
          eta: payload.eta ? String(payload.eta) : null,
          status: payload.status ? payload.status as Shipment['status'] : null,
          risk: payload.risk === undefined ? null : Number(payload.risk),
          initials: String(payload.initials ?? '').trim().slice(0, 3).toUpperCase(),
          tone: String(payload.tone),
        }
        onDemoShipmentAdd?.(shipment)
        setEditing(undefined)
        onNotify?.('Demo shipment added. This change is temporary and is not saved to MongoDB.')
        return
      }
      if (demoMode && kind === 'suppliers' && !editing) {
        const name = String(payload.name ?? '').trim()
        if (!name) {
          setError('Supplier name is required.')
          return
        }
        const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'NS'
        const tones = ['blue', 'teal', 'violet', 'orange']
        onDemoSupplierAdd?.({
          id: `demo-supplier-${Date.now()}`,
          name,
          orders: Number(payload.completedOrders),
          onTime: `${Number(payload.onTimeRate).toFixed(1)}%`,
          fulfillment: `${Number(payload.fulfillmentRate).toFixed(1)}%`,
          score: Number(payload.reliabilityScore),
          tone: tones[records.length % tones.length],
          initials,
        })
        setEditing(undefined)
        onNotify?.('Demo supplier added. This change is temporary and is not saved to MongoDB.')
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
      <button className="button button-dark button-small" disabled={demoMode && kind !== 'suppliers' && kind !== 'shipments'} title={demoMode && kind !== 'suppliers' && kind !== 'shipments' ? 'Connect MongoDB to add saved records.' : undefined} onClick={() => openForm()}><Plus size={15} /> Add {recordLabels[kind]}</button>
    </div>
    {kind === 'returns' && (!suppliers.length || !inventoryItems.length) && <p className="record-prerequisite-note">Add at least one supplier and one inventory item before recording returns.</p>}
    {error && !editing && <p className="form-error" role="alert">{error}</p>}
    {displayedRecords.length === 0 ? <div className="empty-state"><Search size={21} /><strong>{records.length === 0 ? `No ${recordLabels[kind]} records yet` : onlyAtRiskOrDelayed && !searchQuery ? 'No at-risk or delayed shipments' : 'No matching shipments'}</strong><span>{records.length === 0 ? 'Add a record to get started.' : onlyAtRiskOrDelayed && !searchQuery ? 'All shipments are currently marked On track.' : 'Clear the search field to see all shipments.'}</span></div> :
      <div className="table-scroll"><table className="shipment-table module-table">
        <thead><tr>{definition.fields.map(field => <th key={field.name}>{field.name === 'suppliers' && kind === 'inventory' ? 'ASSIGNED SUPPLIERS' : field.label.toUpperCase()}</th>)}{kind === 'inventory' && <th>SUPPLIERS AT RISK</th>}{kind === 'shipments' && <th>BUYER REFUND</th>}{kind === 'returns' && <th>RATING</th>}{kind === 'suppliers' && <th>RETURN PERFORMANCE</th>}{showActionsColumn && <th>ACTIONS</th>}</tr></thead>
        <tbody>{displayedRecords.map(record => <tr key={record.id}>
          {definition.fields.map(field => {
            const value = kind === 'suppliers'
              ? ({ name: record.name, completedOrders: record.orders, onTimeRate: record.onTime, fulfillmentRate: record.fulfillment, reliabilityScore: record.score } as Record<string, unknown>)[field.name]
              : record[field.name]
            return <td key={field.name}>{field.name === 'suppliers' && kind === 'inventory'
            ? (Array.isArray(record.suppliers) && record.suppliers.length ? record.suppliers.join(', ') : '—')
            : kind === 'alerts' && field.name === 'severity' && record.acknowledged === true
              ? <>{String(value ?? '—')} <span className="alert-resolved-pill">Resolved</span></>
              : field.type === 'date'
              ? kind === 'returns' && field.name === 'completedAt' && !record[field.name] ? 'Pending' : formatRecordDate(record[field.name])
              : String(value ?? (kind === 'returns' && field.name === 'completedAt' ? 'Pending' : '—'))}</td>
          })}
          {kind === 'shipments' && <td className="shipment-refund-cell">
            {(() => {
              const refunds = shipmentRecords.find(item => item.id === record.id)?.buyerRefunds ?? []
              const refund = refunds[refunds.length - 1]
              return refund
                ? <><strong>₹{refund.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>{refund.status}</small></>
                : <span className="inventory-supplier-clear">None recorded</span>
            })()}
          </td>}
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
                  return <span className="inventory-supplier-risk" key={name} title={shipment ? `${shipment.status ?? 'Status not set'} · ${shipment.risk ?? 'Risk score not set'} risk` : undefined}><i />{name}<small>At risk</small></span>
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
              const supplierReturns = returnRequests.filter(item => item.supplier === record.name && item.rating !== 'Pending')
              const onTime = supplierReturns.filter(item => item.rating === 'Best' || item.rating === 'Good').length
              const best = supplierReturns.filter(item => item.rating === 'Best').length
              const good = supplierReturns.filter(item => item.rating === 'Good').length
              const poor = supplierReturns.filter(item => item.rating === 'Poor').length
              if (!supplierReturns.length) return <span className="inventory-supplier-clear">No return history</span>
              const performance = Math.round(onTime / supplierReturns.length * 100)
              return <><strong>{performance}% on time</strong><small>{best} Best · {good} Good · {poor} Poor</small>
                {performance < 40 && <span className="supplier-return-warning" role="alert">There is an issue with this supplier. Please take relevant actions. Reason: returns are not being completed properly.</span>}
              </>
            })()}
          </td>}
          {showActionsColumn && <td className="record-actions">
            {kind === 'shipments' && shipmentRecords.some(shipment => shipment.id === record.id && shipmentNeedsReview(shipment)) && <button className="button button-outline button-small" type="button" onClick={() => {
              const shipment = shipmentRecords.find(item => item.id === record.id)
              if (shipment) {
                setAlternativeFor(shipment)
                setSwitchError('')
                setRefundAmount('')
                setRetentionBenefit('')
              }
            }}>Find alternative</button>}
            {kind === 'alerts' && onSetResolved && <button className="button button-outline button-small" aria-pressed={Boolean(record.acknowledged)} onClick={() => void onSetResolved(record.id, record.acknowledged !== true)}>{record.acknowledged ? 'Reopen' : 'Mark resolved'}</button>}
            {!demoMode && <>
              <button className="button button-outline button-small" onClick={() => openForm(record)}>Edit</button>
              <button className="button button-outline button-small" onClick={() => void remove(record)}>Delete</button>
            </>}
            {demoMode && !hasDemoRowAction(record) && <span className="record-actions-empty">No actions</span>}
          </td>}
        </tr>)}</tbody>
      </table></div>}
    {editing !== undefined && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(undefined) }}>
      <form className="record-form" onSubmit={event => void save(event)}>
        <div className="panel-heading"><div><h2>{editing ? 'Edit' : 'Add'} {recordLabels[kind]}</h2><p>{demoMode ? `Demo ${recordLabels[kind]} data stays in this page session and is not saved to MongoDB.` : 'Saved securely to the connected database.'}</p>{kind === 'shipments' && !editing && <small className="record-field-help">Choose an estimated arrival date after today. Status and risk score will remain unset.</small>}</div><button className="icon-btn" type="button" aria-label="Close form" onClick={() => setEditing(undefined)}><X size={17} /></button></div>
        {(kind === 'shipments' && editing
          ? [...definition.fields, { name: 'buyerRefundAmount', label: 'Buyer refund amount (INR)', type: 'number' as const, min: 0.01 }]
          : definition.fields).filter(field => !(kind === 'shipments' && !editing && ['status', 'risk'].includes(field.name))).map(field => <label className="record-field" key={field.name}>{field.label}
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
            : <input className="text-field" type={field.type || 'text'} required={field.name === 'buyerRefundAmount' ? Boolean(editing && values.supplier !== editing.supplier) : field.type !== 'date' || field.name !== 'completedAt'} min={kind === 'shipments' && !editing && field.name === 'eta' ? minimumShipmentEta : kind === 'inventory' && field.name === 'quantity' && values.safetyStock !== '' ? Number(values.safetyStock) + 1 : field.min} max={kind === 'inventory' && field.name === 'safetyStock' && values.quantity !== '' ? Number(values.quantity) - 1 : field.max} step={field.name === 'buyerRefundAmount' ? '0.01' : field.type === 'number' ? '1' : undefined} disabled={Boolean(editing) && field.name === 'id'} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />}
          {field.type === 'multiselect' && <small className="record-field-help">{suppliers.length ? 'Hold Ctrl (Windows) or Command (Mac) to select multiple suppliers.' : 'Add supplier records before assigning suppliers to inventory.'}</small>}
          {kind === 'inventory' && field.name === 'safetyStock' && <small className="record-field-help">On hand must be greater than safety stock.</small>}
          {field.name === 'buyerRefundAmount' && <small className="record-field-help">Required when changing the supplier. This records the refund only; no money is transferred.</small>}
        </label>)}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="record-form-actions"><button className="button button-outline" type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></div>
      </form>
    </div>}
    {alternativeFor && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !switchBusy) setAlternativeFor(null) }}>
      <section className="supplier-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-switch-title">
        <div className="panel-heading">
          <div><h2 id="supplier-switch-title">Emergency alternatives for {alternativeFor.id}</h2><p>{alternativeFor.supplier} · {alternativeFor.route} · {alternativeFor.status ?? 'Status not set'}</p></div>
          <button className="icon-btn" type="button" aria-label="Close alternatives" disabled={switchBusy} onClick={() => setAlternativeFor(null)}><X size={17} /></button>
        </div>
        <p className="supplier-switch-note">{demoMode
          ? 'Preview only: these synthetic supplier records are for demonstration. A switch updates this page temporarily and is not saved.'
          : 'Options use only supplier records already entered in this workspace. Confirm capacity and emergency delivery with the supplier before switching.'}</p>
        <label className="refund-amount-field">Buyer refund amount (INR)<input className="text-field" type="number" min="0.01" step="0.01" required value={refundAmount} onChange={event => setRefundAmount(event.target.value)} /></label>
        <p className="supplier-switch-footnote">The refund is recorded for tracking only. No money is transferred by this app.</p>
        {switchError && <p className="form-error" role="alert">{switchError}</p>}
        <section className="supplier-retention-offer" aria-labelledby="supplier-retention-title">
          <div>
            <h3 id="supplier-retention-title">Want to stay with {alternativeFor.supplier}?</h3>
            <p>Keep the current supplier and choose one benefit:</p>
          </div>
          <div className="retention-benefit-options" role="radiogroup" aria-label="Choose a benefit for keeping the current supplier">
            {(['Super coins', '20% cashback', 'Surprise gift'] as const).map(benefit => <label className={`retention-benefit-option ${retentionBenefit === benefit ? 'retention-benefit-selected' : ''}`} key={benefit}>
              <input type="radio" name="retention-benefit" value={benefit} checked={retentionBenefit === benefit} onChange={() => setRetentionBenefit(benefit)} />
              <span>{benefit}</span>
            </label>)}
          </div>
          <button className="button button-outline button-small" type="button" disabled={!retentionBenefit} onClick={() => {
            if (!retentionBenefit) return
            const benefit = retentionBenefit
            setAlternativeFor(null)
            onNotify?.(`You chose to keep ${alternativeFor.supplier} with the ${benefit} offer. Please arrange the benefit separately; it was not issued by the app.`)
          }}>Keep current supplier</button>
          <small>The app only displays this offer; it does not issue coins, process cashback, or arrange a gift.</small>
        </section>
        {alternatives.length ? <div className="alternative-list">{alternatives.map(supplier => <article className="alternative-card" key={supplier.id}>
          <div className={`supplier-avatar avatar-${supplier.tone}`}>{supplier.initials}</div>
          <div className="alternative-details"><strong>{supplier.name}</strong><span>Reliability {supplier.score}/100 · On time {supplier.onTime} · Fulfillment {supplier.fulfillment}</span><small>{supplier.orders} completed orders recorded</small></div>
          <button className="button button-dark button-small" type="button" disabled={switchBusy || !Number.isFinite(Number(refundAmount)) || Number(refundAmount) <= 0} onClick={() => void switchSupplier(supplier)}>{switchBusy ? 'Updating…' : 'Record refund & switch'}</button>
        </article>)}</div> : <div className="empty-state"><Users size={21} /><strong>No alternative suppliers available</strong><span>Add another supplier in the Suppliers section to compare workspace records.</span></div>}
        <p className="supplier-switch-footnote">The refund amount and supplier change are recorded together. The ETA and risk score are unchanged.</p>
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
      <p className="privacy-note"><ShieldCheck size={15} /> Simulation only. Live records and alerts are not changed.</p>
    </div>
    <div className="scenario-results"><span className="tool-pill"><Activity size={14} /> SIMULATED OUTCOME</span><h3>{selectedItem ? `${selectedItem.detail} · ${selectedItem.item}` : 'No inventory records'}</h3><p>Scenario arithmetic based on the first inventory record currently in MongoDB.</p><div className="scenario-metrics"><div><span>Current coverage</span><strong>{currentCover === null ? 'Not calculable' : `${currentCover} days`}</strong></div><ArrowRight size={17} /><div className="scenario-impact"><span>Projected coverage</span><strong>{projectedCover === null ? '—' : `${projectedCover} days`}</strong></div></div><div className="scenario-warning"><span className="status-dot" />{projectedCover === null ? 'Add an inventory item with positive daily demand to run this scenario.' : projectedCover <= 3 ? 'Potential stockout before replenishment. Review source records.' : 'Coverage remains above the illustrative 3-day threshold.'}</div><small>Illustrative arithmetic only · No predictive model used</small></div>
  </div>
}

function ModelDataPanel() {
  return <div className="model-data-grid">
    <div className="model-status-card"><span className="tool-pill"><Box size={14} /> BENCHMARK DATA · NOT APP RECORDS</span><div className="model-status-title">Olist Brazilian E-Commerce</div><p>Nine original CSV files are stored locally for the educational benchmark. They are not imported into MongoDB or used as live SupplyShield shipment data.</p><div className="model-dataset-summary"><div><span>Eligible delivered orders</span><strong>96,470</strong></div><div><span>Late deliveries</span><strong>7,826 · 8.11%</strong></div><div><span>Label</span><strong>Actual delivery after estimated date</strong></div></div><div className="model-fallback model-warning"><Clock3 size={16} /><span>CC BY-NC-SA 4.0 · Non-commercial educational use only. See the dataset analysis for exclusions and limitations.</span></div></div>
  </div>
}

const simulatedPurchaseOrders = [
  { po: 'SIM-450001021', supplier: 'Northstar Components (sample)', material: 'Protective gloves · DEMO-MAT-01', quantity: '12,000 boxes', expected: '2026-11-14', status: 'On track' },
  { po: 'SIM-450001022', supplier: 'Coastal Industrial Supply (sample)', material: 'Sterile saline · DEMO-MAT-02', quantity: '4,800 units', expected: '2026-11-09', status: 'At risk' },
  { po: 'SIM-450001023', supplier: 'Westline Materials (sample)', material: 'Packing cartons · DEMO-MAT-03', quantity: '2,400 units', expected: '2026-11-06', status: 'Delayed' },
]

function SapDemoPanel() {
  return <div className="sap-demo-layout">
    <div className="sap-demo-banner" role="note">
      <span className="sap-demo-badge"><Database size={14} /> SIMULATED SAP DATA</span>
      <div><strong>No live SAP connection.</strong><p>These locally defined sample purchase orders only demonstrate how SAP-style data could appear in SupplyShield. Nothing is fetched from SAP or saved to MongoDB.</p></div>
    </div>
    <div className="sap-demo-stats">
      <div className="sap-demo-stat"><span>Connection</span><strong className="sap-demo-disconnected"><i /> Not connected</strong></div>
      <div className="sap-demo-stat"><span>Data source</span><strong>Local demo fixture</strong></div>
      <div className="sap-demo-stat"><span>Sample purchase orders</span><strong>{simulatedPurchaseOrders.length}</strong></div>
    </div>
    <div className="panel sap-demo-table-panel">
      <div className="panel-heading"><div><h2>Purchase order preview</h2><p>Illustrative purchasing and delivery fields · all values are simulated</p></div><span className="tool-pill">MOCK PAYLOAD</span></div>
      <div className="table-scroll"><table className="shipment-table module-table">
        <thead><tr><th>DEMO PO</th><th>SUPPLIER</th><th>MATERIAL</th><th>QUANTITY</th><th>EXPECTED DELIVERY</th><th>DEMO STATUS</th></tr></thead>
        <tbody>{simulatedPurchaseOrders.map(order => <tr key={order.po}>
          <td><strong>{order.po}</strong></td><td>{order.supplier}</td><td>{order.material}</td><td>{order.quantity}</td><td>{order.expected}</td>
          <td><span className={`sap-demo-status sap-demo-status-${order.status.toLowerCase().replace(' ', '-')}`}>{order.status}</span></td>
        </tr>)}</tbody>
      </table></div>
      <p className="sap-demo-footnote"><ShieldCheck size={14} /> Demo only. These records must not be used for operational decisions or described as live SAP data.</p>
    </div>
  </div>
}

export default App
