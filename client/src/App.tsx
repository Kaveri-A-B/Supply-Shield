import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Box, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Cloud,
  Download, Filter, LayoutDashboard, Menu, MoreHorizontal,
  PackageCheck, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Truck, Users, X,
} from 'lucide-react'
import { initialAlerts, initialShipments, inventory, type Alert, type Shipment } from './data'

type Section = 'Overview' | 'Shipments' | 'Inventory' | 'Suppliers' | 'Alerts' | 'What-if' | 'Model & data' | 'Branding'

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

const riskData = [22, 27, 24, 35, 29, 38, 33, 42, 36, 47, 42, 53, 47, 61, 55, 66, 59, 73, 68, 79, 73, 86, 79, 92]

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

function TrendChart() {
  const points = riskData.map((value, index) => `${(index / (riskData.length - 1)) * 720},${180 - value * 1.65}`).join(' ')
  const area = `0,180 ${points} 720,180`
  return <div className="chart-wrap">
    <div className="chart-labels"><span>80</span><span>60</span><span>40</span><span>20</span></div>
    <svg className="trend-chart" viewBox="0 0 720 190" preserveAspectRatio="none" role="img" aria-label="Risk trend increased over the last 30 days">
      <defs>
        <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9cc94c" stopOpacity=".25" />
          <stop offset="100%" stopColor="#9cc94c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[15, 65, 115, 165].map(y => <line key={y} x1="0" x2="720" y1={y} y2={y} className="chart-grid" />)}
      <polygon points={area} fill="url(#area-fill)" />
      <polyline points={points} fill="none" stroke="#709b39" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx="720" cy={180 - riskData[riskData.length - 1] * 1.65} r="5" fill="#709b39" stroke="white" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="chart-dates"><span>Oct 01</span><span>Oct 06</span><span>Oct 11</span><span>Oct 16</span><span>Oct 21</span><span>Oct 28</span></div>
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
  const [shipments, setShipments] = useState<Shipment[]>(initialShipments)
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)
  const [apiStatus, setApiStatus] = useState<'connected' | 'demo'>('demo')
  const [toast, setToast] = useState('')
  const [period, setPeriod] = useState('Last 30 days')
  const [logoColor, setLogoColor] = useState('#d9f36a')
  const [logoText, setLogoText] = useState('SupplyShield')
  const [logoStyle, setLogoStyle] = useState('Shield + route')

  useEffect(() => {
    let active = true
    fetch('/api/dashboard')
      .then(response => {
        if (!response.ok) throw new Error('Dashboard API unavailable')
        return response.json()
      })
      .then(data => {
        if (!active) return
        if (Array.isArray(data.shipments)) setShipments(data.shipments)
        if (Array.isArray(data.alerts)) setAlerts(data.alerts)
        setApiStatus('connected')
      })
      .catch(() => { if (active) setApiStatus('demo') })
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
  const title = section === 'Overview' ? 'Good morning, Alex' : section
  const description = section === 'Overview'
    ? 'Here’s what’s happening across your supply chain today.'
    : section === 'Branding'
      ? 'Make the SupplyShield mark your own.'
      : `Monitor and manage your ${section.toLowerCase()} across the network.`

  function acknowledge(alertId: string) {
    setAlerts(current => current.filter(alert => alert.id !== alertId))
    setToast('Alert acknowledged and removed from your active queue.')
    fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' }).catch(() => undefined)
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
        <button className="workspace-switch"><span className="workspace-avatar">N</span><span className="workspace-meta"><strong>Northstar Health</strong><small>Operations team</small></span><ChevronDown size={16} /></button>
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
          <button onClick={() => setToast('Your workspace is running on synthetic demo data.')}>Explore insights <ArrowRight size={14} /></button>
          <div className="plan-orb orb-one" /><div className="plan-orb orb-two" />
        </div>
        <button className="nav-item support-item" onClick={() => setToast('Help center is coming soon.')}><CircleHelp size={18} /><span>Help & support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">AM</div><div className="profile-meta"><strong>Alex Morgan</strong><small>Supply chain manager</small></div><MoreHorizontal size={19} /></div>
      </div>
    </aside>

    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{section}</strong></div></div>
        <div className="topbar-actions">
          <div className={`data-status ${apiStatus}`}><span className="status-dot" />{apiStatus === 'connected' ? 'Live demo API' : 'Synthetic demo'}<span className="status-divider">·</span><span>Updated just now</span></div>
          <button className="topbar-icon" aria-label="Search" onClick={() => setSearchOpen(!searchOpen)}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label={`${activeAlerts} notifications`} onClick={() => setSection('Alerts')}><Bell size={19} />{activeAlerts > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">AM</div>
        </div>
      </header>
      {searchOpen && <div className="global-search"><Search size={17} /><input autoFocus placeholder="Search shipments, suppliers, or items…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>ESC</kbd><button className="icon-btn" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="Close search"><X size={16} /></button></div>}

      <div className="content">
        <div className="page-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> TUESDAY, OCTOBER 28, 2026</div><h1>{title}<span className="wave">✳</span></h1><p>{description}</p></div>
          <div className="heading-actions"><button className="button button-outline" onClick={() => setToast('Report prepared for your workspace.') }><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => setToast('New shipment workflow opened.') }><Plus size={17} /> New shipment</button></div>
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
          <div className="panel-heading"><div><h2>{section} overview</h2><p>Live workspace view · clearly labeled synthetic demo records</p></div><button className="button button-outline button-small" onClick={() => setToast(`${section} filters opened.`)}><Filter size={15} /> Filters</button></div>
          {section === 'Alerts' ? <AlertList alerts={alerts} onAcknowledge={acknowledge} /> :
            section === 'Shipments' ? <ShipmentTable shipments={filteredShipments} onView={id => setToast(`Opening details for ${id}`)} /> :
              section === 'Inventory' ? <InventoryTable /> :
                section === 'Suppliers' ? <SupplierTable /> :
                  section === 'What-if' ? <WhatIfPanel /> : <ModelDataPanel />}
        </section> : <>
          <section className="metric-grid" aria-label="Supply chain metrics">
            <MetricCard title="On-time delivery" value="94.2%" change="+2.4%" positive caption="vs. last 30 days" icon={<PackageCheck size={18} />} bars={[28, 40, 35, 51, 45, 61, 55, 74, 68, 82]} />
            <MetricCard title="Shipments at risk" value="12" change="+3" positive={false} caption="vs. last 30 days" icon={<Truck size={18} />} bars={[27, 34, 30, 48, 37, 55, 46, 63, 57, 78]} />
            <MetricCard title="Inventory coverage" value="18.6" suffix=" days" change="−1.2d" positive={false} caption="vs. last 30 days" icon={<Box size={18} />} bars={[70, 63, 72, 56, 61, 48, 55, 40, 45, 36]} />
            <MetricCard title="Supplier health" value="87" suffix="/100" change="+4 pts" positive caption="vs. last 30 days" icon={<Users size={18} />} bars={[34, 39, 43, 40, 52, 48, 59, 62, 70, 79]} />
          </section>
          <section className="dashboard-grid">
            <div className="panel risk-panel">
              <div className="panel-heading chart-heading"><div><div className="title-with-info"><h2>Supply chain risk</h2><button className="info-button" aria-label="Risk trend information"><CircleHelp size={15} /></button></div><p>Network-wide disruption signals over time</p></div><button className="select-button" onClick={() => setPeriod(period === 'Last 30 days' ? 'Last 7 days' : 'Last 30 days')}><CalendarDays size={15} />{period}<ChevronDown size={14} /></button></div>
              <div className="risk-summary"><div><span className="summary-number">24</span><span className="summary-label">active risk signals</span></div><span className="summary-change"><ArrowUpRight size={14} /> 8.3% <span>vs. prior period</span></span></div>
              <TrendChart />
              <div className="chart-legend"><span><i className="legend-line" /> Risk signals</span><span className="chart-note">Rules + ML · Probability is model-derived</span></div>
            </div>
            <div className="panel alerts-panel">
              <div className="panel-heading"><div><h2>Needs attention <span className="heading-count">{activeAlerts}</span></h2><p>Priority items to review</p></div><button className="text-link" onClick={() => setSection('Alerts')}>View all <ArrowRight size={14} /></button></div>
              <AlertList alerts={alerts.slice(0, 3)} onAcknowledge={acknowledge} compact />
              <button className="all-alerts-button" onClick={() => setSection('Alerts')}>Go to alert center <ArrowRight size={15} /></button>
            </div>
          </section>
          <section className="bottom-grid">
            <div className="panel shipments-panel">
              <div className="panel-heading"><div><div className="title-with-info"><h2>Shipment activity</h2><span className="table-count">12 active</span></div><p>Your most recent shipments across all routes</p></div><button className="text-link" onClick={() => setSection('Shipments')}>All shipments <ArrowRight size={14} /></button></div>
              <ShipmentTable shipments={filteredShipments.slice(0, 4)} onView={id => setToast(`Opening details for ${id}`)} />
            </div>
            <div className="panel inventory-panel">
              <div className="panel-heading"><div><h2>Inventory watchlist</h2><p>Items nearing safety stock</p></div><button className="text-link" onClick={() => setSection('Inventory')}>View all <ArrowRight size={14} /></button></div>
              <div className="inventory-list">{inventory.slice(0, 3).map((item, index) => <div className="inventory-item" key={item.item}>
                <div className={`inventory-glyph glyph-${index}`}><Box size={16} /></div>
                <div className="inventory-info"><div className="inventory-name">{item.item}</div><div className="inventory-location">{item.detail}</div></div>
                <div className="inventory-cover"><strong>{item.cover}</strong><span>days</span><span className={`mini-status ${item.status.toLowerCase()}`}>{item.status}</span></div>
              </div>)}</div>
              <div className="inventory-foot"><span>3 items need attention</span><button onClick={() => setSection('Inventory')}>Review inventory <ArrowRight size={14} /></button></div>
            </div>
          </section>
          <div className="footer-note"><ShieldCheck size={15} /><span>Decision support, not automated action.</span><span className="footer-divider">·</span><span>Always review source evidence before acting.</span><button onClick={() => setToast('Demo workspace uses synthetic data. No live operational data is connected.')}>About this demo</button></div>
        </>}
      </div>
    </main>
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}

function MetricCard({ title, value, suffix, change, positive, caption, icon, bars }: {
  title: string; value: string; suffix?: string; change: string; positive: boolean; caption: string; icon: ReactNode; bars: number[]
}) {
  return <article className="panel metric-card">
    <div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon">{icon}</span></div>
    <div className="metric-value">{value}<span>{suffix}</span></div>
    <div className="metric-bottom"><span className={`metric-change ${positive ? 'change-positive' : 'change-negative'}`}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span className="metric-caption">{caption}</span>
      <div className="sparkline" aria-hidden="true">{bars.map((bar, i) => <i key={i} style={{ height: `${bar}%` }} />)}</div>
    </div>
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
  if (!shipments.length) return <div className="empty-state"><Search size={21} /><strong>No matching shipments</strong><span>Try another search term.</span></div>
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

function InventoryTable() {
  return <div className="table-scroll"><table className="shipment-table module-table"><thead><tr><th>ITEM / LOCATION</th><th>ON HAND</th><th>SAFETY STOCK</th><th>DAYS OF COVER</th><th>STATUS</th></tr></thead><tbody>
    {inventory.map(item => <tr key={item.item}><td><div className="route-text">{item.item}</div><small className="carrier-text">{item.detail}</small></td><td className="eta-text">{item.quantity}</td><td className="eta-text">{item.status === 'Critical' ? '3,000' : '1,200'}</td><td><strong className={item.cover <= 7 ? 'cover-critical' : ''}>{item.cover} days</strong></td><td><span className={`inventory-tag tag-${item.status.toLowerCase()}`}>{item.status}</span></td></tr>)}
  </tbody></table></div>
}

function SupplierTable() {
  const suppliers = [
    { name: 'Medline Industries', orders: 128, onTime: '96.1%', fulfillment: '98.4%', score: 94, tone: 'violet', initials: 'MI' },
    { name: 'Cardinal Health', orders: 96, onTime: '92.7%', fulfillment: '97.2%', score: 89, tone: 'blue', initials: 'CH' },
    { name: 'Owens & Minor', orders: 74, onTime: '89.3%', fulfillment: '95.8%', score: 85, tone: 'teal', initials: 'OM' },
    { name: 'Baxter International', orders: 8, onTime: '75.0%', fulfillment: '91.2%', score: 76, tone: 'orange', initials: 'BI' },
  ]
  return <div className="table-scroll"><table className="shipment-table module-table"><thead><tr><th>SUPPLIER</th><th>COMPLETED ORDERS</th><th>ON-TIME RATE</th><th>FULFILLMENT</th><th>RELIABILITY</th></tr></thead><tbody>
    {suppliers.map(supplier => <tr key={supplier.name}><td><div className="shipment-identity"><span className={`supplier-avatar avatar-${supplier.tone}`}>{supplier.initials}</span><span><strong>{supplier.name}</strong><small>Delivery performance</small></span></div></td><td className="eta-text">{supplier.orders} <small className="carrier-text">{supplier.orders < 10 ? 'Insufficient sample' : 'Past 90 days'}</small></td><td className="eta-text">{supplier.onTime}</td><td className="eta-text">{supplier.fulfillment}</td><td><div className="supplier-score"><strong>{supplier.score}</strong><span>/100</span></div></td></tr>)}
  </tbody></table><p className="table-disclaimer">Reliability score uses delivery history; suppliers below 10 completed orders are not comparable.</p></div>
}

function WhatIfPanel() {
  const [delay, setDelay] = useState(3)
  const [demandIncrease, setDemandIncrease] = useState(20)
  const projectedCover = Math.max(0, Math.round(5 / (1 + demandIncrease / 100) - delay / 3))
  return <div className="scenario-layout">
    <div className="scenario-controls"><div className="field-label">Scenario type</div><select className="text-field" defaultValue="Delivery delay"><option>Delivery delay</option><option>Demand increase</option><option>Supplier disruption</option></select>
      <label className="field-label" htmlFor="delay-days">Shipment delay (days)</label><input id="delay-days" className="text-field" type="number" min="0" max="90" value={delay} onChange={event => setDelay(Math.max(0, Number(event.target.value)))} />
      <label className="field-label" htmlFor="demand-percent">Demand increase (%)</label><input id="demand-percent" className="text-field" type="number" min="0" max="300" value={demandIncrease} onChange={event => setDemandIncrease(Math.max(0, Number(event.target.value)))} />
      <p className="privacy-note"><ShieldCheck size={15} /> Simulation only. Live records and alerts are not changed.</p>
    </div>
    <div className="scenario-results"><span className="tool-pill"><Activity size={14} /> SIMULATED OUTCOME</span><h3>Boston Central · Nitrile gloves</h3><p>Estimated impact based on current synthetic inventory snapshot.</p><div className="scenario-metrics"><div><span>Current coverage</span><strong>5 days</strong></div><ArrowRight size={17} /><div className="scenario-impact"><span>Projected coverage</span><strong>{projectedCover} days</strong></div></div><div className="scenario-warning"><span className="status-dot" />{projectedCover <= 3 ? 'Potential stockout before replenishment. Review assumptions and source records.' : 'Coverage remains above the example safety threshold.'}</div><small>Illustrative arithmetic only · No predictive model used</small></div>
  </div>
}

function ModelDataPanel() {
  return <div className="model-data-grid">
    <div className="model-status-card"><span className="tool-pill"><Activity size={14} /> MODEL STATUS</span><div className="model-status-title"><span className="model-status-dot" /> ML inference unavailable</div><p>This prototype has no trained model artifact. Risk indicators shown elsewhere are illustrative demo values, not model predictions.</p><div className="model-fallback"><ShieldCheck size={16} /><span>Rule-only fallback is the required safe behavior when a model is unavailable.</span></div></div>
    <div className="model-status-card"><span className="tool-pill"><Box size={14} /> DATA PROVENANCE</span><div className="model-status-title">Synthetic demo dataset</div><p>Seeded records are for interface exploration only and are not evidence of real-world performance.</p><div className="model-fallback"><Clock3 size={16} /><span>Last updated just now · source: SupplyShield demo fixtures</span></div></div>
  </div>
}

export default App
