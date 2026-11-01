import { useEffect, useState } from 'react'
import {
  Activity, ArrowRight, Bell, Box, CircleAlert, CircleHelp, Database,
  LayoutDashboard, Menu, PackageSearch, RotateCcw, Search, ShieldCheck,
  ShoppingBag, Sparkles, Tags, Truck, Users, X,
} from 'lucide-react'
import OperationsHub from './Operations'
import { parseCommerceDataset, type CommerceDataset } from './commerceData'

type Page =
  | 'Overview' | 'Transactions' | 'Products' | 'Inventory' | 'Supplier Network'
  | 'Shipments' | 'Returns' | 'Pricing' | 'Marketing' | 'Customer Insights' | 'Risk & Alerts'
  | 'What-if Simulator' | 'Reports' | 'AI Assistant'
  | 'Live Tracking' | 'Dataset & Sources'

const navigation: { group: string; items: Array<{ label: Page; icon: typeof LayoutDashboard }> }[] = [
  { group: 'COMMERCE', items: [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Transactions', icon: ShoppingBag },
    { label: 'Products', icon: PackageSearch },
    { label: 'Inventory', icon: Box },
    { label: 'Shipments', icon: Truck },
    { label: 'Supplier Network', icon: Users },
    { label: 'Returns', icon: RotateCcw },
  ] },
  { group: 'ANALYTICS', items: [
    { label: 'Pricing', icon: Tags },
    { label: 'Marketing', icon: Activity },
    { label: 'Customer Insights', icon: Users },
    { label: 'Risk & Alerts', icon: ShieldCheck },
    { label: 'What-if Simulator', icon: CircleAlert },
    { label: 'Reports', icon: Database },
    { label: 'AI Assistant', icon: CircleHelp },
  ] },
  { group: 'DATA', items: [
    { label: 'Live Tracking', icon: Truck },
    { label: 'Dataset & Sources', icon: Database },
  ] },
]

export default function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [dataset, setDataset] = useState<CommerceDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [alertCount, setAlertCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  async function loadDataset() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/commerce_dataset.json')
      if (!response.ok) throw new Error(`Could not load the commerce dataset (HTTP ${response.status}).`)
      const data: unknown = await response.json()
      setDataset(parseCommerceDataset(data))
    } catch (error) {
      setDataset(null)
      setLoadError(error instanceof Error ? error.message : 'Could not load the commerce dataset.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadDataset() }, [])

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setSidebarOpen(false)
  }

  return <div className="app-shell command-center-theme commerce-workspace">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand-row">
          <div className="brand-lockup"><img src="/supplyshield-mark.svg" alt="" className="brand-mark" /><span className="brand-name">supply<span>shield</span><i>.</i></span></div>
          <button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-switch"><span className="workspace-avatar">S</span><span className="workspace-meta"><strong>SupplyShield</strong><small>Commerce workspace</small></span></div>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map(group => <div className="nav-group" key={group.group}>
          <p className="nav-heading">{group.group}</p>
          {group.items.map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${page === item.label ? 'nav-active' : ''}`} onClick={() => navigate(item.label)}>
              <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
              {item.label === 'Risk & Alerts' && alertCount > 0 && <span className="nav-count">{alertCount}</span>}
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card"><div className="plan-icon"><Sparkles size={16} /></div><strong>One source of truth.</strong><p>Explore sales, stock, suppliers, returns, and pricing from the supplied archive.</p><button onClick={() => navigate('Dataset & Sources')}>View dataset details <ArrowRight size={14} /><div className="plan-orb orb-one" /><div className="plan-orb orb-two" /></button></div>
        <button className="nav-item support-item" onClick={() => navigate('Dataset & Sources')}><CircleHelp size={18} /><span>Data &amp; support</span><span className="support-shortcut">?</span></button>
        <div className="profile-row"><div className="profile-avatar">S</div><div className="profile-meta"><strong>Open workspace</strong><small>Dataset-backed</small></div></div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ArrowRight size={14} /><strong>{page}</strong></div></div>
        <div className="topbar-actions"><div className="data-status connected"><span className="status-dot" />Commerce dataset</div>
          <button className="topbar-icon" aria-label="Search all data" title="Search all data" onClick={() => setGlobalSearchOpen(true)}><Search size={19} /></button>
          <button className="topbar-icon notification-button" aria-label="View data alerts" onClick={() => navigate('Risk & Alerts')}><Bell size={19} />{alertCount > 0 && <span className="notification-dot" />}</button>
          <div className="topbar-avatar">S</div>
        </div>
      </header>
      <div className="content">
        {loading && <div className="panel olist-loading" role="status">Loading the supplied commerce archive…</div>}
        {!loading && loadError && <div className="olist-load-error" role="alert"><CircleAlert size={18} /><span>{loadError}</span><button className="button button-outline button-small" onClick={() => void loadDataset()}>Retry</button></div>}
        {!loading && dataset && <OperationsHub dataset={dataset} page={page} onNavigate={navigate} onAlertCountChange={setAlertCount} globalSearchOpen={globalSearchOpen} onCloseGlobalSearch={() => setGlobalSearchOpen(false)} />}
      </div>
    </main>
  </div>
}
