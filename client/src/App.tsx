import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, Bell, Box, CheckCircle2, CircleAlert,
  CircleHelp, Clock3, Database, Download, LayoutDashboard, Menu, Plus,
  RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Truck, Users, X,
} from 'lucide-react'
import olistAnalysis from '../../ml/reports/analysis_summary.json'

type Page = 'Overview' | 'Olist orders' | 'Data & methodology'
type OrderTuple = [string, string, string, 0 | 1, number, string, string]
type OlistOrderFile = { version: 1; orders: OrderTuple[] }

const sourceUrl = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce'
const regionNames: Record<string, string> = {
  N: 'North',
  NE: 'Northeast',
  CW: 'Central-West',
  SE: 'Southeast',
  S: 'South',
  M: 'Multiple regions',
  '-': 'Not available',
}
const pageSize = 50
const navigation: { group: string; items: Array<{ label: string; icon: typeof LayoutDashboard; page?: Page }> }[] = [
  { group: 'WORKSPACE', items: [{ label: 'Overview', icon: LayoutDashboard, page: 'Overview' as const }, { label: 'Shipments', icon: Truck, page: 'Olist orders' as const }, { label: 'Inventory', icon: Box }, { label: 'Suppliers', icon: Users }, { label: 'Returns', icon: RotateCcw }] },
  { group: 'MONITOR', items: [{ label: 'Alerts', icon: Bell }, { label: 'What-if', icon: Activity }] },
  { group: 'MANAGE', items: [{ label: 'Model & data', icon: SlidersHorizontal, page: 'Data & methodology' as const }, { label: 'SAP Demo', icon: Database }, { label: 'Branding', icon: Sparkles }] },
]

