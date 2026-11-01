import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, Bell, Box, CircleAlert,
  CircleHelp, Clock3, Database, Download, LayoutDashboard, Menu, Plus,
  RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Truck, Users, X,
} from 'lucide-react'

type Page = 'Overview' | 'Shipments' | 'Inventory' | 'Suppliers' | 'Returns' | 'Alerts' | 'What-if' | 'Model & data' | 'SAP Demo' | 'Branding'
type Shipment = {
  shipmentId: string
  date: string
  originPort: string
  destinationPort: string
  transportMode: string
  productCategory: string
  distanceKm: number
  weightMt: number
  fuelPriceIndex: number
  geopoliticalRiskScore: number
  weatherCondition: string
  carrierReliabilityScore: number
  leadTimeDays: number
  disruptionOccurred: boolean
}
type DatasetFile = {
  version: 1
  dataset: string
  sourceFile: string
  summary: {
    recordCount: number
    disruptionCount: number
    disruptionRate: number
    averageLeadTimeDays: number
    averageCarrierReliability: number
    dateFrom: string
    dateTo: string
  }
  shipments: Shipment[]
}
type ModeSummary = { mode: string; total: number; disrupted: number; rate: number }
type MonthlySummary = { month: string; total: number; disrupted: number; rate: number }

const sourceFile = 'global_supply_chain_risk_2026.csv'
const pageSize = 50
const navigation: { group: string; items: Array<{ label: Page; icon: typeof LayoutDashboard }> }[] = [
  { group: 'WORKSPACE', items: [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Shipments', icon: Truck }, { label: 'Inventory', icon: Box }, { label: 'Suppliers', icon: Users }, { label: 'Returns', icon: RotateCcw }] },
  { group: 'MONITOR', items: [{ label: 'Alerts', icon: Bell }, { label: 'What-if', icon: Activity }] },
  { group: 'MANAGE', items: [{ label: 'Model & data', icon: SlidersHorizontal }, { label: 'SAP Demo', icon: Database }, { label: 'Branding', icon: Sparkles }] },
]

const unavailablePages: Record<'Inventory' | 'Suppliers' | 'Returns', { title: string; detail: string }> = {
  Inventory: { title: 'Inventory data is not included', detail: 'The supplied CSV contains shipment weight but no stock quantities, SKU-level inventory, safety stock, or daily demand.' },
  Suppliers: { title: 'Supplier records are not included', detail: 'The CSV includes a carrier reliability score but no supplier or carrier identities, contact details, contracts, or supplier-level history.' },
  Returns: { title: 'Return data is not included', detail: 'This dataset has shipment disruption outcomes, but no product-return requests, completion dates, or refund records.' },
}

function isDatasetFile(value: unknown): value is DatasetFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Partial<DatasetFile>
  if (file.version !== 1 || file.dataset !== 'Global Supply Chain Risk 2026') return false
  if (!Array.isArray(file.shipments) || file.shipments.length === 0 || !file.summary || typeof file.summary !== 'object') return false
  const validShipments = file.shipments.every(shipment =>
    shipment !== null
    && typeof shipment === 'object'
    && typeof shipment.shipmentId === 'string'
    && typeof shipment.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(shipment.date)
    && !Number.isNaN(Date.parse(`${shipment.date}T00:00:00Z`))
    && typeof shipment.originPort === 'string'
    && typeof shipment.destinationPort === 'string'
    && typeof shipment.transportMode === 'string'
    && typeof shipment.productCategory === 'string'
    && Number.isFinite(shipment.distanceKm)
    && shipment.distanceKm >= 0
    && Number.isFinite(shipment.weightMt)
    && shipment.weightMt >= 0
    && Number.isFinite(shipment.fuelPriceIndex)
    && shipment.fuelPriceIndex >= 0
    && Number.isFinite(shipment.geopoliticalRiskScore)
    && shipment.geopoliticalRiskScore >= 0
    && shipment.geopoliticalRiskScore <= 10
    && typeof shipment.weatherCondition === 'string'
    && Number.isFinite(shipment.carrierReliabilityScore)
    && shipment.carrierReliabilityScore >= 0
    && shipment.carrierReliabilityScore <= 1
    && Number.isFinite(shipment.leadTimeDays)
    && shipment.leadTimeDays >= 0
    && typeof shipment.disruptionOccurred === 'boolean')
  if (!validShipments
    || typeof file.sourceFile !== 'string'
    || file.summary.recordCount !== file.shipments.length
    || !Number.isFinite(file.summary.averageLeadTimeDays)
    || !Number.isFinite(file.summary.averageCarrierReliability)
    || typeof file.summary.dateFrom !== 'string'
    || typeof file.summary.dateTo !== 'string'
    || !Number.isFinite(Date.parse(`${file.summary.dateFrom}T00:00:00Z`))
    || !Number.isFinite(Date.parse(`${file.summary.dateTo}T00:00:00Z`))
    || new Set(file.shipments.map(shipment => shipment.shipmentId)).size !== file.shipments.length
  ) return false
  const disruptionCount = file.shipments.filter(shipment => shipment.disruptionOccurred).length
  return file.summary.disruptionCount === disruptionCount
    && Math.abs(file.summary.disruptionRate - disruptionCount / file.shipments.length) < 1e-12
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function downloadCsv(shipments: Shipment[]) {
  const headers: Array<[keyof Shipment, string]> = [
    ['shipmentId', 'Shipment ID'],
    ['date', 'Date'],
    ['originPort', 'Origin port'],
    ['destinationPort', 'Destination port'],
    ['transportMode', 'Transport mode'],
    ['productCategory', 'Product category'],
    ['distanceKm', 'Distance (km)'],
    ['weightMt', 'Weight (MT)'],
    ['fuelPriceIndex', 'Fuel price index'],
    ['geopoliticalRiskScore', 'Geopolitical risk score'],
    ['weatherCondition', 'Weather condition'],
    ['carrierReliabilityScore', 'Carrier reliability score'],
    ['leadTimeDays', 'Lead time (days)'],
    ['disruptionOccurred', 'Disruption occurred'],
  ]
  const rows = [
    headers.map(([, label]) => label),
    ...shipments.map(shipment => headers.map(([key]) => String(shipment[key]))),
  ]
  const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.href = url
  link.download = 'supplyshield-supply-chain-shipments.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function MetricCard({ title, value, detail, icon: Icon, tone }: {
  title: string
  value: string
  detail: string
  icon: typeof Truck
  tone: string
}) {
  return <article className="command-metric-card panel">
    <div className="command-metric-top"><span className="command-metric-title">{title}</span><span className={`command-metric-icon ${tone}`}><Icon size={15} /></span></div>
    <strong className="command-metric-value">{value}</strong><small className="command-metric-detail">{detail}</small>
  </article>
}

function ShipmentTable({ shipments }: { shipments: Shipment[] }) {
  if (!shipments.length) return <div className="empty-state"><Search size={21} /><strong>No matching shipment records</strong><span>Adjust your search or disruption filter.</span></div>
  return <div className="table-scroll"><table className="shipment-table olist-orders-table"><thead><tr>
    <th>SHIPMENT</th><th>DATE</th><th>ROUTE</th><th>MODE</th><th>LEAD TIME</th><th>CARRIER RELIABILITY</th><th>GEO RISK</th><th>OUTCOME</th>
  </tr></thead><tbody>
    {shipments.map(shipment => <tr key={shipment.shipmentId}>
      <td><strong>{shipment.shipmentId}</strong></td>
      <td>{formatDate(shipment.date)}</td>
      <td>{shipment.originPort} → {shipment.destinationPort}</td>
      <td>{shipment.transportMode}<small className="olist-days-late">{shipment.productCategory}</small></td>
      <td>{shipment.leadTimeDays.toFixed(1)} days</td>
      <td>{percent(shipment.carrierReliabilityScore)}</td>
      <td>{shipment.geopoliticalRiskScore.toFixed(1)} / 10</td>
      <td><span className={`shipment-status ${shipment.disruptionOccurred ? 'status-delayed' : 'status-on-track'}`}><i />{shipment.disruptionOccurred ? 'Disruption' : 'No disruption'}</span></td>
    </tr>)}
  </tbody></table></div>
}

function ModeBreakdown({ modes, onSelect }: { modes: ModeSummary[]; onSelect: (mode: string) => void }) {
  return <section className="panel operational-signals-panel">
    <div className="panel-heading"><div><h2>Disruption rate by transport mode</h2><p>Historical outcomes in the supplied dataset</p></div><span className="tool-pill">OBSERVED</span></div>
    <div className="operational-signal-list">{modes.map((item, index) => <button className="mode-breakdown-row" key={item.mode} onClick={() => onSelect(item.mode)}>
      <div className="operational-signal-label"><span>{item.mode} · {item.disrupted.toLocaleString()} of {item.total.toLocaleString()}</span><strong>{percent(item.rate)}</strong></div>
      <div className="operational-signal-track"><i className={`signal-${index % 4}`} style={{ width: `${Math.max(3, item.rate * 100)}%` }} /></div>
    </button>)}</div>
    <div className="olist-data-warning"><CircleAlert size={15} /><span>Disruption rate is a descriptive historical proportion, not a live prediction.</span></div>
  </section>
}

function MonthlyDisruptionChart({ months }: { months: MonthlySummary[] }) {
  const peakRate = Math.max(...months.map(item => item.rate))
  const maximum = Math.max(0.1, Math.ceil(peakRate * 10) / 10)
  return <section className="panel olist-trend-panel">
    <div className="panel-heading"><div><h2>Disruptions by shipment month</h2><p>Observed disrupted shipments as a share of all records</p></div><span className="tool-pill">{months.length} months</span></div>
    <div className="olist-chart-scroll"><div className="olist-bars monthly-risk-bars" role="img" aria-label="Monthly shipment disruption rates">
      {months.map((item, index) => {
        const labelDate = new Date(`${item.month}-01T12:00:00`)
        const showLabel = index % 3 === 0 || index === months.length - 1
        return <div className="olist-bar-column" key={item.month} title={`${item.month}: ${percent(item.rate)} disruptions (${item.disrupted} of ${item.total})`}>
          <div className="olist-bar-track"><span className={item.rate === peakRate ? 'olist-bar olist-bar-peak' : 'olist-bar'} style={{ height: `${item.rate / maximum * 100}%` }} /></div>
          <span className="olist-bar-value">{percent(item.rate)}</span>
          <span className="olist-bar-label">{showLabel ? labelDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : ''}</span>
        </div>
      })}
    </div></div>
    <p className="olist-chart-note">Monthly rates summarize the supplied dataset only; they are not forecasts of future disruption.</p>
  </section>
}

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [disruptionFilter, setDisruptionFilter] = useState<'All outcomes' | 'Disruption' | 'No disruption'>('All outcomes')
  const [selectedMode, setSelectedMode] = useState('All modes')
  const [currentPage, setCurrentPage] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function loadShipments() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/global_supply_chain_risk_2026.json')
      if (!response.ok) throw new Error(`Could not load the supply-chain dataset (HTTP ${response.status}).`)
      const data: unknown = await response.json()
      if (!isDatasetFile(data)) throw new Error('The supply-chain dataset file is invalid or incomplete.')
      setShipments(data.shipments)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the shipment records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadShipments() }, [])

  const modes = useMemo(() => {
    const groups = new Map<string, { total: number; disrupted: number }>()
    for (const shipment of shipments) {
      const value = groups.get(shipment.transportMode) ?? { total: 0, disrupted: 0 }
      value.total += 1
      if (shipment.disruptionOccurred) value.disrupted += 1
      groups.set(shipment.transportMode, value)
    }
    return [...groups.entries()].map(([mode, value]) => ({ mode, ...value, rate: value.disrupted / value.total })).sort((a, b) => b.rate - a.rate)
  }, [shipments])
  const monthly = useMemo(() => {
    const groups = new Map<string, { total: number; disrupted: number }>()
    for (const shipment of shipments) {
      const month = shipment.date.slice(0, 7)
      const value = groups.get(month) ?? { total: 0, disrupted: 0 }
      value.total += 1
      if (shipment.disruptionOccurred) value.disrupted += 1
      groups.set(month, value)
    }
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second))
      .map(([month, value]) => ({ month, ...value, rate: value.disrupted / value.total }))
  }, [shipments])
  const filteredShipments = useMemo(() => {
    const term = query.trim().toLowerCase()
    return shipments.filter(shipment => {
      if (disruptionFilter === 'Disruption' && !shipment.disruptionOccurred) return false
      if (disruptionFilter === 'No disruption' && shipment.disruptionOccurred) return false
      if (selectedMode !== 'All modes' && shipment.transportMode !== selectedMode) return false
      const searchable = Object.values(shipment).join(' ').toLowerCase()
      return !term || searchable.includes(term)
    })
  }, [shipments, query, disruptionFilter, selectedMode])
  const pageCount = Math.ceil(filteredShipments.length / pageSize)
  const visibleShipments = filteredShipments.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const disruptedShipments = useMemo(() => shipments.filter(item => item.disruptionOccurred).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50), [shipments])
  const recentShipments = useMemo(() => [...shipments].sort((a, b) => b.date.localeCompare(a.date) || b.shipmentId.localeCompare(a.shipmentId)).slice(0, 5), [shipments])
  const sourceSummary = useMemo(() => {
    if (!shipments.length) return null
    const disrupted = shipments.filter(shipment => shipment.disruptionOccurred).length
    return {
      recordCount: shipments.length,
      disruptionCount: disrupted,
      disruptionRate: disrupted / shipments.length,
      averageLeadTimeDays: shipments.reduce((sum, item) => sum + item.leadTimeDays, 0) / shipments.length,
      averageCarrierReliability: shipments.reduce((sum, item) => sum + item.carrierReliabilityScore, 0) / shipments.length,
      dateFrom: [...shipments].map(item => item.date).sort()[0],
      dateTo: [...shipments].map(item => item.date).sort().slice(-1)[0] ?? '',
    }
  }, [shipments])

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setSidebarOpen(false)
    setQuery('')
    setDisruptionFilter('All outcomes')
    setSelectedMode('All modes')
    setCurrentPage(0)
  }

  function showMode(mode: string) {
    setSelectedMode(mode)
    setCurrentPage(0)
    setPage('Shipments')
  }

  function exportReport() {
    downloadCsv(filteredShipments)
  }

  return <div className="app-shell command-center-theme">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand-row"><div className="brand-lockup"><img src="/supplyshield-mark.svg" alt="" className="brand-mark" /><span className="brand-name">supply<span>shield</span><i>.</i></span></div><button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">S</span><span className="workspace-meta"><strong>SupplyShield</strong><small>Operations workspace</small></span></div>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map(group => <div className="nav-group" key={group.group}>
          <p className="nav-heading">{group.group}</p>
          {group.items.map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${page === item.label ? 'nav-active' : ''}`} onClick={() => navigate(item.label)}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
              {item.label === 'Alerts' && <span className="nav-count">{sourceSummary?.disruptionCount.toLocaleString() ?? '0'}</span>}
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card"><div className="plan-icon"><Sparkles size={16} /></div><strong>Supply chain, in sync.</strong><p>Review shipment routes and observed disruption outcomes.</p><button onClick={() => navigate('Model & data')}>Explore data status <ArrowRight size={14} /></button><div className="plan-orb orb-one" /><div className="plan-orb orb-two" /></div>
        <button className="nav-item support-item" onClick={() => navigate('Model & data')}><CircleHelp size={18} /><span>Help &amp; support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">S</div><div className="profile-meta"><strong>Open workspace</strong><small>No sign-in required</small></div></div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ArrowRight size={14} /><strong>{page}</strong></div></div>
        <div className="topbar-actions"><div className="data-status connected"><span className="status-dot" />Supply-chain dataset</div>
          {page === 'Overview' && <button className="command-search-trigger" aria-label="Search shipments" onClick={() => navigate('Shipments')}><Search size={16} /><span>Search shipments, routes...</span></button>}
          <button className={`topbar-icon ${page === 'Overview' ? 'command-search-icon' : ''}`} aria-label="Search shipments" onClick={() => navigate('Shipments')}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label="View disrupted shipments" onClick={() => { setDisruptionFilter('Disruption'); navigate('Alerts') }}><Bell size={19} />{(sourceSummary?.disruptionCount ?? 0) > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">S</div>
        </div>
      </header>
      <div className="content">
        <div className={`page-heading ${page === 'Overview' ? 'command-center-heading' : ''}`}>
          <div><div className="eyebrow"><span className="eyebrow-line" /> {page === 'Overview' ? 'SUPPLY CHAIN · COMMAND CENTER' : `SUPPLY CHAIN · ${page.toUpperCase()}`}</div><h1>{page === 'Overview' ? 'Command Center' : page}<span className="wave">✳</span></h1>
            <p>{page === 'Overview' ? `Shipment risk dataset · ${sourceSummary ? `${formatDate(sourceSummary.dateFrom)} – ${formatDate(sourceSummary.dateTo)}` : 'Loading data'}` : page === 'Shipments' ? 'Search and filter the supplied shipment records and observed outcomes.' : page === 'Alerts' ? 'Shipments marked as disrupted in the supplied historical dataset.' : page === 'Model & data' ? 'Dataset source, field definitions, and model status.' : `Review ${page.toLowerCase()} data availability for this dataset.`}</p>
          </div>
          <div className="heading-actions">{page !== 'Overview' && <button className="button button-outline" onClick={() => navigate('Overview')}><ArrowLeft size={16} /> Back to overview</button>}<button className="button button-outline" disabled={!shipments.length} onClick={exportReport}><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => navigate('Shipments')}><Plus size={17} /> Manage shipments</button></div>
        </div>
        {loadError && <div className="olist-load-error" role="alert"><CircleAlert size={18} /><span>{loadError}</span><button className="button button-outline button-small" onClick={() => void loadShipments()}>Retry</button></div>}
        {loading && <div className="panel olist-loading" role="status">Loading the supplied shipment-risk dataset…</div>}
        {!loading && !loadError && sourceSummary && page === 'Overview' && <>
          <div className="command-center-metrics">
            <MetricCard title="Shipment records" value={sourceSummary.recordCount.toLocaleString()} detail="Rows in the supplied dataset" icon={Truck} tone="metric-tone-blue" />
            <MetricCard title="Disruptions recorded" value={sourceSummary.disruptionCount.toLocaleString()} detail={`${percent(sourceSummary.disruptionRate)} of dataset records`} icon={CircleAlert} tone="metric-tone-orange" />
            <MetricCard title="Average carrier reliability" value={percent(sourceSummary.averageCarrierReliability)} detail="Source score · 0 to 1 scale" icon={ShieldCheck} tone="metric-tone-teal" />
            <MetricCard title="Average lead time" value={`${sourceSummary.averageLeadTimeDays.toFixed(1)} days`} detail={`${formatDate(sourceSummary.dateFrom)} – ${formatDate(sourceSummary.dateTo)}`} icon={Clock3} tone="metric-tone-violet" />
          </div>
          <div className="command-center-grid">
            <MonthlyDisruptionChart months={monthly} />
            <ModeBreakdown modes={modes} onSelect={showMode} />
          </div>
          <div className="operational-preview-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SOURCE · {sourceFile.toUpperCase()}</span><h2>Shipment activity</h2><p>Rows are shown as supplied; values are not live telemetry.</p></div><span className="operational-preview-badge">SOURCE DATA</span></div>
          <section className="bottom-grid">
            <div className="panel shipments-panel"><div className="panel-heading"><div><div className="title-with-info"><h2>Recent shipments</h2><span className="table-count">{sourceSummary.recordCount.toLocaleString()} records</span></div><p>Latest shipment dates and recorded disruption outcomes</p></div><button className="text-link" onClick={() => navigate('Shipments')}>All shipments <ArrowRight size={14} /></button></div><ShipmentTable shipments={recentShipments} /></div>
            <div className="panel inventory-panel"><div className="panel-heading"><div><h2>Disruption signals</h2><p>Historical values present in this CSV</p></div><Activity size={16} /></div>
              <div className="olist-definition"><span>Geopolitical risk score</span><strong>Average {shipments.length ? (shipments.reduce((sum, item) => sum + item.geopoliticalRiskScore, 0) / shipments.length).toFixed(1) : '—'} / 10</strong></div>
              <div className="olist-definition"><span>Disrupted shipments</span><strong>{sourceSummary.disruptionCount.toLocaleString()} recorded outcomes</strong></div>
              <div className="olist-data-warning"><CircleAlert size={15} /><span>These labels are recorded outcomes, not model predictions or live alerts.</span></div>
              <div className="inventory-foot"><span>{modes.length} transport modes</span><button onClick={() => navigate('Model & data')}>Data details <ArrowRight size={14} /></button></div>
            </div>
          </section>
        </>}
        {!loading && !loadError && page === 'Shipments' && <ShipmentsPage
          shipments={visibleShipments}
          total={filteredShipments.length}
          allModes={[...new Set(shipments.map(item => item.transportMode))].sort()}
          selectedMode={selectedMode}
          query={query}
          disruptionFilter={disruptionFilter}
          currentPage={currentPage}
          pageCount={pageCount}
          onQuery={value => { setQuery(value); setCurrentPage(0) }}
          onMode={value => { setSelectedMode(value); setCurrentPage(0) }}
          onFilter={value => { setDisruptionFilter(value); setCurrentPage(0) }}
          onPage={setCurrentPage}
          onExport={exportReport}
        />}
        {!loading && !loadError && page === 'Alerts' && <HistoricalAlerts shipments={disruptedShipments} onOpenShipments={id => { setQuery(id); setPage('Shipments'); setCurrentPage(0) }} />}
        {!loading && !loadError && (page === 'Inventory' || page === 'Suppliers' || page === 'Returns') && <UnavailableSection section={page} />}
        {!loading && !loadError && page === 'What-if' && <section className="panel unsupported-data-panel"><div className="panel-heading"><div><h2>Scenario inputs are not available</h2><p>This dataset contains recorded outcomes, not operational inventory or live shipment state.</p></div><Activity size={18} /></div><p>A useful what-if analysis needs decision inputs such as stock on hand, replenishment timing, or planned route changes. Those inputs are not present in the supplied CSV.</p><button className="text-link" onClick={() => navigate('Inventory')}>Review inventory data availability <ArrowRight size={14} /></button></section>}
        {!loading && !loadError && page === 'Model & data' && sourceSummary && <DataMethodology summary={sourceSummary} shipments={shipments} />}
        {!loading && !loadError && page === 'SAP Demo' && <UnavailableSection section="Suppliers" title="No SAP system is connected" detail="This application displays the supplied CSV; it does not connect to an SAP system or exchange live data." />}
        {!loading && !loadError && page === 'Branding' && <UnavailableSection section="Suppliers" title="Brand customization is unavailable" detail="Brand settings are not part of this dataset-focused workspace." />}
      </div>
    </main>
  </div>
}

function ShipmentsPage({ shipments, total, allModes, selectedMode, query, disruptionFilter, currentPage, pageCount, onQuery, onMode, onFilter, onPage, onExport }: {
  shipments: Shipment[]
  total: number
  allModes: string[]
  selectedMode: string
  query: string
  disruptionFilter: 'All outcomes' | 'Disruption' | 'No disruption'
  currentPage: number
  pageCount: number
  onQuery: (value: string) => void
  onMode: (value: string) => void
  onFilter: (value: typeof disruptionFilter) => void
  onPage: (value: number) => void
  onExport: () => void
}) {
  const first = total ? currentPage * pageSize + 1 : 0
  const last = Math.min((currentPage + 1) * pageSize, total)
  return <section className="panel olist-orders-panel">
    <div className="panel-heading"><div><h2>Shipment records</h2><p>{total.toLocaleString()} matching records · imported from the supplied CSV</p></div><button className="button button-outline button-small" onClick={onExport} disabled={!total}><Download size={14} /> Export filtered CSV</button></div>
    <div className="olist-filter-row">
      <label className="olist-search"><Search size={16} /><span className="sr-only">Search shipment records</span><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search shipment, port, mode, weather…" /></label>
      <label className="olist-filter-label">Mode<select value={selectedMode} onChange={event => onMode(event.target.value)}><option>All modes</option>{allModes.map(mode => <option key={mode}>{mode}</option>)}</select></label>
      <label className="olist-filter-label">Outcome<select value={disruptionFilter} onChange={event => onFilter(event.target.value as typeof disruptionFilter)}><option>All outcomes</option><option>Disruption</option><option>No disruption</option></select></label>
    </div>
    <ShipmentTable shipments={shipments} />
    <div className="olist-pagination"><span>Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}</span><div><button className="button button-outline button-small" onClick={() => onPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>Previous</button><span>Page {pageCount ? currentPage + 1 : 0} of {pageCount}</span><button className="button button-outline button-small" onClick={() => onPage(Math.min(pageCount - 1, currentPage + 1))} disabled={currentPage >= pageCount - 1}>Next</button></div></div>
  </section>
}

function HistoricalAlerts({ shipments, onOpenShipments }: { shipments: Shipment[]; onOpenShipments: (id: string) => void }) {
  return <section className="panel olist-orders-panel">
    <div className="panel-heading"><div><h2>Recorded disruptions</h2><p>{shipments.length.toLocaleString()} most recent disrupted shipments · historical outcomes, not live alerts</p></div><span className="tool-pill">SOURCE LABELS</span></div>
    <div className="historical-alert-list">{shipments.map(item => <article className="historical-alert-item" key={item.shipmentId}>
      <span className="historical-alert-icon"><CircleAlert size={16} /></span><div><strong>{item.shipmentId} · {item.originPort} → {item.destinationPort}</strong><p>{item.transportMode} · {item.productCategory} · {item.weatherCondition}</p><small>{formatDate(item.date)} · lead time {item.leadTimeDays.toFixed(1)} days · geopolitical score {item.geopoliticalRiskScore.toFixed(1)}/10</small></div>
      <button className="button button-outline button-small" onClick={() => onOpenShipments(item.shipmentId)}>View shipment</button>
    </article>)}</div>
  </section>
}

function UnavailableSection({ section, title, detail }: { section: 'Inventory' | 'Suppliers' | 'Returns'; title?: string; detail?: string }) {
  const information = unavailablePages[section]
  return <section className="panel unsupported-data-panel" role="status"><div className="panel-heading"><div><span className="tool-pill">DATA NOT AVAILABLE</span><h2>{title ?? information.title}</h2><p>{detail ?? information.detail}</p></div><Database size={18} /></div><p>Only fields present in <strong>{sourceFile}</strong> are displayed. No sample values are used to fill missing information.</p></section>
}

function DataMethodology({ summary, shipments }: { summary: DatasetFile['summary']; shipments: Shipment[] }) {
  const disruptionRows = shipments.filter(item => item.disruptionOccurred).length
  return <div className="olist-methodology-grid">
    <section className="panel olist-method-panel"><div className="panel-heading"><div><h2>Dataset source</h2><p>Local CSV supplied for this project</p></div><Database size={18} /></div><p><strong>{sourceFile}</strong> — Global Supply Chain Risk dataset. The source CSV was provided from the user's local files; no external publisher, dataset card, or license was supplied alongside it.</p><p>Rows: {shipments.length.toLocaleString()} · Dates: {formatDate(summary.dateFrom)} – {formatDate(summary.dateTo)}.</p><p>Dataset name as supplied: Global Supply Chain Risk 2026.</p></section>
    <section className="panel olist-method-panel"><div className="panel-heading"><div><h2>Field definitions</h2><p>Values retained from the CSV</p></div><Truck size={18} /></div><dl className="olist-definition-list"><div><dt>Disruption</dt><dd>The supplied Disruption_Occurred flag. It describes the row's label, not a model prediction.</dd></div><div><dt>Carrier reliability</dt><dd>The supplied 0–1 score. The CSV has no carrier name or identity.</dd></div><div><dt>Geopolitical risk</dt><dd>The supplied numeric score on a 0–10 scale; no new score is calculated.</dd></div><div><dt>Lead time</dt><dd>The supplied shipment lead-time value in days.</dd></div></dl></section>
    <section className="panel olist-method-panel olist-limitations"><div className="panel-heading"><div><h2>Data coverage &amp; limitations</h2><p>Use the supported fields without assuming missing details</p></div><CircleAlert size={18} /></div><ul><li>{summary.recordCount.toLocaleString()} shipment rows; {disruptionRows.toLocaleString()} are labeled as disrupted ({percent(disruptionRows / Math.max(1, shipments.length))}).</li><li>Route ports, mode, product category, distance, weight, fuel index, weather, geopolitical score, carrier-reliability score, lead time, and disruption outcome are present.</li><li>Inventory, supplier identities, returns, carrier identities, live location updates, and prediction history are not included.</li><li>The CSV does not include provenance or license information; confirm its redistribution terms before using it in a public deployment.</li></ul></section>
    <div className="olist-source-banner"><ShieldCheck size={17} /><span><strong>Source data only.</strong> Records are not altered into live operational updates and do not imply predictions.</span><span>{summary.recordCount.toLocaleString()} records</span></div>
  </div>
}

export default App
