import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Box,
  Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cloud,
  Download, LayoutDashboard, LogOut, Menu,
  PackageCheck, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Truck, Users, X,
} from 'lucide-react'
import { type Alert, type InventoryItem, type Shipment, type Supplier } from './data'

type Section = 'Overview' | 'Shipments' | 'Inventory' | 'Suppliers' | 'Alerts' | 'What-if' | 'Model & data' | 'Branding'
type RecordKind = 'shipments' | 'inventory' | 'suppliers' | 'alerts'
type ManagedRecord = { id: string; [key: string]: unknown }

type RecordField = {
  name: string
  label: string
  type?: 'text' | 'number' | 'datetime-local' | 'select'
  options?: string[]
  min?: number
  max?: number
}

const recordLabels: Record<RecordKind, string> = {
  shipments: 'shipment',
  inventory: 'inventory item',
  suppliers: 'supplier',
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
      { name: 'eta', label: 'Estimated arrival', type: 'datetime-local' },
      { name: 'status', label: 'Status', type: 'select', options: ['On track', 'At risk', 'Delayed'] },
      { name: 'risk', label: 'Risk score (entered value)', type: 'number', min: 0, max: 100 },
      { name: 'initials', label: 'Supplier initials' },
      { name: 'tone', label: 'Avatar color', type: 'select', options: ['violet', 'blue', 'orange', 'teal'] },
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
    ],
  },
  suppliers: {
    endpoint: '/api/suppliers',
    fields: [
      { name: 'name', label: 'Supplier name' },
      { name: 'completedOrders', label: 'Completed orders', type: 'number', min: 0 },
      { name: 'onTimeRate', label: 'On-time rate (%)', type: 'number', min: 0, max: 100 },
      { name: 'fulfillmentRate', label: 'Fulfillment rate (%)', type: 'number', min: 0, max: 100 },
      { name: 'reliabilityScore', label: 'Reliability score (entered value)', type: 'number', min: 0, max: 100 },
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
  { label: 'Alerts', icon: Bell, group: 'MONITOR' },
  { label: 'What-if', icon: Activity, group: 'MONITOR' },
  { label: 'Model & data', icon: SlidersHorizontal, group: 'MANAGE' },
  { label: 'Branding', icon: Sparkles, group: 'MANAGE' },
]

function toManagedRecords(records: Array<Shipment | Alert | InventoryItem | Supplier>): ManagedRecord[] {
  return records.map(record => ({ ...record })) as ManagedRecord[]
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
  URL.revokeObjectURL(url)
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertRecords, setAlertRecords] = useState<Alert[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed-out' | 'signed-in'>('loading')
  const [userEmail, setUserEmail] = useState('')
  const [apiError, setApiError] = useState('')
  const [toast, setToast] = useState('')
  const [logoColor, setLogoColor] = useState('#d9f36a')
  const [logoText, setLogoText] = useState('SupplyShield')
  const [logoStyle, setLogoStyle] = useState('Shield + route')

  async function loadWorkspace() {
    const [shipmentData, inventoryData, supplierData, alertData] = await Promise.all([
      apiJson<Shipment[]>('/api/shipments'),
      apiJson<InventoryItem[]>('/api/inventory'),
      apiJson<Supplier[]>('/api/suppliers'),
      apiJson<Alert[]>('/api/alerts'),
    ])
    setShipments(shipmentData)
    setAlerts(alertData.filter(alert => !alert.acknowledged))
    setAlertRecords(alertData)
    setInventoryItems(inventoryData)
    setSuppliers(supplierData)
    setApiError('')
  }

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const session = await apiJson<{ authenticated: boolean; email: string | null }>('/api/auth/session')
        if (!active) return
        if (!session.authenticated) {
          setAuthStatus('signed-out')
          return
        }
        setUserEmail(session.email || '')
        setAuthStatus('signed-in')
        try {
          await loadWorkspace()
        } catch (error) {
          if (active) setApiError(error instanceof Error ? error.message : 'Could not load database records.')
        }
      } catch (error) {
        if (active) {
          setApiError(error instanceof Error ? error.message : 'Could not connect to the server.')
          setAuthStatus('signed-out')
        }
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

  const filteredShipments = useMemo(() => shipments.filter(item =>
    `${item.id} ${item.supplier} ${item.route} ${item.carrier}`.toLowerCase().includes(query.toLowerCase())), [shipments, query])
  const activeAlerts = alerts.length
  const title = section === 'Overview' ? `Good morning, ${userEmail.split('@')[0] || 'there'}` : section
  const description = section === 'Overview'
    ? 'Here’s what’s happening across your supply chain today.'
    : section === 'Branding'
      ? 'Make the SupplyShield mark your own.'
      : `Monitor and manage your ${section.toLowerCase()} across the network.`

  async function handleLogin(email: string, password: string) {
    await apiJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    await loadWorkspace()
    setUserEmail(email)
    setAuthStatus('signed-in')
  }

  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
      setAuthStatus('signed-out')
      setShipments([])
      setAlerts([])
      setAlertRecords([])
      setInventoryItems([])
      setSuppliers([])
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Sign out failed.')
    }
  }

  async function acknowledge(alertId: string) {
    try {
      await apiRequest(`/api/alerts/${encodeURIComponent(alertId)}/acknowledge`, { method: 'PATCH' })
      await loadWorkspace()
      setToast('Alert acknowledgement saved.')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not acknowledge the alert.')
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

  if (authStatus === 'loading') {
    return <main className="auth-page"><div className="auth-card"><Logo /><p>Checking secure sign-in…</p></div></main>
  }
  if (authStatus === 'signed-out') {
    return <LoginScreen onLogin={handleLogin} initialError={apiError} />
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand-row"><Logo /><button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <button className="workspace-switch"><span className="workspace-avatar">S</span><span className="workspace-meta"><strong>SupplyShield</strong><small>Administrator workspace</small></span><ChevronDown size={16} /></button>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {(['WORKSPACE', 'MONITOR', 'MANAGE'] as const).map(group => <div className="nav-group" key={group}>
          <p className="nav-heading">{group}</p>
          {sections.filter(item => item.group === group).map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${section === item.label ? 'nav-active' : ''}`} onClick={() => { setSection(item.label); setSidebarOpen(false) }}>
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
        <button className="nav-item support-item" onClick={() => setToast('Help center is coming soon.')}><CircleHelp size={18} /><span>Help & support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">{userEmail.slice(0, 2).toUpperCase()}</div><div className="profile-meta"><strong>{userEmail}</strong><small>Administrator</small></div><button className="icon-btn signout-button" aria-label="Sign out" onClick={() => void logout()}><LogOut size={17} /></button></div>
      </div>
    </aside>

    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{section}</strong></div></div>
        <div className="topbar-actions">
          <div className={`data-status ${apiError ? 'demo' : 'connected'}`}><span className="status-dot" />{apiError ? 'Database unavailable' : 'MongoDB connected'}<span className="status-divider">·</span><span>Protected workspace</span></div>
          <button className="topbar-icon" aria-label="Search" onClick={() => setSearchOpen(!searchOpen)}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label={`${activeAlerts} notifications`} onClick={() => setSection('Alerts')}><Bell size={19} />{activeAlerts > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">{userEmail.slice(0, 2).toUpperCase()}</div>
        </div>
      </header>
      {searchOpen && <div className="global-search"><Search size={17} /><input autoFocus placeholder="Search shipments, suppliers, or items…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>ESC</kbd><button className="icon-btn" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="Close search"><X size={16} /></button></div>}

      <div className="content">
        {apiError && <div className="api-error" role="alert">{apiError} <button onClick={() => void loadWorkspace().catch(error => setApiError(error instanceof Error ? error.message : 'Could not load database records.'))}>Retry</button></div>}
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> MONGODB · ADMIN WORKSPACE</div><h1>{title}<span className="wave">✳</span></h1><p>{description}</p></div>
          <div className="heading-actions"><button className="button button-outline" onClick={() => setToast('Report export is not implemented yet.') }><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => setSection('Shipments')}><Plus size={17} /> Manage shipments</button></div>
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
          <div className="panel-heading"><div><h2>{section} overview</h2><p>Records saved in MongoDB · changes require administrator sign-in</p></div></div>
          {section === 'Alerts' ? <RecordManager kind="alerts" records={alertRecords} onChanged={loadWorkspace} onAcknowledge={acknowledge} /> :
            section === 'Shipments' ? <RecordManager kind="shipments" records={shipments} onChanged={loadWorkspace} /> :
              section === 'Inventory' ? <RecordManager kind="inventory" records={inventoryItems} onChanged={loadWorkspace} /> :
                section === 'Suppliers' ? <RecordManager kind="suppliers" records={suppliers} onChanged={loadWorkspace} /> :
                  section === 'What-if' ? <WhatIfPanel items={inventoryItems} /> : <ModelDataPanel />}
        </section> : <>
          <section className="metric-grid" aria-label="Supply chain metrics">
            <MetricCard title="On-time delivery" value={suppliers.length ? `${(suppliers.reduce((sum, item) => sum + Number.parseFloat(item.onTime), 0) / suppliers.length).toFixed(1)}%` : '—'} change={`${suppliers.length} suppliers`} positive caption="database records" icon={<PackageCheck size={18} />} />
            <MetricCard title="Shipments at risk" value={String(shipments.filter(item => item.risk >= 70).length)} change={`${shipments.length} total`} positive={false} caption="current records" icon={<Truck size={18} />} />
            <MetricCard title="Inventory coverage" value={inventoryItems.some(item => item.cover !== null) ? (inventoryItems.reduce((sum, item) => sum + (item.cover ?? 0), 0) / inventoryItems.filter(item => item.cover !== null).length).toFixed(1) : '—'} suffix=" days" change={`${inventoryItems.length} items`} positive={false} caption="database records" icon={<Box size={18} />} />
            <MetricCard title="Supplier health" value={suppliers.length ? (suppliers.reduce((sum, item) => sum + item.score, 0) / suppliers.length).toFixed(0) : '—'} suffix="/100" change={`${suppliers.length} suppliers`} positive caption="database records" icon={<Users size={18} />} />
          </section>
          <section className="dashboard-grid">
            <div className="panel risk-panel">
              <div className="panel-heading chart-heading"><div><div className="title-with-info"><h2>Current shipment risk</h2><button className="info-button" aria-label="Risk score information"><CircleHelp size={15} /></button></div><p>Scores entered on current shipment records</p></div><span className="tool-pill">{shipments.length} records</span></div>
              <div className="risk-summary"><div><span className="summary-number">{shipments.filter(item => item.risk >= 70).length}</span><span className="summary-label">high-risk shipments (70+)</span></div></div>
              <TrendChart values={shipments.slice(0, 24).map(item => item.risk)} />
              <div className="chart-legend"><span><i className="legend-line" /> Risk score</span><span className="chart-note">Entered record values · Not a model prediction</span></div>
            </div>
            <div className="panel alerts-panel">
              <div className="panel-heading"><div><h2>Needs attention <span className="heading-count">{activeAlerts}</span></h2><p>Priority items to review</p></div><button className="text-link" onClick={() => setSection('Alerts')}>View all <ArrowRight size={14} /></button></div>
              <AlertList alerts={alerts.slice(0, 3)} onAcknowledge={acknowledge} compact />
              <button className="all-alerts-button" onClick={() => setSection('Alerts')}>Go to alert center <ArrowRight size={15} /></button>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel shipments-panel">
              <div className="panel-heading"><div><div className="title-with-info"><h2>Shipment activity</h2><span className="table-count">{shipments.length} records</span></div><p>Your most recent shipments across all routes</p></div><button className="text-link" onClick={() => setSection('Shipments')}>All shipments <ArrowRight size={14} /></button></div>
              <ShipmentTable shipments={filteredShipments.slice(0, 4)} onView={id => setToast(`Opening details for ${id}`)} />
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
          <div className="footer-note"><ShieldCheck size={15} /><span>Decision support, not automated action.</span><span className="footer-divider">·</span><span>Risk values are manually entered; no prediction model is connected.</span><button onClick={() => setToast('MongoDB stores the records entered by an authenticated administrator.')}>About this workspace</button></div>
        </>}
      </div>
    </main>
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}

function MetricCard({ title, value, suffix, change, positive, caption, icon }: {
  title: string; value: string; suffix?: string; change: string; positive: boolean; caption: string; icon: ReactNode
}) {
  return <article className="panel metric-card">
    <div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon">{icon}</span></div>
    <div className="metric-value">{value}<span>{suffix}</span></div>
    <div className="metric-bottom"><span className={`metric-change ${positive ? 'change-positive' : 'change-negative'}`}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span className="metric-caption">{caption}</span></div>
  </article>
}

function AlertList({ alerts, onAcknowledge, compact = false }: { alerts: Alert[]; onAcknowledge: (id: string) => void; compact?: boolean }) {
  if (!alerts.length) return <div className="empty-alerts"><ShieldCheck size={20} /><strong>All caught up</strong><span>No active alerts need attention.</span></div>
  return <div className={`alert-list ${compact ? 'alert-list-compact' : ''}`}>{alerts.map(alert => <article className="alert-item" key={alert.id}>
    <div className={`alert-icon alert-${alert.severity.toLowerCase()}`}><SeverityIcon kind={alert.icon} /></div>
    <div className="alert-copy"><div className="alert-title-row"><strong>{alert.title}</strong><span className={`severity-pill severity-${alert.severity.toLowerCase()}`}>{alert.severity}</span></div><p>{alert.description}</p><span className="alert-time"><Clock3 size={12} />{alert.time}</span></div>
    <button className="alert-ack" onClick={() => onAcknowledge(alert.id)} aria-label={`Acknowledge ${alert.title}`} title="Acknowledge alert"><Check size={15} /></button>
  </article>)}</div>
}

function ShipmentTable({ shipments, onView }: { shipments: Shipment[]; onView: (id: string) => void }) {
  if (!shipments.length) return <div className="empty-state"><Search size={21} /><strong>No shipment records</strong><span>Add shipments from the Shipments page.</span></div>
  return <div className="table-scroll"><table className="shipment-table"><thead><tr><th>SHIPMENT</th><th>ROUTE / CARRIER</th><th>ETA</th><th>STATUS</th><th>RISK</th><th aria-label="Actions" /></tr></thead><tbody>
    {shipments.map(shipment => <tr key={shipment.id} onClick={() => onView(shipment.id)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onView(shipment.id) }}>
      <td><div className="shipment-identity"><span className={`supplier-avatar avatar-${shipment.tone}`}>{shipment.initials}</span><span><strong>{shipment.id}</strong><small>{shipment.supplier}</small></span></div></td>
      <td><div className="route-text">{shipment.route}</div><small className="carrier-text">{shipment.carrier}</small></td>
      <td className="eta-text">{shipment.eta}</td>
      <td><span className={`shipment-status status-${shipment.status.toLowerCase().replace(' ', '-')}`}><i />{shipment.status}</span></td>
      <td><div className="risk-cell"><div className="risk-track"><span style={{ width: `${shipment.risk}%` }} className={shipment.risk > 70 ? 'risk-high' : shipment.risk > 35 ? 'risk-medium' : 'risk-low'} /></div><strong>{shipment.risk}%</strong></div></td>
      <td><button className="row-action" aria-label={`View ${shipment.id}`} onClick={event => { event.stopPropagation(); onView(shipment.id) }}><ChevronRight size={16} /></button></td>
    </tr>)}
  </tbody></table></div>
}

function LoginScreen({ onLogin, initialError }: {
  onLogin: (email: string, password: string) => Promise<void>
  initialError: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <form className="auth-card" onSubmit={event => void submit(event)}>
      <Logo />
      <h1>Administrator sign in</h1>
      <p>Sign in to access the protected SupplyShield workspace.</p>
      <label className="field-label" htmlFor="admin-email">Email</label>
      <input id="admin-email" className="text-field" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
      <label className="field-label" htmlFor="admin-password">Password</label>
      <input id="admin-password" className="text-field" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="privacy-note"><ShieldCheck size={15} /> Credentials are verified by the server and never stored in the browser.</p>
    </form>
  </main>
}

function RecordManager({ kind, records, onChanged, onAcknowledge }: {
  kind: RecordKind
  records: Array<Shipment | Alert | InventoryItem | Supplier>
  onChanged: () => Promise<void>
  onAcknowledge?: (id: string) => Promise<void>
}) {
  const definition = recordDefinitions[kind]
  const managedRecords = toManagedRecords(records)
  const [editing, setEditing] = useState<ManagedRecord | null | undefined>(undefined)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function openForm(record?: ManagedRecord) {
    const formValues: Record<string, string> = {}
    for (const field of definition.fields) {
      const current = record?.[field.name]
      const value = current === undefined || current === null ? '' : String(current)
      formValues[field.name] = field.type === 'datetime-local' && value
        ? new Date(value).toISOString().slice(0, 16)
        : value
    }
    setValues(formValues)
    setEditing(record ?? null)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(definition.fields
      .filter(field => !(editing && (field.name === 'id')))
      .map(field => {
        const value = values[field.name] ?? ''
        if (field.type === 'number') return [field.name, Number(value)]
        if (field.type === 'datetime-local') return [field.name, new Date(value).toISOString()]
        return [field.name, value]
      }))
    try {
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
      <span>{records.length} saved record{records.length === 1 ? '' : 's'}</span>
      <button className="button button-dark button-small" onClick={() => openForm()}><Plus size={15} /> Add {recordLabels[kind]}</button>
    </div>
    {error && !editing && <p className="form-error" role="alert">{error}</p>}
    {records.length === 0 ? <div className="empty-state"><Search size={21} /><strong>No {recordLabels[kind]} records yet</strong><span>Add a record or load a verified dataset to get started.</span></div> :
      <div className="table-scroll"><table className="shipment-table module-table">
        <thead><tr>{definition.fields.map(field => <th key={field.name}>{field.label.toUpperCase()}</th>)}<th>ACTIONS</th></tr></thead>
        <tbody>{managedRecords.map(record => <tr key={record.id}>
          {definition.fields.map(field => <td key={field.name}>{String(record[field.name] ?? '—')}</td>)}
          <td className="record-actions">
            {kind === 'alerts' && record.acknowledged !== true && onAcknowledge && <button className="button button-outline button-small" onClick={() => void onAcknowledge(record.id)}>Acknowledge</button>}
            <button className="button button-outline button-small" onClick={() => openForm(record)}>Edit</button>
            <button className="button button-outline button-small" onClick={() => void remove(record)}>Delete</button>
          </td>
        </tr>)}</tbody>
      </table></div>}
    {editing !== undefined && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(undefined) }}>
      <form className="record-form" onSubmit={event => void save(event)}>
        <div className="panel-heading"><div><h2>{editing ? 'Edit' : 'Add'} {recordLabels[kind]}</h2><p>Saved securely to the connected database.</p></div><button className="icon-btn" type="button" aria-label="Close form" onClick={() => setEditing(undefined)}><X size={17} /></button></div>
        {definition.fields.map(field => <label className="record-field" key={field.name}>{field.label}
          {field.type === 'select'
            ? <select className="text-field" required value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>
              <option value="" disabled>Select…</option>{field.options?.map(option => <option key={option}>{option}</option>)}
            </select>
            : <input className="text-field" type={field.type || 'text'} required min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} disabled={Boolean(editing) && field.name === 'id'} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />}
        </label>)}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="record-form-actions"><button className="button button-outline" type="button" onClick={() => setEditing(undefined)}>Cancel</button><button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></div>
      </form>
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
    <div className="model-status-card"><span className="tool-pill"><Activity size={14} /> MODEL STATUS</span><div className="model-status-title"><span className="model-status-dot" /> No prediction model connected</div><p>Shipment risk values are entered manually by an administrator. This app does not calculate disruption probabilities.</p><div className="model-fallback"><ShieldCheck size={16} /><span>The app does not take automated operational actions.</span></div></div>
    <div className="model-status-card"><span className="tool-pill"><Box size={14} /> DATA PROVENANCE</span><div className="model-status-title">MongoDB operational records</div><p>No dataset has been imported yet. Add verified records manually; future CSV import should preserve source and validation information.</p><div className="model-fallback"><Clock3 size={16} /><span>Public supply-chain dataset loading is a separate follow-up step.</span></div></div>
  </div>
}

export default App