function isOrderFile(value: unknown): value is OlistOrderFile {
  if (!value || typeof value !== 'object') return false
  const file = value as { version?: unknown; orders?: unknown }
  if (file.version !== 1
    || !Array.isArray(file.orders)
    || file.orders.length !== olistAnalysis.target_summary.eligible_orders
    || !file.orders.every(order => Array.isArray(order)
      && order.length === 7
      && order.slice(0, 3).every(value => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
      && (order[3] === 0 || order[3] === 1)
      && Number.isInteger(order[4])
      && order[4] >= 0
      && typeof order[5] === 'string'
      && Object.prototype.hasOwnProperty.call(regionNames, order[5])
      && typeof order[6] === 'string'
      && Object.prototype.hasOwnProperty.call(regionNames, order[6]))) return false
  return file.orders.filter(order => order[3] === 1).length === olistAnalysis.target_summary.late_count
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatReference(index: number) {
  return `OLIST-${String(index + 1).padStart(6, '0')}`
}

function regionName(code: string) {
  return regionNames[code] ?? 'Not available'
}

function downloadCsv(orders: Array<{ order: OrderTuple; index: number }>) {
  const rows = [
    ['Reference', 'Purchase date', 'Estimated delivery', 'Actual delivery', 'Historical outcome', 'Days late', 'Seller region', 'Customer region'],
    ...orders.map(({ order, index }) => [
      formatReference(index),
      order[0],
      order[1],
      order[2],
      order[3] ? 'Late' : 'On time',
      String(order[4]),
      regionName(order[5]),
      regionName(order[6]),
    ]),
  ]
  const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.href = url
  link.download = 'olist-historical-orders.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function OlistBenchmarkPanel() {
  const { target_summary: summary, monthly_late_rate: monthlyRates } = olistAnalysis
  const peakRate = Math.max(...monthlyRates.map(month => month.late_rate))
  const firstMonth = new Date(`${monthlyRates[0].purchase_month}-01T12:00:00`)
  const lastMonth = new Date(`${monthlyRates[monthlyRates.length - 1].purchase_month}-01T12:00:00`)
  const period = `${firstMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${lastMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`

  return <section className="olist-benchmark-section" aria-labelledby="olist-benchmark-title">
    <div className="olist-section-heading">
      <div><span className="eyebrow"><span className="eyebrow-line" /> HISTORICAL RESEARCH DATASET</span><h2 id="olist-benchmark-title">Olist delivery benchmark</h2><p>Real, aggregated historical outcomes from the Brazilian E-Commerce Public Dataset.</p></div>
      <span className="olist-source-pill"><Database size={13} /> OLIST · AGGREGATES</span>
    </div>
    <div className="olist-stat-grid">
      <article className="panel olist-stat-card"><span>Eligible delivered orders</span><strong>{summary.eligible_orders.toLocaleString()}</strong><small>Valid actual and estimated delivery dates</small></article>
      <article className="panel olist-stat-card"><span>Late deliveries</span><strong>{summary.late_count.toLocaleString()}</strong><small>Arrived after the estimated date</small></article>
      <article className="panel olist-stat-card"><span>Historical late rate</span><strong>{(summary.late_share * 100).toFixed(2)}%</strong><small>Across eligible delivered orders</small></article>
      <article className="panel olist-stat-card"><span>Purchase period</span><strong className="olist-period-value">{period}</strong><small>Historical data · not current activity</small></article>
    </div>
    <div className="olist-analysis-grid">
      <div className="panel olist-trend-panel">
        <div className="panel-heading"><div><h2>Late delivery rate by purchase month</h2><p>Share delivered after the estimated date · historical Olist orders</p></div><span className="tool-pill">{monthlyRates.length} months</span></div>
        <div className="olist-chart-scroll">
          <svg className="olist-monthly-chart" viewBox="0 0 760 260" role="img" aria-label="Monthly historical late delivery rate for eligible Olist orders from September 2016 through August 2018">
            <title>Historical Olist late delivery rate by purchase month</title>
            {[0, 0.1, 0.2, 0.3].map(rate => {
              const y = 210 - rate / 0.3 * 170
              return <g key={rate}><line x1="42" x2="750" y1={y} y2={y} className="olist-chart-grid" /><text x="34" y={y + 4} textAnchor="end" className="olist-axis-label">{Math.round(rate * 100)}%</text></g>
            })}
            {monthlyRates.map((month, index) => {
              const band = 700 / monthlyRates.length
              const barHeight = month.late_rate / 0.3 * 170
              const x = 48 + index * band + band * 0.2
              const labelDate = new Date(`${month.purchase_month}-01T12:00:00`)
              const showLabel = index % 3 === 0 || index === monthlyRates.length - 1
              return <g key={month.purchase_month}>
                <rect x={x} y={210 - barHeight} width={band * 0.62} height={barHeight} rx="3" className={`olist-month-bar ${month.late_rate === peakRate ? 'olist-month-bar-peak' : ''}`}><title>{`${labelDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}: ${(month.late_rate * 100).toFixed(2)}% late from ${month.eligible_orders.toLocaleString()} eligible orders`}</title></rect>
                {showLabel && <text x={x + band * 0.31} y="232" textAnchor="middle" className="olist-axis-label">{labelDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</text>}
              </g>
            })}
          </svg>
        </div>
        <p className="olist-chart-note">Monthly rates can vary substantially; September 2016 had only one eligible order. These descriptive results are not a forecast.</p>
      </div>
      <aside className="panel olist-definition-panel">
        <div className="panel-heading"><div><h2>Benchmark definition</h2><p>What this dataset measures</p></div><CircleHelp size={15} /></div>
        <div className="olist-definition"><span>Outcome</span><strong>{olistAnalysis.target_definition}</strong></div>
        <div className="olist-definition"><span>Eligible records</span><strong>Delivered orders with valid actual and estimated delivery dates.</strong></div>
        <div className="olist-definition"><span>Excluded</span><strong>{olistAnalysis.excluded_records.total_orders.toLocaleString()} total orders minus incomplete or ineligible records.</strong></div>
        <div className="olist-data-warning"><CircleAlert size={15} /><span>Historical e-commerce data; these records do not represent current shipment activity.</span></div>
        <a className="olist-source-link" href={olistAnalysis.source} target="_blank" rel="noreferrer">Dataset source &amp; license <ArrowRight size={13} /></a>
        <span className="olist-license">{olistAnalysis.license}</span>
      </aside>
    </div>
  </section>
}

function OutcomePill({ late }: { late: boolean }) {
  return <span className={`olist-outcome ${late ? 'olist-outcome-late' : 'olist-outcome-ontime'}`}>
    {late ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}{late ? 'Late' : 'On time'}
  </span>
}

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [orders, setOrders] = useState<OrderTuple[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'All outcomes' | 'Late' | 'On time'>('All outcomes')
  const [currentPage, setCurrentPage] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function loadOrders() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/olist_orders.json')
      if (!response.ok) throw new Error(`Could not load the Olist order file (HTTP ${response.status}).`)
      const data: unknown = await response.json()
      if (!isOrderFile(data)) throw new Error('The Olist order file is invalid or does not match the reviewed dataset totals.')
      setOrders(data.orders)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the Olist order history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase()
    return orders.flatMap((order, index) => {
      if (outcomeFilter === 'Late' && order[3] !== 1) return []
      if (outcomeFilter === 'On time' && order[3] !== 0) return []
      const searchable = [
        formatReference(index),
        order[0].slice(0, 10),
        order[1].slice(0, 10),
        order[2].slice(0, 10),
        regionName(order[5]),
        regionName(order[6]),
        order[3] ? 'late' : 'on time',
      ].join(' ').toLowerCase()
      return !term || searchable.includes(term) ? [{ order, index }] : []
    })
  }, [orders, query, outcomeFilter])
  const pageCount = Math.ceil(filteredOrders.length / pageSize)
  const visibleOrders = filteredOrders.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const latestOrders = useMemo(() => orders.slice(-5).map((order, index) => ({ order, index: orders.length - 5 + index })).reverse(), [orders])
  const summary = olistAnalysis.target_summary

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setSidebarOpen(false)
    setQuery('')
    setCurrentPage(0)
  }

  const currentPageTitle = page === 'Overview' ? 'Overview' : page === 'Olist orders' ? 'Shipments' : 'Model & data'

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
            const itemPage = item.page
            const active = itemPage ? page === itemPage : false
            const unavailable = !itemPage
            return <button key={item.label} className={`nav-item ${active ? 'nav-active' : ''}`} disabled={unavailable} title={unavailable ? 'This section is not represented in the Olist dataset.' : undefined} onClick={() => itemPage && navigate(itemPage)}>
              <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card">
          <div className="plan-icon"><Sparkles size={16} /></div><strong>Supply chain, in sync.</strong>
          <p>Explore historical delivery outcomes from Olist.</p>
          <button onClick={() => navigate('Data & methodology')}>Explore data status <ArrowRight size={14} /></button>
          <div className="plan-orb orb-one" /><div className="plan-orb orb-two" />
        </div>
        <button className="nav-item support-item" onClick={() => navigate('Data & methodology')}><CircleHelp size={18} /><span>Help &amp; support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">S</div><div className="profile-meta"><strong>Open workspace</strong><small>No sign-in required</small></div></div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ArrowRight size={14} /><strong>{currentPageTitle}</strong></div></div>
        <div className="topbar-actions">
          <div className="data-status connected"><span className="status-dot" />Olist dataset</div>
          {page === 'Overview' && <button className="command-search-trigger" aria-label="Search Olist orders" onClick={() => navigate('Olist orders')}><Search size={16} /><span>Search shipments, routes...</span></button>}
          <button className={`topbar-icon ${page === 'Overview' ? 'command-search-icon' : ''}`} aria-label="Search Olist orders" onClick={() => navigate('Olist orders')}><Search size={19} /></button>
          <a className="topbar-icon" aria-label="Dataset source and license" href={sourceUrl} target="_blank" rel="noreferrer" title="Dataset source and license"><Database size={18} /></a>
          <div className="topbar-avatar">S</div>
        </div>
      </header>
      <div className="content">
        <div className={`page-heading ${page === 'Overview' ? 'command-center-heading' : ''}`}>
          <div><div className="eyebrow"><span className="eyebrow-line" /> {page === 'Overview' ? 'SUPPLY CHAIN · COMMAND CENTER' : `SUPPLY CHAIN · ${currentPageTitle.toUpperCase()}`}</div><h1>{page === 'Overview' ? 'Command Center' : page === 'Olist orders' ? 'Olist order history' : 'Model & data'}<span className="wave">✳</span></h1><p>{page === 'Overview' ? `Historical Olist benchmark · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}` : page === 'Olist orders' ? 'Browse historical delivered orders and their recorded delivery outcomes.' : 'Review the Olist source, license, methodology, and dataset limitations.'}</p></div>
          <div className="heading-actions">{page !== 'Overview' && <button className="button button-outline" onClick={() => navigate('Overview')}><ArrowLeft size={16} /> Back to overview</button>}<button className="button button-outline" onClick={() => downloadCsv(filteredOrders)} disabled={!orders.length}><Download size={16} /> Export report</button><button className="button button-dark" onClick={() => navigate('Olist orders')}><Plus size={17} /> Manage shipments</button></div>
        </div>

        {loadError && <div className="olist-load-error" role="alert"><CircleAlert size={18} /><span>{loadError}</span><button className="button button-outline button-small" onClick={() => void loadOrders()}>Retry</button></div>}
        {loading && <div className="panel olist-loading" role="status">Loading the historical Olist order dataset…</div>}
        {!loading && !loadError && page === 'Overview' && <>
          <OlistBenchmarkPanel />
          <div className="operational-preview-heading">
            <div><span className="eyebrow"><span className="eyebrow-line" /> OLIST · HISTORICAL ORDER DATA</span><h2>Olist order activity</h2><p>Completed customer deliveries from the selected dataset.</p></div>
            <span className="operational-preview-badge">READ-ONLY HISTORY</span>
          </div>
          <section className="bottom-grid">
            <div className="panel shipments-panel">
              <div className="panel-heading"><div><div className="title-with-info"><h2>Recent Olist orders</h2><span className="table-count">{summary.eligible_orders.toLocaleString()} records</span></div><p>Latest orders by purchase date, with observed delivery outcomes</p></div><button className="text-link" onClick={() => navigate('Olist orders')}>All orders <ArrowRight size={14} /></button></div>
              <OrderTable rows={latestOrders} />
            </div>
            <div className="panel inventory-panel">
              <div className="panel-heading"><div><h2>Delivery outcomes</h2><p>Actual delivery compared with the estimated date</p></div><Clock3 size={16} /></div>
              <div className="olist-definition"><span>Delivered late</span><strong>{summary.late_count.toLocaleString()} orders · {(summary.late_share * 100).toFixed(2)}%</strong></div>
              <div className="olist-definition"><span>On time or early</span><strong>{summary.on_time_or_early_count.toLocaleString()} orders · {(summary.on_time_or_early_share * 100).toFixed(2)}%</strong></div>
              <div className="olist-data-warning"><CircleAlert size={15} /><span>Inventory, returns, and live shipment tracking are not part of this dataset.</span></div>
              <div className="inventory-foot"><span>Source: Olist · 2016–2018</span><button onClick={() => navigate('Data & methodology')}>Dataset details <ArrowRight size={14} /></button></div>
            </div>
          </section>
        </>}
        {!loading && !loadError && page === 'Olist orders' && <>
          <section className="panel olist-orders-panel">
            <div className="panel-heading"><div><h2>Historical delivered orders</h2><p>{filteredOrders.length.toLocaleString()} matching record{filteredOrders.length === 1 ? '' : 's'} · anonymized order references</p></div><button className="button button-outline button-small" onClick={() => downloadCsv(filteredOrders)} disabled={!filteredOrders.length}><Download size={14} /> Export filtered CSV</button></div>
            <div className="olist-filter-row">
              <label className="olist-search"><Search size={16} /><span className="sr-only">Search orders</span><input value={query} onChange={event => { setQuery(event.target.value); setCurrentPage(0) }} placeholder="Search reference, date, region…" /></label>
              <label className="olist-filter-label">Outcome<select value={outcomeFilter} onChange={event => { setOutcomeFilter(event.target.value as typeof outcomeFilter); setCurrentPage(0) }}><option>All outcomes</option><option>Late</option><option>On time</option></select></label>
            </div>
            <OrderTable rows={visibleOrders} />
            <div className="olist-pagination"><span>Showing {filteredOrders.length ? (currentPage * pageSize + 1).toLocaleString() : 0}–{Math.min((currentPage + 1) * pageSize, filteredOrders.length).toLocaleString()} of {filteredOrders.length.toLocaleString()}</span><div><button className="button button-outline button-small" onClick={() => setCurrentPage(page => Math.max(0, page - 1))} disabled={currentPage === 0}>Previous</button><span>Page {pageCount ? currentPage + 1 : 0} of {pageCount}</span><button className="button button-outline button-small" onClick={() => setCurrentPage(page => Math.min(pageCount - 1, page + 1))} disabled={currentPage >= pageCount - 1}>Next</button></div></div>
          </section>
        </>}
        {!loading && !loadError && page === 'Data & methodology' && <DataMethodology />}
      </div>
    </main>
  </div>
}

function OrderTable({ rows }: { rows: Array<{ order: OrderTuple; index: number }> }) {
  if (!rows.length) return <div className="empty-state"><Search size={21} /><strong>No matching Olist orders</strong><span>Try changing the search text or outcome filter.</span></div>
  return <div className="table-scroll"><table className="shipment-table olist-orders-table"><thead><tr><th>ORDER REFERENCE</th><th>PURCHASE DATE</th><th>ESTIMATED DELIVERY</th><th>ACTUAL DELIVERY</th><th>OUTCOME</th><th>SELLER REGION</th><th>CUSTOMER REGION</th></tr></thead><tbody>
    {rows.map(({ order, index }) => <tr key={index}><td><strong>{formatReference(index)}</strong></td><td>{formatDate(order[0])}</td><td>{formatDate(order[1])}</td><td>{formatDate(order[2])}</td><td><OutcomePill late={order[3] === 1} />{order[3] === 1 && <small className="olist-days-late">{order[4]} day{order[4] === 1 ? '' : 's'} late</small>}</td><td>{regionName(order[5])}</td><td>{regionName(order[6])}</td></tr>)}
  </tbody></table></div>
}

function DataMethodology() {
  return <div className="olist-methodology-grid">
    <section className="panel olist-method-panel"><div className="panel-heading"><div><h2>Dataset source &amp; license</h2><p>Original public dataset selected for this dashboard</p></div><Database size={18} /></div><a className="olist-source-link" href={sourceUrl} target="_blank" rel="noreferrer">Kaggle · Brazilian E-Commerce Public Dataset by Olist <ArrowRight size={14} /></a><p className="olist-license">{olistAnalysis.license}</p><p>Dataset period: September 2016 through August 2018. It contains Brazilian marketplace orders and delivery timestamps. The dashboard uses derived order outcomes and coarse geographic regions.</p></section>
    <section className="panel olist-method-panel"><div className="panel-heading"><div><h2>Outcome definition</h2><p>How “late” is determined</p></div><Clock3 size={18} /></div><dl className="olist-definition-list"><div><dt>Eligible records</dt><dd>Orders marked delivered with valid order, actual-delivery, and estimated-delivery timestamps.</dd></div><div><dt>Late delivery</dt><dd>The recorded customer-delivery timestamp is later than the estimated-delivery timestamp.</dd></div><div><dt>Excluded</dt><dd>{olistAnalysis.excluded_records.total_orders.toLocaleString()} total orders minus cancelled, unavailable, incomplete, or otherwise ineligible records.</dd></div></dl></section>
    <section className="panel olist-method-panel olist-limitations"><div className="panel-heading"><div><h2>Limitations</h2><p>What these records do and do not support</p></div><CircleAlert size={18} /></div><ul><li>All records describe completed historical orders, not shipments currently in transit.</li><li>Order/customer/seller IDs, names, street-level locations, and payment/review details are not included in the exported dashboard data.</li><li>Inventory, returns, carrier events, and operational supplier performance are not represented by this dataset.</li><li>Late/on-time labels are observed outcomes, not model predictions or risk probabilities. No ML model is connected to this dashboard.</li><li>This dataset is labeled CC BY-NC-SA 4.0 on Kaggle. Use the derived data only for non-commercial purposes under the dataset terms and retain attribution.</li></ul></section>
    <div className="olist-source-banner"><ShieldCheck size={17} /><span><strong>Dataset attribution</strong> · Brazilian E-Commerce Public Dataset by Olist · CC BY-NC-SA 4.0</span><a href={sourceUrl} target="_blank" rel="noreferrer">Open Kaggle source <ArrowRight size={14} /></a></div>
  </div>
}

export default App
