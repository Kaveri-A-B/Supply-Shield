import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Check, CircleAlert,
  Clock3, Download, Package, RefreshCw, Search, ShieldCheck, Sparkles, Tags, Truck, Users, X,
} from 'lucide-react'
import type {
  CommerceDataset, InventoryRecord, MarketingRecord, Product, SupplierCost, Transaction,
} from './commerceData'
import './operations.css'

type CommercePage =
  | 'Overview' | 'Transactions' | 'Products' | 'Inventory' | 'Supplier Network'
  | 'Shipments' | 'Returns' | 'Pricing' | 'Marketing' | 'Customer Insights' | 'Risk & Alerts'
  | 'What-if Simulator' | 'Reports' | 'AI Assistant'
  | 'Live Tracking' | 'Dataset & Sources'

type AlertItem = { key: string; severity: 'High' | 'Medium'; title: string; detail: string }
type GlobalSearchResult = { page: CommercePage; label: string; detail: string; term: string }
type MarketActivity = {
  country: string
  orders: number
  completed: number
  canceled: number
  refunded: number
}
type Tracking = {
  id: string
  trackingNumber: string
  carrier?: string
  status?: string
  statusDetail?: string
  estimatedDelivery?: string | null
  checkpoints?: Array<{ time?: string; location?: string; message?: string; status?: string; coordinates?: { latitude: number; longitude: number } | null }>
}

const pageSize = 50
const fallbackUsdInrRate = 94.86
const exchangeRateUrl = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR'

const pageDescriptions: Record<CommercePage, string> = {
  Overview: 'Sales, stock, supplier, and return signals from the supplied commerce archive.',
  Transactions: 'Search and review transaction rows included in the archive.',
  Products: 'Browse the product catalog and current active status.',
  Inventory: 'Compare recorded stock against each product’s reorder point.',
  Shipments: 'Review shipping-cost fields recorded on transactions; the source has no dedicated shipment records or delivery updates.',
  'Supplier Network': 'Compare supplier reliability, lead times, costs, and covered products.',
  Returns: 'Review recorded return reasons and refunds.',
  Pricing: 'Explore listed prices, competitor prices, promotions, and margins over time.',
  Marketing: 'Compare spend and reported return by month and marketing channel.',
  'Customer Insights': 'Aggregated customer segments only; personal names and contact details are excluded.',
  'Risk & Alerts': 'Rule-based attention items derived from recorded inventory and supplier data.',
  'What-if Simulator': 'Illustrate cost exposure using recorded revenue and shipping costs.',
  Reports: 'Export records and summary metrics from the supplied dataset.',
  'AI Assistant': 'Ask questions about the supplied commerce archive.',
  'Live Tracking': 'Review source order activity by market; no live GPS feed is connected.',
  'Dataset & Sources': 'Review source files, coverage, and the fields available to this workspace.',
}

function toInr(value: number, usdInrRate: number) {
  return value * usdInrRate
}

function formatMoney(value: number, usdInrRate: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(toInr(value, usdInrRate))
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

function formatDate(value: string) {
  if (!value) return '—'
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function addDaysToDate(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (!value || !Number.isFinite(date.getTime()) || !Number.isFinite(days) || days < 0) return ''
  date.setUTCDate(date.getUTCDate() + Math.ceil(days))
  return date.toISOString().slice(0, 10)
}

function downloadCsv(filename: string, rows: Array<Array<string | number | boolean>>) {
  const contents = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Panel({ title, detail, action, className = '', children }: { title: string; detail?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel operations-panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>{children}</section>
}

function Stat({ label, value, detail, icon: Icon, tone = 'metric-tone-blue' }: { label: string; value: string; detail: string; icon: typeof Package; tone?: string }) {
  return <article className="command-metric-card panel operations-metric"><div className="command-metric-top"><span className="command-metric-title">{label}</span><span className={`command-metric-icon ${tone}`}><Icon size={16} /></span></div><strong className="command-metric-value">{value}</strong><small className="command-metric-detail">{detail}</small></article>
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="operations-table-wrap"><table className="operations-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

function Empty({ message }: { message: string }) {
  return <div className="operations-empty"><Package size={22} /><strong>No matching records</strong><span>{message}</span></div>
}

function exportTransactions(rows: Transaction[], rate: number) {
  downloadCsv('supplyshield-transactions.csv', [
    ['Date', 'Product ID', 'Category', 'Quantity', 'Unit price INR', 'Discount', 'Revenue INR', 'Cost INR', 'Profit INR', 'Shipping cost INR', 'Channel', 'Payment method', 'Status', 'Country'],
    ...rows.map(row => [row.date, row.productId, row.category, row.quantity, toInr(row.unitPrice, rate), row.discount, toInr(row.revenue, rate), toInr(row.cost, rate), toInr(row.profit, rate), toInr(row.shippingCost, rate), row.channel, row.paymentMethod, row.status, row.country]),
  ])
}

function exportProducts(rows: Product[], rate: number) {
  downloadCsv('supplyshield-products.csv', [
    ['Product ID', 'Name', 'Category', 'Brand', 'Unit price INR', 'Unit cost INR', 'Weight kg', 'Active', 'Launch date'],
    ...rows.map(row => [row.productId, row.name, row.category, row.brand, toInr(row.unitPrice, rate), toInr(row.unitCost, rate), row.weightKg, row.active, row.launchDate]),
  ])
}

function exportInventory(rows: Array<{ product: Product | undefined; inventory: InventoryRecord }>) {
  downloadCsv('supplyshield-inventory.csv', [
    ['Product ID', 'Product', 'Category', 'Stock units', 'Reorder point', 'Warehouse', 'Last restock', 'Supplier lead days'],
    ...rows.map(({ product, inventory }) => [inventory.productId, product?.name ?? 'Unknown product', inventory.category, inventory.stock, inventory.reorderPoint, inventory.warehouse, inventory.lastRestockDate, inventory.supplierLeadDays]),
  ])
}

function answerDatasetQuestion(question: string, dataset: CommerceDataset, usdInrRate: number) {
  const query = question.trim().toLowerCase()
  const completed = dataset.transactions.filter(row => row.status === 'completed')
  const canceled = dataset.transactions.filter(row => row.status === 'cancelled')
  const refunded = dataset.transactions.filter(row => row.status === 'refunded')
  const productById = new Map(dataset.products.map(product => [product.productId, product]))
  const productLabel = (productId: string) => productById.get(productId)?.name ?? productId
  const money = (value: number) => formatMoney(value, usdInrRate)
  const totals = (rows: Transaction[]) => rows.reduce((sum, row) => sum + row.revenue, 0)
  const groupTransactions = (key: (row: Transaction) => string, rows = completed) => {
    const groups = new Map<string, { rows: number; revenue: number; profit: number; units: number }>()
    for (const row of rows) {
      const name = key(row)
      const group = groups.get(name) ?? { rows: 0, revenue: 0, profit: 0, units: 0 }
      group.rows++
      group.revenue += row.revenue
      group.profit += row.profit
      group.units += row.quantity
      groups.set(name, group)
    }
    return [...groups.entries()].map(([name, value]) => ({ name, ...value }))
  }
  const mentionedItem = query.match(/\bitem\s+\d+\b/)?.[0]
  const namedProduct = [...dataset.products]
    .sort((a, b) => b.name.length - a.name.length)
    .find(product => query.includes(product.productId.toLowerCase())
      || query.includes(product.name.toLowerCase())
      || Boolean(mentionedItem && product.name.toLowerCase().match(/\bitem\s+\d+\b/)?.[0] === mentionedItem))

  if (namedProduct) {
    const sales = dataset.transactions.filter(row => row.productId === namedProduct.productId)
    const productInventory = dataset.inventory.find(row => row.productId === namedProduct.productId)
    const productReturns = dataset.returns.filter(row => row.productId === namedProduct.productId)
    const latestPrice = dataset.pricing
      .filter(row => row.productId === namedProduct.productId)
      .sort((a, b) => b.month.localeCompare(a.month))[0]
    const productSuppliers = dataset.suppliers.filter(row => row.productId === namedProduct.productId)
    const salesRevenue = totals(sales.filter(row => row.status === 'completed'))
    return [
      `${namedProduct.name} (${namedProduct.productId}) — ${namedProduct.category}, ${namedProduct.brand}.`,
      `Catalog price ${money(namedProduct.unitPrice)}; unit cost ${money(namedProduct.unitCost)}; ${namedProduct.active ? 'active' : 'inactive'} product.`,
      `${formatNumber(sales.length)} transaction rows; completed revenue ${money(salesRevenue)}.`,
      productInventory
        ? `Stock ${formatNumber(productInventory.stock)} units; reorder point ${formatNumber(productInventory.reorderPoint)}; supplier lead time ${formatNumber(productInventory.supplierLeadDays)} days.`
        : 'No inventory record is available for this product.',
      `${formatNumber(productReturns.length)} recorded returns${productReturns.length ? `; ${formatNumber(productReturns.filter(row => row.restocked).length)} marked restocked` : ''}.`,
      latestPrice ? `Latest price-history record (${latestPrice.month}): listed ${money(latestPrice.listedPrice)}, competitor ${money(latestPrice.competitorPrice)}.` : '',
      productSuppliers.length ? `Supplier records: ${productSuppliers.length}; average recorded reliability ${formatPercent(productSuppliers.reduce((sum, row) => sum + row.reliability, 0) / productSuppliers.length)}.` : '',
    ].filter(Boolean).join('\n')
  }

  if (/how many|count|number of/.test(query) && /products|catalog/.test(query)) {
    return `The product catalog contains ${formatNumber(dataset.products.length)} products; ${formatNumber(dataset.products.filter(product => product.active).length)} are marked active.`
  }

  if (/inventory|stock|reorder|restock|supplier|lead time|reliability/.test(query)) {
    const lowStock = dataset.inventory.filter(row => row.stock <= row.reorderPoint)
      .sort((a, b) => (a.stock - a.reorderPoint) - (b.stock - b.reorderPoint))
    const supplierGroups = new Map<string, SupplierCost[]>()
    for (const supplier of dataset.suppliers) {
      const records = supplierGroups.get(supplier.name) ?? []
      records.push(supplier)
      supplierGroups.set(supplier.name, records)
    }
    const supplierStats = [...supplierGroups.entries()].map(([name, records]) => ({
      name,
      products: new Set(records.map(row => row.productId)).size,
      reliability: records.reduce((sum, row) => sum + row.reliability, 0) / records.length,
      leadDays: records.reduce((sum, row) => sum + row.leadTimeDays, 0) / records.length,
    }))
    const lowReliability = supplierStats.filter(row => row.reliability < 0.65).sort((a, b) => a.reliability - b.reliability)
    if (/supplier|lead time|reliability/.test(query) && !/inventory|stock|reorder|restock/.test(query)) {
      const ranking = supplierStats.sort((a, b) => a.reliability - b.reliability).slice(0, 5)
      return `Supplier records cover ${formatNumber(supplierStats.length)} suppliers. ${formatNumber(lowReliability.length)} have average reliability below 65%.\nLowest recorded reliability: ${ranking.map(row => `${row.name} (${formatPercent(row.reliability)}, ${formatNumber(row.products)} products, ${row.leadDays.toFixed(1)} average lead days)`).join('; ')}.`
    }
    return `Inventory includes ${formatNumber(dataset.inventory.length)} product records; ${formatNumber(lowStock.length)} are at or below their reorder point.\n${lowStock.length ? `Items needing review: ${lowStock.slice(0, 8).map(row => `${productLabel(row.productId)} (${formatNumber(row.stock)} in stock vs ${formatNumber(row.reorderPoint)} reorder point)`).join('; ')}.` : 'No records are currently at or below their reorder point.'}\n${lowReliability.length ? `${formatNumber(lowReliability.length)} suppliers have average recorded reliability below 65%.` : 'No suppliers fall below the 65% reliability threshold.'}`
  }

  if (/return|refund|restock/.test(query)) {
    const reasons = new Map<string, number>()
    for (const row of dataset.returns) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1)
    const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const refunds = dataset.returns.reduce((sum, row) => sum + row.refundAmount, 0)
    return `${formatNumber(dataset.returns.length)} return records; total recorded refunds ${money(refunds)}; ${formatNumber(dataset.returns.filter(row => row.restocked).length)} marked restocked.\nMost common reasons: ${topReasons.map(([reason, count]) => `${reason} (${formatNumber(count)})`).join('; ')}.`
  }

  if (/customer|customers|age band|gender|premium|verified/.test(query)) {
    const customers = dataset.customers
    const topCountries = [...customers.countries].sort((a, b) => b.customers - a.customers).slice(0, 5)
    return `${formatNumber(customers.total)} customers are represented in aggregate; ${formatNumber(customers.premium)} premium and ${formatNumber(customers.verified)} verified.\nLargest country groups: ${topCountries.map(row => `${row.name} (${formatNumber(row.customers)})`).join('; ')}.\nPersonal names, contact details, and customer IDs are not included in this dataset.`
  }

  if (/market|country|countries/.test(query)) {
    const country = dataset.transactions.find(row => query.includes(row.country.toLowerCase()))?.country
    const markets = groupTransactions(row => row.country, completed)
      .filter(row => !country || row.name === country)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, country ? 1 : 5)
    if (country && markets.length) return `${country}: ${formatNumber(markets[0].rows)} completed transaction rows and ${money(markets[0].revenue)} completed revenue.`
    return `Top markets by completed transaction revenue: ${markets.map(row => `${row.name} (${money(row.revenue)}, ${formatNumber(row.rows)} completed rows)`).join('; ')}.`
  }

  if (/marketing|campaign|channel|click|impression|roas|advertis/.test(query)) {
    const groups = new Map<string, MarketingRecord[]>()
    for (const row of dataset.marketing) {
      const records = groups.get(row.channel) ?? []
      records.push(row)
      groups.set(row.channel, records)
    }
    const channels = [...groups.entries()].map(([name, rows]) => ({
      name,
      spend: rows.reduce((sum, row) => sum + row.spend, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
    })).sort((a, b) => b.revenue - a.revenue)
    return `${formatNumber(dataset.marketing.length)} marketing records across ${formatNumber(channels.length)} channels. Top channels by reported revenue: ${channels.slice(0, 5).map(row => `${row.name.replace(/_/g, ' ')} (${money(row.revenue)} revenue, ${money(row.spend)} spend, ${formatNumber(row.orders)} reported orders)`).join('; ')}.`
  }

  if (/price|pricing|competitor|promotion|margin/.test(query)) {
    const latestMonth = dataset.pricing.reduce((latest, row) => row.month > latest ? row.month : latest, '')
    const latestRows = dataset.pricing.filter(row => row.month === latestMonth)
    const averageMargin = latestRows.length ? latestRows.reduce((sum, row) => sum + row.marginPct, 0) / latestRows.length : 0
    const promoted = latestRows.filter(row => row.promotional).length
    const belowCompetitor = latestRows.filter(row => row.listedPrice < row.competitorPrice).length
    return `Price history contains ${formatNumber(dataset.pricing.length)} rows. In the latest available month (${latestMonth}), ${formatNumber(latestRows.length)} product records have an average margin of ${formatPercent(averageMargin)}; ${formatNumber(promoted)} are promotional and ${formatNumber(belowCompetitor)} are listed below competitor price.`
  }

  if (/transaction|order|status|cancel|completed|refunded/.test(query)) {
    const statusCounts = new Map<string, number>()
    for (const row of dataset.transactions) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
    const statusSummary = [...statusCounts.entries()].map(([status, count]) => `${status}: ${formatNumber(count)}`).join('; ')
    return `${formatNumber(dataset.transactions.length)} transaction rows in total (${formatNumber(completed.length)} completed, ${formatNumber(canceled.length)} cancelled, ${formatNumber(refunded.length)} refunded).\nCompleted revenue ${money(totals(completed))}; completed profit ${money(completed.reduce((sum, row) => sum + row.profit, 0))}.\nSource statuses: ${statusSummary}.`
  }

  if (/revenue|sales|profit|category|categories|best sell|top product/.test(query)) {
    const categories = groupTransactions(row => row.category).sort((a, b) => b.revenue - a.revenue)
    const products = groupTransactions(row => row.productId).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    const category = dataset.transactions.find(row => query.includes(row.category.toLowerCase()))?.category
    if (category) {
      const categorySales = categories.find(row => row.name === category)
      return categorySales
        ? `${category}: ${formatNumber(categorySales.rows)} completed transaction rows, ${formatNumber(categorySales.units)} units sold, ${money(categorySales.revenue)} revenue, and ${money(categorySales.profit)} profit.`
        : `There are no completed sales records for ${category}.`
    }
    return `Completed revenue is ${money(totals(completed))}; completed profit is ${money(completed.reduce((sum, row) => sum + row.profit, 0))}.\nTop categories by completed revenue: ${categories.slice(0, 5).map(row => `${row.name} (${money(row.revenue)})`).join('; ')}.\nTop products: ${products.map(row => `${productLabel(row.name)} (${money(row.revenue)})`).join('; ')}.`
  }

  return `I can answer questions using the supplied dataset's ${formatNumber(dataset.transactions.length)} transactions, ${formatNumber(dataset.products.length)} products, inventory, suppliers, returns, pricing, marketing, and customer aggregates. Try asking about revenue, top products or categories, stock and reorder points, suppliers, returns, markets, or marketing performance. Answers use the records in this workspace; information not present in the dataset cannot be determined.`
}

const allCommercePages: CommercePage[] = [
  'Overview', 'Transactions', 'Products', 'Inventory', 'Shipments', 'Supplier Network', 'Returns',
  'Pricing', 'Marketing', 'Customer Insights', 'Risk & Alerts', 'What-if Simulator',
  'Reports', 'AI Assistant', 'Live Tracking', 'Dataset & Sources',
]
const marketNodePositions = [
  { left: 12, top: 57 },
  { left: 25, top: 25 },
  { left: 38, top: 68 },
  { left: 51, top: 36 },
  { left: 64, top: 62 },
  { left: 75, top: 28 },
  { left: 87, top: 57 },
  { left: 48, top: 83 },
]

export default function OperationsHub({ dataset, page, onNavigate, onAlertCountChange, globalSearchOpen, onCloseGlobalSearch }: {
  dataset: CommerceDataset
  page: CommercePage
  onNavigate: (page: CommercePage) => void
  onAlertCountChange: (count: number) => void
  globalSearchOpen: boolean
  onCloseGlobalSearch: () => void
}) {
  const [query, setQuery] = useState('')
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [selectedMarket, setSelectedMarket] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All categories')
  const [selectedStatus, setSelectedStatus] = useState('All statuses')
  const [currentPage, setCurrentPage] = useState(0)
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(() => new Set())
  const [disruptionRate, setDisruptionRate] = useState(10)
  const [shippingIncrease, setShippingIncrease] = useState(15)
  const [usdInrRate, setUsdInrRate] = useState(fallbackUsdInrRate)
  const [exchangeRateDate, setExchangeRateDate] = useState('')
  const [exchangeRateError, setExchangeRateError] = useState('')
  const [exchangeRateLoading, setExchangeRateLoading] = useState(true)
  const [rateRefresh, setRateRefresh] = useState(0)
  const [apiToken, setApiToken] = useState('')
  const [integrationStatus, setIntegrationStatus] = useState<{ aftership: boolean; writes: boolean } | null>(null)
  const [integrationError, setIntegrationError] = useState('')
  const [reorderProductId, setReorderProductId] = useState('')
  const [reorderSupplierKey, setReorderSupplierKey] = useState('')
  const [reorderQuantity, setReorderQuantity] = useState(1)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCarrier, setTrackingCarrier] = useState('')
  const [trackingRecords, setTrackingRecords] = useState<Tracking[]>([])
  const [trackingBusy, setTrackingBusy] = useState(false)
  const [trackingError, setTrackingError] = useState('')
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiResult, setAiResult] = useState('')
  const money = (value: number) => formatMoney(value, usdInrRate)

  useEffect(() => {
    if (globalSearchOpen) {
      window.requestAnimationFrame(() => document.getElementById('global-workspace-search')?.focus())
    } else {
      setGlobalSearchQuery('')
    }
  }, [globalSearchOpen])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    setExchangeRateLoading(true)
    setExchangeRateError('')
    const refreshUrl = new URL(exchangeRateUrl)
    refreshUrl.searchParams.set('_refresh', String(Date.now()))
    void fetch(refreshUrl, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Exchange-rate service returned HTTP ${response.status}.`)
        const payload: unknown = await response.json()
        if (!payload || typeof payload !== 'object'
          || !('base' in payload) || payload.base !== 'USD'
          || !('date' in payload) || typeof payload.date !== 'string'
          || !('rates' in payload) || !payload.rates || typeof payload.rates !== 'object'
          || !('INR' in payload.rates) || typeof payload.rates.INR !== 'number'
          || !Number.isFinite(payload.rates.INR) || payload.rates.INR <= 0
          || Number.isNaN(Date.parse(`${payload.date}T00:00:00Z`))
        ) throw new Error('Exchange-rate service returned an invalid USD/INR rate.')
        if (active) {
          setUsdInrRate(payload.rates.INR)
          setExchangeRateDate(payload.date)
        }
      })
      .catch(error => {
        if (active) {
          if (!controller.signal.aborted) {
            setExchangeRateError(error instanceof Error ? error.message : 'Live exchange rate is unavailable.')
          } else {
            setExchangeRateError('Exchange-rate request timed out; using the ₹94.86 fallback.')
          }
          setUsdInrRate(fallbackUsdInrRate)
          setExchangeRateDate('')
        }
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (active) setExchangeRateLoading(false)
      })
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [rateRefresh])

  const productsById = useMemo(() => new Map(dataset.products.map(product => [product.productId, product])), [dataset.products])
  const reorderInventory = dataset.inventory.find(row => row.productId === reorderProductId)
  const reorderProduct = productsById.get(reorderProductId)
  const reorderSuppliers = dataset.suppliers
    .filter(row => row.productId === reorderProductId)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.rank - b.rank)
  const reorderSupplier = reorderSuppliers.find(row => `${row.name}|${row.rank}` === reorderSupplierKey)
  const activeProducts = useMemo(() => dataset.products.filter(product => product.active), [dataset.products])
  const completedTransactions = useMemo(() => dataset.transactions.filter(row => row.status === 'completed'), [dataset.transactions])
  const completedRevenue = useMemo(() => completedTransactions.reduce((sum, row) => sum + row.revenue, 0), [completedTransactions])
  const completedProfit = useMemo(() => completedTransactions.reduce((sum, row) => sum + row.profit, 0), [completedTransactions])
  const totalShippingCost = useMemo(() => completedTransactions.reduce((sum, row) => sum + row.shippingCost, 0), [completedTransactions])
  const categories = useMemo(() => [...new Set(dataset.products.map(product => product.category))].sort(), [dataset.products])

  const inventoryRows = useMemo(() => dataset.inventory.map(inventory => ({
    inventory,
    product: productsById.get(inventory.productId),
  })), [dataset.inventory, productsById])

  const supplierLeadDaysByProduct = useMemo(() => {
    const leadDays = new Map<string, number>()
    const rankedSuppliers = [...dataset.suppliers].sort((a, b) => Number(b.primary) - Number(a.primary) || a.rank - b.rank)
    for (const supplier of rankedSuppliers) {
      if (!leadDays.has(supplier.productId)) leadDays.set(supplier.productId, supplier.leadTimeDays)
    }
    for (const inventory of dataset.inventory) {
      if (!leadDays.has(inventory.productId)) leadDays.set(inventory.productId, inventory.supplierLeadDays)
    }
    return leadDays
  }, [dataset.inventory, dataset.suppliers])

  const supplierSummary = useMemo(() => {
    const groups = new Map<string, SupplierCost[]>()
    for (const supplier of dataset.suppliers) {
      const current = groups.get(supplier.name) ?? []
      current.push(supplier)
      groups.set(supplier.name, current)
    }
    return [...groups.entries()].map(([name, records]) => ({
      name,
      products: new Set(records.map(record => record.productId)).size,
      reliability: records.reduce((sum, record) => sum + record.reliability, 0) / records.length,
      leadDays: records.reduce((sum, record) => sum + record.leadTimeDays, 0) / records.length,
      unitCost: records.reduce((sum, record) => sum + record.unitCost, 0) / records.length,
      primaryProducts: records.filter(record => record.primary).length,
    })).sort((a, b) => b.reliability - a.reliability)
  }, [dataset.suppliers])

  const filteredSupplierSummary = useMemo(() => {
    const term = query.trim().toLowerCase()
    return supplierSummary.filter(supplier => supplier.name.toLowerCase().includes(term))
  }, [supplierSummary, query])

  const categorySales = useMemo(() => {
    const groups = new Map<string, { transactions: number; revenue: number; profit: number; units: number }>()
    for (const row of completedTransactions) {
      const group = groups.get(row.category) ?? { transactions: 0, revenue: 0, profit: 0, units: 0 }
      group.transactions++
      group.revenue += row.revenue
      group.profit += row.profit
      group.units += row.quantity
      groups.set(row.category, group)
    }
    return [...groups.entries()].map(([category, values]) => ({ category, ...values })).sort((a, b) => b.revenue - a.revenue)
  }, [completedTransactions])

  const monthlySales = useMemo(() => {
    const groups = new Map<string, { revenue: number; profit: number; orders: number }>()
    for (const row of completedTransactions) {
      const month = row.date.slice(0, 7)
      const value = groups.get(month) ?? { revenue: 0, profit: 0, orders: 0 }
      value.revenue += row.revenue
      value.profit += row.profit
      value.orders++
      groups.set(month, value)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values }))
  }, [completedTransactions])

  const marketActivity = useMemo(() => {
    const groups = new Map<string, MarketActivity>()
    for (const transaction of dataset.transactions) {
      const market = groups.get(transaction.country) ?? {
        country: transaction.country,
        orders: 0,
        completed: 0,
        canceled: 0,
        refunded: 0,
      }
      market.orders++
      if (transaction.status === 'completed') market.completed++
      if (transaction.status === 'cancelled') market.canceled++
      if (transaction.status === 'refunded') market.refunded++
      groups.set(transaction.country, market)
    }
    return [...groups.values()].sort((a, b) => b.orders - a.orders)
  }, [dataset.transactions])

  const marketTransactions = useMemo(() => dataset.transactions
    .filter(transaction => !selectedMarket || transaction.country === selectedMarket)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8), [dataset.transactions, selectedMarket])

  const alerts = useMemo<AlertItem[]>(() => {
    const lowStock = inventoryRows
      .filter(({ inventory }) => inventory.stock <= inventory.reorderPoint)
      .map(({ inventory, product }) => ({
        key: `stock-${inventory.productId}`,
        severity: 'High' as const,
        title: `${product?.name ?? inventory.productId} is at or below reorder point`,
        detail: `${inventory.stock} units in ${inventory.warehouse}; reorder point ${inventory.reorderPoint}.`,
      }))
    const lowReliability = supplierSummary
      .filter(supplier => supplier.reliability < 0.65)
      .map(supplier => ({
        key: `supplier-${supplier.name}`,
        severity: 'Medium' as const,
        title: `${supplier.name} has a low recorded reliability score`,
        detail: `${formatPercent(supplier.reliability)} average across ${supplier.products} product records.`,
      }))
    return [...lowStock, ...lowReliability]
  }, [inventoryRows, supplierSummary])

  const activeAlertCount = alerts.filter(alert => !acknowledgedAlerts.has(alert.key)).length
  useEffect(() => { onAlertCountChange(activeAlertCount) }, [activeAlertCount, onAlertCountChange])

  const globalSearchResults = useMemo(() => {
    const term = globalSearchQuery.trim().toLowerCase()
    if (term.length < 2) return []
    const results: GlobalSearchResult[] = []
    function addMatches<T>(rows: T[], page: CommercePage, getText: (row: T) => string, getLabel: (row: T) => string, getDetail: (row: T) => string) {
      for (const row of rows) {
        if (results.filter(result => result.page === page).length >= 5) break
        if (getText(row).toLowerCase().includes(term)) {
          results.push({ page, label: getLabel(row), detail: getDetail(row), term: globalSearchQuery.trim() })
        }
      }
    }

    addMatches(dataset.transactions, 'Transactions',
      row => [row.date, row.productId, row.category, row.channel, row.paymentMethod, row.status, row.country].join(' '),
      row => `${formatDate(row.date)} · ${row.category}`,
      row => `${row.productId} · ${row.channel.replace(/_/g, ' ')} · ${row.country}`)
    addMatches(dataset.products, 'Products',
      row => [row.productId, row.name, row.category, row.brand].join(' '),
      row => row.name,
      row => `${row.productId} · ${row.category} · ${row.brand}`)
    addMatches(inventoryRows, 'Inventory',
      row => [row.inventory.productId, row.product?.name, row.inventory.category, row.inventory.warehouse].join(' '),
      row => row.product?.name ?? row.inventory.productId,
      row => `${row.inventory.warehouse} · ${row.inventory.stock} units`)
    addMatches(supplierSummary, 'Supplier Network',
      row => row.name,
      row => row.name,
      row => `${row.products} product records · ${formatPercent(row.reliability)} reliability`)
    addMatches(alerts, 'Risk & Alerts',
      row => `${row.title} ${row.detail}`,
      row => row.title,
      row => row.detail)
    addMatches(dataset.returns, 'Returns',
      row => [row.productId, row.returnDate, row.reason, productsById.get(row.productId)?.name, productsById.get(row.productId)?.category].join(' '),
      row => productsById.get(row.productId)?.name ?? row.productId,
      row => `${formatDate(row.returnDate)} · ${row.reason.replace(/_/g, ' ')}`)
    addMatches(dataset.pricing, 'Pricing',
      row => [row.productId, row.category, row.month, productsById.get(row.productId)?.name].join(' '),
      row => productsById.get(row.productId)?.name ?? row.productId,
      row => `${row.category} · ${row.month}`)
    addMatches(dataset.marketing, 'Marketing',
      row => [row.channel, row.month].join(' '),
      row => row.channel.replace(/_/g, ' '),
      row => row.month)
    const customerGroups = [
      ...dataset.customers.countries.map(row => ({ ...row, group: 'Country' })),
      ...dataset.customers.currencies.map(row => ({ ...row, group: 'Currency' })),
      ...dataset.customers.ageBands.map(row => ({ ...row, group: 'Age range' })),
      ...dataset.customers.genders.map(row => ({ ...row, group: 'Gender' })),
    ]
    addMatches(customerGroups, 'Customer Insights',
      row => `${row.name} ${row.group}`,
      row => row.name,
      row => `${row.group} · ${formatNumber(row.customers)} customers`)

    return results
  }, [alerts, dataset, globalSearchQuery, inventoryRows, productsById, supplierSummary])

  useEffect(() => {
    let active = true
    void fetch('/api/integrations/status')
      .then(async response => {
        if (!response.ok) throw new Error(`Integration status request failed (HTTP ${response.status}).`)
        const status = await response.json() as { aftership?: unknown; writes?: unknown }
        if (typeof status.aftership !== 'boolean' || typeof status.writes !== 'boolean') throw new Error('Integration status response is invalid.')
        if (active) setIntegrationStatus({ aftership: status.aftership, writes: status.writes })
      })
      .catch(error => {
        if (active) setIntegrationError(error instanceof Error ? error.message : 'Integration status is unavailable.')
      })
    return () => { active = false }
  }, [])

  const filteredTransactions = useMemo(() => {
    const term = query.trim().toLowerCase()
    return dataset.transactions.filter(row =>
      (selectedCategory === 'All categories' || row.category === selectedCategory)
      && (selectedStatus === 'All statuses' || row.status === selectedStatus)
      && (!term || [row.date, row.productId, row.category, row.channel, row.paymentMethod, row.status, row.country].join(' ').toLowerCase().includes(term)),
    )
  }, [dataset.transactions, query, selectedCategory, selectedStatus])

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    return dataset.products.filter(product =>
      (selectedCategory === 'All categories' || product.category === selectedCategory)
      && (!term || [product.productId, product.name, product.category, product.brand].join(' ').toLowerCase().includes(term)),
    )
  }, [dataset.products, query, selectedCategory])

  const filteredInventory = useMemo(() => {
    const term = query.trim().toLowerCase()
    return inventoryRows.filter(({ inventory, product }) =>
      (selectedCategory === 'All categories' || inventory.category === selectedCategory)
      && (!term || [inventory.productId, product?.name, inventory.category, inventory.warehouse].join(' ').toLowerCase().includes(term)),
    )
  }, [inventoryRows, query, selectedCategory])

  const filteredReturns = useMemo(() => {
    const term = query.trim().toLowerCase()
    return dataset.returns.filter(row => {
      const product = productsById.get(row.productId)
      return (selectedCategory === 'All categories' || product?.category === selectedCategory)
        && (!term || [product?.name, row.productId, row.reason, row.returnDate, product?.category].join(' ').toLowerCase().includes(term))
    })
  }, [dataset.returns, productsById, query, selectedCategory])

  const pageCount = Math.ceil(filteredTransactions.length / pageSize)
  const visibleTransactions = filteredTransactions.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  function setFilterQuery(value: string) {
    setQuery(value)
    setCurrentPage(0)
  }

  function categoryFilter() {
    return <label className="operations-inline-search">Category<select value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value); setCurrentPage(0) }}><option>All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
  }

  function searchFilter(placeholder: string) {
    return <label className="operations-inline-search">Search<input id={placeholder === 'Search date, product, country…' ? 'transaction-search' : undefined} value={query} onChange={event => setFilterQuery(event.target.value)} placeholder={placeholder} /></label>
  }

  function openSearchResult(result: GlobalSearchResult) {
    setQuery(result.term)
    setCurrentPage(0)
    setSelectedStatus('All statuses')
    setSelectedCategory('All categories')
    onCloseGlobalSearch()
    onNavigate(result.page)
  }

  function openQuickPage(target: CommercePage) {
    setQuery('')
    setSelectedStatus('All statuses')
    setSelectedCategory('All categories')
    setCurrentPage(0)
    onCloseGlobalSearch()
    onNavigate(target)
  }

  function pageHeader(eyebrow: string, title: string, description = pageDescriptions[page]) {
    return <div className="page-heading command-center-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>
  }

  function renderOverview() {
    const maxRevenue = Math.max(1, ...monthlySales.map(month => month.revenue))
    return <div className="operations-stack">
      {pageHeader('COMMERCE · OVERVIEW', 'Commerce overview')}
      <div className="command-center-metrics">
        <Stat label="Completed revenue" value={money(completedRevenue)} detail={`${formatNumber(completedTransactions.length)} completed transactions`} icon={Activity} tone="metric-tone-teal" />
        <Stat label="Gross profit" value={money(completedProfit)} detail={formatPercent(completedRevenue ? completedProfit / completedRevenue : 0)} icon={ArrowUpRight} tone="metric-tone-violet" />
        <Stat label="Products in catalog" value={formatNumber(dataset.products.length)} detail={`${formatNumber(activeProducts.length)} marked active`} icon={Package} tone="metric-tone-blue" />
        <Stat label="Recorded returns" value={formatNumber(dataset.returns.length)} detail={`${money(dataset.returns.reduce((sum, item) => sum + item.refundAmount, 0))} refunds`} icon={RefreshCw} tone="metric-tone-orange" />
      </div>
      <div className="command-center-grid">
        <Panel className="operations-revenue-chart-panel" title="Monthly completed revenue" detail="Recorded transaction revenue, grouped by month">
          <div className="commerce-chart">{monthlySales.slice(-18).map(month => <div className="commerce-chart-column" key={month.month} title={`${month.month}: ${money(month.revenue)}`}><span style={{ display: 'block', width: '100%', minHeight: 3, height: `${Math.max(3, month.revenue / maxRevenue * 100)}%`, borderRadius: '5px 5px 0 0', background: 'linear-gradient(180deg, #44c3d6, #4779dc)' }} /><small>{month.month.slice(2)}</small></div>)}</div>
        </Panel>
        <Panel title="Revenue by category" detail="Completed transactions in the supplied archive">
          <div className="overview-category-list">{categorySales.slice(0, 5).map(row => <div className="overview-category-row" key={row.category} title={`${row.category}: ${money(row.revenue)} revenue, ${money(row.profit)} profit`}><div className="overview-category-summary"><span><strong>{row.category}</strong><small>{formatNumber(row.transactions)} completed transactions · {money(row.profit)} profit</small></span><b>{money(row.revenue)}</b></div><div className="overview-category-track"><i style={{ width: `${Math.max(2, row.revenue / Math.max(1, categorySales[0]?.revenue ?? 1) * 100)}%` }} /></div></div>)}</div>
        </Panel>
      </div>
      <div className="command-center-lower">
        <Panel title="Inventory needing review" detail={`${inventoryRows.filter(({ inventory }) => inventory.stock <= inventory.reorderPoint).length} products are at or below reorder point`} action={<button className="text-link" onClick={() => onNavigate('Inventory')}>View inventory <ArrowUpRight size={14} /></button>}>
          <div className="operations-record-list">{inventoryRows.filter(({ inventory }) => inventory.stock <= inventory.reorderPoint).slice(0, 5).map(({ inventory, product }) => <article className="operations-record" key={inventory.productId}><span className="operations-record-icon"><Package size={17} /></span><div><strong>{product?.name ?? inventory.productId}</strong><small>{inventory.warehouse} · {inventory.stock} on hand / {inventory.reorderPoint} reorder point</small></div><span className="operations-pill red">REORDER</span></article>)}</div>
          {inventoryRows.every(({ inventory }) => inventory.stock > inventory.reorderPoint) && <Empty message="No products are at or below the recorded reorder point." />}
        </Panel>
        <Panel title="Dataset coverage" detail="Real source record counts">
          <div className="operations-data-coverage">{[
            ['Transactions', dataset.transactions.length],
            ['Products', dataset.products.length],
            ['Inventory records', dataset.inventory.length],
            ['Supplier cost records', dataset.suppliers.length],
            ['Returns', dataset.returns.length],
          ].map(([label, count]) => <div key={label}><span>{label}</span><strong>{formatNumber(Number(count))}</strong></div>)}</div>
        </Panel>
      </div>
    </div>
  }

  function renderTransactions() {
    const statuses = [...new Set(dataset.transactions.map(row => row.status))].sort()
    return <div className="operations-stack">
      {pageHeader('COMMERCE · TRANSACTIONS', 'Transactions', `${formatNumber(filteredTransactions.length)} of ${formatNumber(dataset.transactions.length)} source transaction rows. Customer and transaction identifiers are excluded.`)}
      <Panel title="Transaction records" detail="Money amounts are converted to INR; canceled and refunded rows remain labeled." action={<button className="button button-outline button-small" onClick={() => exportTransactions(filteredTransactions, usdInrRate)}><Download size={14} /> Export filtered CSV</button>}>
        <div className="operations-filter-row">{searchFilter('Search date, product, country…')}{categoryFilter()}<label className="operations-inline-search">Status<select value={selectedStatus} onChange={event => { setSelectedStatus(event.target.value); setCurrentPage(0) }}><option>All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label></div>
        {visibleTransactions.length ? <Table headers={['DATE', 'PRODUCT', 'CATEGORY', 'QTY', 'REVENUE (INR)', 'PROFIT (INR)', 'CHANNEL', 'STATUS', 'COUNTRY']}>{visibleTransactions.map((row, index) => <tr key={`${currentPage * pageSize + index}-${row.date}-${row.productId}`}><td>{formatDate(row.date)}</td><td>{row.productId}</td><td>{row.category}</td><td>{formatNumber(row.quantity)}</td><td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{row.channel.replace(/_/g, ' ')}</td><td><span className={`operations-pill ${row.status === 'completed' ? 'green' : row.status === 'refunded' ? 'amber' : 'blue'}`}>{row.status}</span></td><td>{row.country}</td></tr>)}</Table> : <Empty message="Try a different search, category, or status." />}
        <div className="olist-pagination"><span>Showing {filteredTransactions.length ? (currentPage * pageSize + 1).toLocaleString() : 0}–{Math.min((currentPage + 1) * pageSize, filteredTransactions.length).toLocaleString()} of {filteredTransactions.length.toLocaleString()}</span><div><button className="button button-outline button-small" disabled={currentPage === 0} onClick={() => setCurrentPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {pageCount ? currentPage + 1 : 0} of {pageCount}</span><button className="button button-outline button-small" disabled={!pageCount || currentPage >= pageCount - 1} onClick={() => setCurrentPage(value => Math.min(pageCount - 1, value + 1))}>Next</button></div></div>
      </Panel>
    </div>
  }

  function renderShipments() {
    const statuses = [...new Set(dataset.transactions.map(row => row.status))].sort()
    const start = currentPage * pageSize
    const visibleRows = filteredTransactions.slice(start, start + pageSize)
    const shippingCostTotal = filteredTransactions.reduce((sum, row) => sum + row.shippingCost, 0)
    const markets = new Set(filteredTransactions.map(row => row.country)).size

    return <div className="operations-stack">
      {pageHeader('SUPPLY CHAIN · SHIPMENTS', 'Shipments', `${formatNumber(filteredTransactions.length)} of ${formatNumber(dataset.transactions.length)} transaction rows with recorded shipping costs.`)}
      <div className="command-center-metrics">
        <Stat label="Matching records" value={formatNumber(filteredTransactions.length)} detail="Source transaction rows" icon={Truck} />
        <Stat label="Shipping costs" value={money(shippingCostTotal)} detail="For matching rows · INR" icon={ArrowDownRight} tone="metric-tone-orange" />
        <Stat label="Markets" value={formatNumber(markets)} detail="Represented in matching rows" icon={Package} tone="metric-tone-violet" />
      </div>
      <Panel title="Shipment-related records" detail="The dataset records shipping cost on transactions, but does not contain shipment IDs, carriers, routes, or delivery statuses." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-shipment-records.csv', [
        ['Order date', 'Estimated shipped date', 'Product', 'Product ID', 'Category', 'Market', 'Quantity', 'Shipping cost INR', 'Channel', 'Payment method', 'Revenue INR', 'Transaction status'],
        ...filteredTransactions.map(row => {
          const leadDays = supplierLeadDaysByProduct.get(row.productId)
          return [row.date, leadDays === undefined ? 'Unavailable' : addDaysToDate(row.date, leadDays), productsById.get(row.productId)?.name ?? row.productId, row.productId, row.category, row.country, row.quantity, toInr(row.shippingCost, usdInrRate), row.channel, row.paymentMethod, toInr(row.revenue, usdInrRate), row.status]
        }),
      ])}><Download size={14} /> Export filtered CSV</button>}>
        <div className="operations-filter-row">
          {searchFilter('Search date, product, country…')}
          {categoryFilter()}
          <label className="operations-inline-search">Transaction status<select value={selectedStatus} onChange={event => { setSelectedStatus(event.target.value); setCurrentPage(0) }}><option>All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        {visibleRows.length ? <Table headers={['ORDER DATE', 'SHIPPED DATE', 'PRODUCT', 'CATEGORY', 'MARKET', 'QUANTITY', 'SHIPPING COST (INR)', 'CHANNEL', 'PAYMENT METHOD', 'REVENUE (INR)', 'TRANSACTION STATUS']}>{visibleRows.map((row, index) => {
          const statusTone = row.status === 'completed' ? 'green' : row.status === 'refunded' ? 'amber' : row.status === 'cancelled' ? 'red' : ''
          const leadDays = supplierLeadDaysByProduct.get(row.productId)
          const estimatedShippedDate = leadDays === undefined ? '' : addDaysToDate(row.date, leadDays)
          return <tr key={`${start + index}-${row.date}-${row.productId}`}><td>{formatDate(row.date)}</td><td>{estimatedShippedDate ? formatDate(estimatedShippedDate) : 'Unavailable'}</td><td><strong>{productsById.get(row.productId)?.name ?? row.productId}</strong><small>{row.productId}</small></td><td>{row.category}</td><td>{row.country}</td><td>{formatNumber(row.quantity)}</td><td>{money(row.shippingCost)}</td><td>{row.channel.replace(/_/g, ' ')}</td><td>{row.paymentMethod.replace(/_/g, ' ')}</td><td>{money(row.revenue)}</td><td><span className={`operations-pill ${statusTone}`}>{row.status.replace(/_/g, ' ')}</span></td></tr>
        })}</Table> : <Empty message="Try a different search, category, or transaction status." />}
        <div className="olist-pagination"><span>Showing {filteredTransactions.length ? (start + 1).toLocaleString() : 0}–{Math.min(start + pageSize, filteredTransactions.length).toLocaleString()} of {filteredTransactions.length.toLocaleString()}</span><div><button className="button button-outline button-small" disabled={currentPage === 0} onClick={() => setCurrentPage(value => Math.max(0, value - 1))}>Previous</button><span>Page {pageCount ? currentPage + 1 : 0} of {pageCount}</span><button className="button button-outline button-small" disabled={!pageCount || currentPage >= pageCount - 1} onClick={() => setCurrentPage(value => Math.min(pageCount - 1, value + 1))}>Next</button></div></div>
        <p className="tracking-source-note">Estimated shipped date = order date + recorded supplier lead time (primary supplier first; inventory lead time if no supplier record exists). This is an estimate, not an actual carrier dispatch date. Transaction status does not show whether an item is in transit or delivered.</p>
      </Panel>
    </div>
  }

  function renderProducts() {
    return <div className="operations-stack">{pageHeader('COMMERCE · CATALOG', 'Products', `${dataset.products.length.toLocaleString()} products from the source catalog.`)}
      <Panel title="Product catalog" detail="Prices and costs are converted to INR; source USD records remain unchanged." action={<><button className="button button-outline button-small" onClick={() => exportProducts(filteredProducts, usdInrRate)}><Download size={14} /> Export products</button>{searchFilter('Search products')}</>}>
        <div className="operations-filter-row">{categoryFilter()}</div>
        {filteredProducts.length ? <Table headers={['PRODUCT', 'CATEGORY', 'BRAND', 'PRICE (INR)', 'UNIT COST (INR)', 'MARGIN', 'STATUS']}>{filteredProducts.slice(0, 500).map(product => <tr key={product.productId}><td><strong>{product.name}</strong><small>{product.productId}</small></td><td>{product.category}</td><td>{product.brand}</td><td>{money(product.unitPrice)}</td><td>{money(product.unitCost)}</td><td>{formatPercent(product.unitPrice ? (product.unitPrice - product.unitCost) / product.unitPrice : 0)}</td><td><span className={`operations-pill ${product.active ? 'green' : 'blue'}`}>{product.active ? 'Active' : 'Inactive'}</span></td></tr>)}</Table> : <Empty message="Try a different product search or category." />}
        {filteredProducts.length > 500 && <p className="operations-report-copy">Showing the first 500 matching products. Export to download all {filteredProducts.length.toLocaleString()} matches.</p>}
      </Panel>
    </div>
  }

  function openReorderDraft(inventory: InventoryRecord) {
    const suppliers = dataset.suppliers
      .filter(row => row.productId === inventory.productId)
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.rank - b.rank)
    const supplier = suppliers[0]
    setReorderProductId(inventory.productId)
    setReorderSupplierKey(supplier ? `${supplier.name}|${supplier.rank}` : '')
    setReorderQuantity(Math.max(1, inventory.reorderPoint - inventory.stock, supplier?.minOrderQty ?? 1))
  }

  function renderInventory() {
    return <div className="operations-stack">{pageHeader('COMMERCE · INVENTORY', 'Inventory', `${dataset.inventory.length.toLocaleString()} stock records joined to the product catalog.`)}
      <div className="command-center-metrics"><Stat label="At/below reorder point" value={formatNumber(inventoryRows.filter(({ inventory }) => inventory.stock <= inventory.reorderPoint).length)} detail="Recorded stock threshold" icon={CircleAlert} tone="metric-tone-orange" /><Stat label="Inventory units" value={formatNumber(dataset.inventory.reduce((sum, row) => sum + row.stock, 0))} detail="Units across recorded products" icon={Package} /><Stat label="Average supplier lead" value={`${(dataset.inventory.reduce((sum, row) => sum + row.supplierLeadDays, 0) / Math.max(1, dataset.inventory.length)).toFixed(1)} days`} detail="Recorded supplier lead days" icon={Clock3} tone="metric-tone-violet" /></div>
      <Panel title="Stock records" detail="No stock quantities are invented or edited in this read-only dataset view." action={<button className="button button-outline button-small" onClick={() => exportInventory(filteredInventory)}><Download size={14} /> Export inventory</button>}>
        <div className="operations-filter-row">{searchFilter('Search product or warehouse')}{categoryFilter()}</div>
        {filteredInventory.length ? <Table headers={['PRODUCT', 'CATEGORY', 'WAREHOUSE', 'ON HAND', 'REORDER POINT', 'LEAD TIME', 'ACTION']}>{filteredInventory.slice(0, 500).map(({ inventory, product }) => { const low = inventory.stock <= inventory.reorderPoint; return <tr key={inventory.productId}><td><strong>{product?.name ?? inventory.productId}</strong><small>{inventory.productId}</small></td><td>{inventory.category}</td><td>{inventory.warehouse}</td><td>{formatNumber(inventory.stock)}</td><td>{formatNumber(inventory.reorderPoint)}</td><td>{inventory.supplierLeadDays} days</td><td>{low ? <button className="button button-outline button-small operations-reorder-button" type="button" onClick={() => openReorderDraft(inventory)}><Package size={13} />Reorder</button> : <span className="operations-pill green">In range</span>}</td></tr> })}</Table> : <Empty message="Try a different product or warehouse search." />}
        {filteredInventory.length > 500 && <p className="operations-report-copy">Showing the first 500 matching records; export to download all matches.</p>}
      </Panel>
    </div>
  }

  function renderSuppliers() {
    return <div className="operations-stack">{pageHeader('COMMERCE · SUPPLIERS', 'Supplier network', `${supplierSummary.length.toLocaleString()} supplier names from the supplier cost records.`)}
      <Panel title="Supplier performance and costs" detail="Reliability and lead-time values are averages of recorded product-level supplier entries." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-suppliers.csv', [['Supplier', 'Products', 'Reliability', 'Average lead days', 'Average unit cost INR', 'Average ordering cost INR', 'Average annual holding cost INR', 'Primary product records'], ...filteredSupplierSummary.map(row => { const records = dataset.suppliers.filter(item => item.name === row.name); return [row.name, row.products, row.reliability, row.leadDays, toInr(row.unitCost, usdInrRate), toInr(records.reduce((sum, item) => sum + item.orderingCost, 0) / records.length, usdInrRate), toInr(records.reduce((sum, item) => sum + item.annualHoldingCost, 0) / records.length, usdInrRate), row.primaryProducts] })])}><Download size={14} /> Export suppliers</button>}>
        {searchFilter('Search suppliers')}
        <Table headers={['SUPPLIER', 'PRODUCT RECORDS', 'RELIABILITY', 'AVG. LEAD TIME', 'AVG. UNIT COST (INR)', 'AVG. ORDER COST (INR)', 'AVG. HOLDING COST/YR (INR)', 'PRIMARY']}>{filteredSupplierSummary.map(row => { const records = dataset.suppliers.filter(item => item.name === row.name); return <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.products}</td><td>{formatPercent(row.reliability)}</td><td>{row.leadDays.toFixed(1)} days</td><td>{money(row.unitCost)}</td><td>{money(records.reduce((sum, item) => sum + item.orderingCost, 0) / records.length)}</td><td>{money(records.reduce((sum, item) => sum + item.annualHoldingCost, 0) / records.length)}</td><td>{row.primaryProducts}</td></tr> })}</Table>
      </Panel>
      <div className="operations-warning"><ShieldCheck size={18} /><span><strong>Source coverage:</strong> supplier contacts, contracts, shipment assignments, and live status are not present in the supplied files.</span></div>
    </div>
  }

  function renderReturns() {
    const refundTotal = dataset.returns.reduce((sum, row) => sum + row.refundAmount, 0)
    const reasonCounts = new Map<string, number>()
    for (const row of dataset.returns) reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1)
    return <div className="operations-stack">{pageHeader('COMMERCE · RETURNS', 'Returns', `${dataset.returns.length.toLocaleString()} recorded return rows; identifiers for customers and transactions are excluded.`)}
      <div className="command-center-metrics"><Stat label="Refunds recorded" value={money(refundTotal)} detail="Converted from source USD" icon={RefreshCw} tone="metric-tone-orange" /><Stat label="Return reasons" value={String(reasonCounts.size)} detail="Distinct source labels" icon={CircleAlert} tone="metric-tone-violet" /></div>
      <Panel title="Return records" detail="Refunds are converted to INR; source rows are read-only." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-returns.csv', [['Product ID', 'Product', 'Category', 'Return date', 'Reason', 'Refund INR'], ...filteredReturns.map(row => { const product = productsById.get(row.productId); return [row.productId, product?.name ?? '', product?.category ?? '', row.returnDate, row.reason, toInr(row.refundAmount, usdInrRate)] })])}><Download size={14} /> Export returns</button>}>
        <div className="operations-filter-row">{searchFilter('Search product or return reason')}{categoryFilter()}</div>
        {filteredReturns.length ? <Table headers={['PRODUCT', 'CATEGORY', 'RETURN DATE', 'REASON', 'REFUND (INR)']}>{filteredReturns.slice(0, 500).map((row, index) => { const product = productsById.get(row.productId); return <tr key={`${row.productId}-${row.returnDate}-${index}`}><td><strong>{product?.name ?? row.productId}</strong><small>{row.productId}</small></td><td>{product?.category ?? '—'}</td><td>{formatDate(row.returnDate)}</td><td>{row.reason.replace(/_/g, ' ')}</td><td>{money(row.refundAmount)}</td></tr> })}</Table> : <Empty message="Try a different return search or category." />}
        {filteredReturns.length > 500 && <p className="operations-report-copy">Showing the first 500 matching rows; export to download all matches.</p>}
      </Panel>
    </div>
  }

  function renderPricing() {
    const filtered = dataset.pricing.filter(row =>
      (selectedCategory === 'All categories' || row.category === selectedCategory)
      && (!query || `${row.productId} ${row.category} ${row.month} ${productsById.get(row.productId)?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    )
    return <div className="operations-stack">{pageHeader('COMMERCE · PRICING', 'Pricing history', `${dataset.pricing.length.toLocaleString()} price-history rows from the supplied archive.`)}
      <Panel title="Recorded prices" detail="Monetary values are converted to INR; compare listed and competitor prices, promotions, units, and margins." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-pricing.csv', [['Product ID', 'Category', 'Month', 'Listed price INR', 'Base price INR', 'Competitor price INR', 'Price index', 'Promotion', 'Elasticity', 'Units sold', 'Revenue INR', 'Margin'], ...filtered.map(row => [row.productId, row.category, row.month, toInr(row.listedPrice, usdInrRate), toInr(row.basePrice, usdInrRate), toInr(row.competitorPrice, usdInrRate), row.priceIndex, row.promotional, row.priceElasticity, row.unitsSold, toInr(row.revenue, usdInrRate), row.marginPct])])}><Download size={14} /> Export pricing</button>}>
        <div className="operations-filter-row">{searchFilter('Search product or month')}{categoryFilter()}</div>
        <Table headers={['PRODUCT', 'CATEGORY', 'MONTH', 'LISTED (INR)', 'BASE (INR)', 'COMPETITOR (INR)', 'REVENUE (INR)', 'INDEX', 'PROMO', 'MARGIN']}>{filtered.slice(0, 500).map((row, index) => <tr key={`${row.productId}-${row.month}-${index}`}><td>{productsById.get(row.productId)?.name ?? row.productId}</td><td>{row.category}</td><td>{row.month}</td><td>{money(row.listedPrice)}</td><td>{money(row.basePrice)}</td><td>{money(row.competitorPrice)}</td><td>{money(row.revenue)}</td><td>{row.priceIndex.toFixed(2)}</td><td>{row.promotional ? 'Yes' : 'No'}</td><td>{formatPercent(row.marginPct)}</td></tr>)}</Table>
        {filtered.length > 500 && <p className="operations-report-copy">Showing the first 500 matching rows; export to download all {filtered.length.toLocaleString()} rows.</p>}
      </Panel>
    </div>
  }

  function renderMarketing() {
    const channels = new Map<string, { spend: number; revenue: number; orders: number; impressions: number; clicks: number }>()
    for (const record of dataset.marketing) {
      const value = channels.get(record.channel) ?? { spend: 0, revenue: 0, orders: 0, impressions: 0, clicks: 0 }
      value.spend += record.spend
      value.revenue += record.revenue
      value.orders += record.orders
      value.impressions += record.impressions
      value.clicks += record.clicks
      channels.set(record.channel, value)
    }
    const rows = [...channels.entries()].map(([channel, values]) => ({ channel, ...values })).sort((a, b) => b.revenue - a.revenue)
    const filtered = dataset.marketing.filter(row => !query || `${row.channel} ${row.month}`.toLowerCase().includes(query.toLowerCase()))
    return <div className="operations-stack">{pageHeader('COMMERCE · MARKETING', 'Marketing performance', `${dataset.marketing.length.toLocaleString()} monthly channel records.`)}
      <div className="command-center-metrics"><Stat label="Recorded spend" value={money(dataset.marketing.reduce((sum, row) => sum + row.spend, 0))} detail="All channels and months · INR" icon={ArrowDownRight} tone="metric-tone-orange" /><Stat label="Reported revenue" value={money(dataset.marketing.reduce((sum, row) => sum + row.revenue, 0))} detail="Converted from source USD" icon={ArrowUpRight} tone="metric-tone-teal" /><Stat label="Reported orders" value={formatNumber(dataset.marketing.reduce((sum, row) => sum + row.orders, 0))} detail="Source actual_orders" icon={Activity} /></div>
      <Panel title="Channel comparison" detail="Aggregates from the source marketing table; amounts in INR"><Table headers={['CHANNEL', 'SPEND (INR)', 'REPORTED REVENUE (INR)', 'ROAS', 'ORDERS', 'CLICKS']}>{rows.map(row => <tr key={row.channel}><td>{row.channel.replace(/_/g, ' ')}</td><td>{money(row.spend)}</td><td>{money(row.revenue)}</td><td>{formatPercent(row.spend ? row.revenue / row.spend : 0, 2)}</td><td>{formatNumber(row.orders)}</td><td>{formatNumber(row.clicks)}</td></tr>)}</Table></Panel>
      <Panel title="Monthly channel records" detail="Searchable source rows; money amounts in INR." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-marketing.csv', [['Month', 'Channel', 'Spend INR', 'Impressions', 'Clicks', 'CTR', 'Orders', 'Customers', 'Revenue INR', 'ROAS', 'CAC INR', 'Cost/order INR'], ...filtered.map(row => [row.month, row.channel, toInr(row.spend, usdInrRate), row.impressions, row.clicks, row.ctr, row.orders, row.customers, toInr(row.revenue, usdInrRate), row.roas, toInr(row.cac, usdInrRate), toInr(row.costPerOrder, usdInrRate)])])}><Download size={14} /> Export marketing</button>}>
        {searchFilter('Search channel or month')}
        <Table headers={['MONTH', 'CHANNEL', 'SPEND (INR)', 'ORDERS', 'CUSTOMERS', 'REVENUE (INR)', 'ROAS']}>{filtered.map(row => <tr key={`${row.month}-${row.channel}`}><td>{row.month}</td><td>{row.channel.replace(/_/g, ' ')}</td><td>{money(row.spend)}</td><td>{formatNumber(row.orders)}</td><td>{formatNumber(row.customers)}</td><td>{money(row.revenue)}</td><td>{row.roas.toFixed(2)}</td></tr>)}</Table>
      </Panel>
    </div>
  }

  function renderCustomers() {
    const groups = [
      ['Customers by country', dataset.customers.countries],
      ['Customers by age range', dataset.customers.ageBands],
      ['Customers by currency', dataset.customers.currencies],
      ['Customers by reported gender', dataset.customers.genders],
    ] as const
    return <div className="operations-stack">{pageHeader('COMMERCE · CUSTOMER INSIGHTS', 'Customer insights', 'Only grouped totals are used here; names, email addresses, and customer IDs are not included in the browser dataset.')}
      <div className="command-center-metrics"><Stat label="Customer records" value={formatNumber(dataset.customers.total)} detail="Aggregate only" icon={Users} /><Stat label="Premium customers" value={formatNumber(dataset.customers.premium)} detail={formatPercent(dataset.customers.premium / Math.max(1, dataset.customers.total))} icon={ShieldCheck} tone="metric-tone-violet" /><Stat label="Email verified" value={formatNumber(dataset.customers.verified)} detail={formatPercent(dataset.customers.verified / Math.max(1, dataset.customers.total))} icon={Check} tone="metric-tone-teal" /></div>
      {searchFilter('Search country, currency, age range…')}
      <div className="command-center-grid">{groups.map(([title, records]) => {
        const visibleRecords = records.filter(row => !query || row.name.toLowerCase().includes(query.toLowerCase()))
        return <Panel key={title} title={title} detail="Aggregated customer counts from the source file"><Table headers={['GROUP', 'CUSTOMERS']}>{visibleRecords.map(row => <tr key={row.name}><td>{row.name}</td><td>{formatNumber(row.customers)}</td></tr>)}</Table>{visibleRecords.length === 0 && <p className="operations-report-copy">No groups match this search.</p>}</Panel>
      })}</div>
    </div>
  }

  function acknowledgeAlert(key: string) {
    setAcknowledgedAlerts(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function renderAlerts() {
    const open = alerts.filter(alert => !acknowledgedAlerts.has(alert.key))
    return <div className="operations-stack">{pageHeader('COMMERCE · RISK & ALERTS', 'Risk & alerts', 'Attention flags use explicit checks against recorded stock and supplier reliability; they are not machine-learning predictions.')}
      <div className="command-center-metrics"><Stat label="Open data flags" value={formatNumber(open.length)} detail="Session-only acknowledgement state" icon={CircleAlert} tone="metric-tone-orange" /><Stat label="Stock at/below reorder" value={formatNumber(inventoryRows.filter(({ inventory }) => inventory.stock <= inventory.reorderPoint).length)} detail="Recorded inventory values" icon={Package} /><Stat label="Supplier reliability under 65%" value={formatNumber(supplierSummary.filter(row => row.reliability < 0.65).length)} detail="Average from product-level entries" icon={ShieldCheck} tone="metric-tone-violet" /></div>
      <Panel title="Data quality and attention flags" detail="Acknowledging a flag changes only this browser session." action={open.length > 0 ? <button className="button button-outline button-small" onClick={() => setAcknowledgedAlerts(new Set(alerts.map(alert => alert.key)))}><Check size={14} /> Acknowledge all</button> : undefined}>
        {alerts.filter(alert => !query || `${alert.title} ${alert.detail}`.toLowerCase().includes(query.toLowerCase())).map(alert => { const acknowledged = acknowledgedAlerts.has(alert.key); return <article className="operations-record" key={alert.key}><span className={`operations-record-icon ${alert.severity === 'High' ? 'orange' : 'blue'}`}><CircleAlert size={17} /></span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div><span className={`operations-pill ${acknowledged ? 'green' : alert.severity === 'High' ? 'red' : 'amber'}`}>{acknowledged ? 'Acknowledged' : alert.severity}</span><button className="button button-outline button-small" onClick={() => acknowledgeAlert(alert.key)}>{acknowledged ? 'Reopen' : 'Acknowledge'}</button></article> })}
        {alerts.filter(alert => !query || `${alert.title} ${alert.detail}`.toLowerCase().includes(query.toLowerCase())).length === 0 && <Empty message="No stock or supplier flags match the search or stated thresholds." />}
      </Panel>
    </div>
  }

  function renderSimulator() {
    const canceled = dataset.transactions.filter(row => row.status === 'cancelled')
    const canceledRevenue = canceled.reduce((sum, row) => sum + row.revenue, 0)
    const cancellationExposure = completedRevenue * disruptionRate / 100
    const addedShipping = totalShippingCost * shippingIncrease / 100
    return <div className="operations-stack">{pageHeader('COMMERCE · WHAT-IF', 'What-if simulator', 'Adjust scenario assumptions to estimate exposure using recorded completed revenue and shipping costs. This is arithmetic, not a forecast.')}
      <div className="command-center-grid">
        <Panel title="Scenario assumptions" detail="Change the sliders to recalculate the estimates.">
          <label className="operations-scenario-control">Completed revenue exposed to cancellation <strong>{disruptionRate}%</strong><input type="range" min="0" max="50" value={disruptionRate} onChange={event => setDisruptionRate(Number(event.target.value))} /></label>
          <label className="operations-scenario-control">Increase in recorded shipping cost <strong>{shippingIncrease}%</strong><input type="range" min="0" max="100" value={shippingIncrease} onChange={event => setShippingIncrease(Number(event.target.value))} /></label>
          <div className="operations-warning"><CircleAlert size={18} /><span>Archive contains {money(canceledRevenue)} in rows labeled canceled. Scenario results below are assumption-based and do not alter source values.</span></div>
        </Panel>
        <Panel title="Illustrative exposure" detail="Computed from supplied transaction amounts.">
          <div className="operations-scenario-result"><span>Revenue exposed at the selected rate</span><strong>{money(cancellationExposure)}</strong></div>
          <div className="operations-scenario-result"><span>Additional shipping cost at selected rate</span><strong>{money(addedShipping)}</strong></div>
          <div className="operations-scenario-result"><span>Combined illustrative exposure</span><strong>{money(cancellationExposure + addedShipping)}</strong></div>
          <p className="operations-report-copy">No future outcomes, demand changes, or disruption probabilities are predicted.</p>
        </Panel>
      </div>
    </div>
  }

  function renderReports() {
    const summaryRows: Array<Array<string | number>> = [
      ['Metric', 'Value'],
      ['Source transaction rows', dataset.transactions.length],
      ['Completed transactions', completedTransactions.length],
      ['Completed revenue (INR)', toInr(completedRevenue, usdInrRate).toFixed(2)],
      ['Completed profit (INR)', toInr(completedProfit, usdInrRate).toFixed(2)],
      ['Products', dataset.products.length],
      ['Inventory records', dataset.inventory.length],
      ['Supplier cost records', dataset.suppliers.length],
      ['Return records', dataset.returns.length],
      ['Marketing records', dataset.marketing.length],
      ['Price history records', dataset.pricing.length],
    ]
    return <div className="operations-stack">{pageHeader('COMMERCE · REPORTS', 'Reports', 'Exports contain records from the supplied archive; customer names, email addresses, and direct transaction identifiers are excluded.')}
      <div className="command-center-metrics"><Stat label="Transactions" value={formatNumber(dataset.transactions.length)} detail="All source statuses" icon={Activity} /><Stat label="Revenue" value={money(completedRevenue)} detail="Completed transaction rows · INR" icon={ArrowUpRight} tone="metric-tone-teal" /><Stat label="Returns" value={formatNumber(dataset.returns.length)} detail="Source return rows" icon={RefreshCw} tone="metric-tone-orange" /><Stat label="Price records" value={formatNumber(dataset.pricing.length)} detail="Source price history" icon={Tags} tone="metric-tone-violet" /></div>
      <Panel title="Dataset summary" detail="Financial totals are converted from source USD to INR." action={<button className="button button-outline button-small" onClick={() => downloadCsv('supplyshield-dataset-summary.csv', summaryRows)}><Download size={14} /> Export summary</button>}><Table headers={['METRIC', 'VALUE']}>{summaryRows.slice(1).map(row => <tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td></tr>)}</Table></Panel>
      <Panel title="Record exports" detail="Choose a source table to export.">
        <div className="operations-export-grid">
          <button className="button button-outline" onClick={() => exportTransactions(dataset.transactions, usdInrRate)}><Download size={14} />Transactions</button>
          <button className="button button-outline" onClick={() => exportProducts(dataset.products, usdInrRate)}><Download size={14} />Products</button>
          <button className="button button-outline" onClick={() => exportInventory(inventoryRows)}><Download size={14} />Inventory</button>
          <button className="button button-outline" onClick={() => onNavigate('Returns')}><RefreshCw size={14} />Returns</button>
        </div>
      </Panel>
    </div>
  }

  function askDataset() {
    setAiResult(answerDatasetQuestion(
      aiQuestion.trim() || 'Summarize the main signals in this dataset.',
      dataset,
      usdInrRate,
    ))
  }

  function renderAi() {
    return <div className="operations-stack">{pageHeader('COMMERCE · DATA ASSISTANT', 'AI assistant', 'Answers are calculated locally from the supplied dataset. No external AI provider is used, and only information present in the archive can be answered.')}
      <Panel title="Ask about the workspace" detail="Answers are calculated locally from the loaded workspace records." action={<span className="operations-pill green">WORKSPACE READY</span>}>
        <form className="operations-form" onSubmit={event => { event.preventDefault(); askDataset() }}>
          <label>Your question<textarea rows={4} maxLength={2000} value={aiQuestion} onChange={event => setAiQuestion(event.target.value)} placeholder="Ask about revenue, products, inventory, suppliers, returns, or pricing…" /></label>
          <button className="button button-dark" type="submit"><Sparkles size={15} />Ask assistant</button>
        </form>
        {aiResult && <div className="operations-ai-result"><Bot size={17} /><div><strong>Answer</strong><p>{aiResult}</p></div></div>}
      </Panel>
    </div>
  }

  function renderSourceInfo() {
    const sourceTables = [
      ['transactions.csv', dataset.transactions.length, 'Sales rows with dates, product/category, quantity, amounts, channel, status, and country. Customer and transaction IDs are omitted.'],
      ['products.csv', dataset.products.length, 'Catalog descriptions, brands, prices, costs, weight, active status, and launch date.'],
      ['inventory.csv', dataset.inventory.length, 'Stock, reorder threshold, warehouse, restock date, and supplier lead time.'],
      ['supplier_costs.csv', dataset.suppliers.length, 'Supplier name, product costs, lead time, minimum order quantity, and reliability score.'],
      ['returns.csv', dataset.returns.length, 'Product, return date, reason, refund, and restocking state. Direct record/customer identifiers are omitted.'],
      ['price_history.csv', dataset.pricing.length, 'Monthly product pricing, competitor pricing, promotions, units, revenue, and margins.'],
      ['marketing_spend.csv', dataset.marketing.length, 'Monthly channel spend, impressions, clicks, orders, customers, revenue, and cost metrics.'],
      ['customers.csv', dataset.customers.total, 'Aggregate counts by country, currency, age band, gender, premium status, and email verification. Names, emails, and customer IDs are not included.'],
    ] as const
    return <div className="operations-stack">{pageHeader('COMMERCE · DATASET', 'Dataset & sources', 'Workspace data comes from the archive.zip supplied for this project. Fields not included in its source files are not fabricated.')}
      <div className="operations-warning"><ShieldCheck size={18} /><span><strong>Privacy:</strong> customer names, email addresses, customer IDs, transaction IDs, and return IDs are not included in the browser dataset. Customer information is limited to grouped counts.</span></div>
      <Panel title="Archive contents" detail="Counts below are source rows or, for customers, the aggregate customer total.">
        <Table headers={['SOURCE FILE', 'ROWS', 'FIELDS USED']}>{sourceTables.map(([name, rows, description]) => <tr key={name}><td><strong>{name}</strong></td><td>{formatNumber(rows)}</td><td>{description}</td></tr>)}</Table>
      </Panel>
      <Panel title="Not included in this archive" detail="No separate shipment or logistics tracking files were provided.">
        <div className="operations-warning"><Truck size={18} /><span>This dataset has commerce transactions and supplier lead-time values, but no shipment records, carrier tracking numbers, GPS events, or shipment routes. The workspace therefore does not present duplicate or invented shipment rows.</span></div>
      </Panel>
    </div>
  }

  function renderTracking() {
    async function addTracking(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      setTrackingError('')
      setTrackingBusy(true)
      try {
        const response = await fetch('/api/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}) },
          body: JSON.stringify({ trackingNumber: trackingNumber.trim(), ...(trackingCarrier.trim() ? { carrier: trackingCarrier.trim() } : {}) }),
        })
        const payload: unknown = await response.json()
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `Tracking request failed (HTTP ${response.status}).`
          throw new Error(message)
        }
        if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string'
          || !('trackingNumber' in payload) || typeof payload.trackingNumber !== 'string'
        ) throw new Error('AfterShip returned an invalid tracking response.')
        setTrackingRecords(current => [payload as Tracking, ...current])
        setTrackingNumber('')
      } catch (error) {
        setTrackingError(error instanceof Error ? error.message : 'Could not add live tracking.')
      } finally {
        setTrackingBusy(false)
      }
    }

    async function refreshTracking(id: string) {
      setTrackingError('')
      try {
        const response = await fetch(`/api/tracking/${encodeURIComponent(id)}`, {
          headers: { ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}) },
        })
        const payload: unknown = await response.json()
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `Tracking refresh failed (HTTP ${response.status}).`
          throw new Error(message)
        }
        if (!payload || typeof payload !== 'object' || !('id' in payload) || payload.id !== id) {
          throw new Error('AfterShip returned an invalid tracking response.')
        }
        setTrackingRecords(current => current.map(item => item.id === id ? payload as Tracking : item))
      } catch (error) {
        setTrackingError(error instanceof Error ? error.message : 'Could not refresh carrier events.')
      }
    }

    const maxOrders = Math.max(1, ...marketActivity.map(market => market.orders))
    const selectedMarketStats = marketActivity.find(market => market.country === selectedMarket)
    return <div className="operations-stack">
      <div className="tracking-page-header">
        {pageHeader('SUPPLY CHAIN · WORKSPACE', 'Live Tracking', 'Review order activity by market from workspace records. No live GPS feed is connected.')}
        <div className="operations-page-actions">
          <button className="button button-outline" onClick={() => downloadCsv('supplyshield-market-activity.csv', [
            ['Country / market', 'Order records', 'Completed', 'Cancelled', 'Refunded'],
            ...marketActivity.map(market => [market.country, market.orders, market.completed, market.canceled, market.refunded]),
          ])}><Download size={15} />Export report</button>
          <button className="button button-dark" onClick={() => openQuickPage('Transactions')}><Package size={15} />View transactions</button>
        </div>
      </div>

      <Panel title="Route monitoring" detail="Market order activity from the supplied dataset. Country positions below are illustrative and are not geographic coordinates.">
        <div className="tracking-schematic-heading"><span><Activity size={15} /> MARKET ACTIVITY</span><small>No coordinates or live GPS feed</small></div>
        <div className="tracking-schematic" aria-label="Illustrative market activity diagram, not a geographic map">
          <div className="tracking-schematic-title">MARKET ACTIVITY · ILLUSTRATIVE LAYOUT, NOT GPS</div>
          <svg className="tracking-schematic-lines" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
            <path d="M75 160 C190 120 210 68 325 92 S485 215 565 182 S730 70 920 115" />
            <path d="M210 50 C350 75 405 162 520 132 S700 125 845 190" />
            <path d="M390 240 C470 210 540 235 615 188 S760 82 860 74" />
          </svg>
          {marketActivity.slice(0, marketNodePositions.length).map((market, index) => {
            const position = marketNodePositions[index]
            const unresolvedShare = (market.canceled + market.refunded) / Math.max(1, market.orders)
            const tone = unresolvedShare >= 0.18 ? 'risk' : market.completed / Math.max(1, market.orders) >= 0.85 ? 'healthy' : 'watch'
            return <button
              key={market.country}
              className={`tracking-market-node ${tone} ${selectedMarket === market.country ? 'selected' : ''}`}
              style={{ left: `${position.left}%`, top: `${position.top}%`, '--node-size': `${Math.max(14, Math.min(25, 14 + market.orders / maxOrders * 11))}px` } as CSSProperties}
              aria-pressed={selectedMarket === market.country}
              title={`${market.country}: ${formatNumber(market.orders)} order records · positions are illustrative`}
              onClick={() => setSelectedMarket(current => current === market.country ? '' : market.country)}
            >
              <i />
              <span>{market.country}<small>{formatNumber(market.orders)} records</small></span>
            </button>
          })}
          <div className="tracking-schematic-footer"><span><i />Order status is summarized from source records</span><span>Click a market marker to filter order records</span></div>
        </div>

        <div className="tracking-market-summary">
          <span><b>{formatNumber(dataset.transactions.length)}</b><small>source order records</small></span>
          <span><b>{formatNumber(marketActivity.length)}</b><small>markets in dataset</small></span>
          <span><b>{formatNumber(marketActivity.reduce((sum, market) => sum + market.completed, 0))}</b><small>marked completed</small></span>
          <span><b>{formatNumber(marketActivity.reduce((sum, market) => sum + market.canceled + market.refunded, 0))}</b><small>cancelled or refunded</small></span>
        </div>
      </Panel>

      <Panel
        title={selectedMarket ? `Order activity · ${selectedMarket}` : 'Order activity'}
        detail={selectedMarketStats
          ? `${formatNumber(selectedMarketStats.orders)} records · ${formatNumber(selectedMarketStats.completed)} completed · ${formatNumber(selectedMarketStats.canceled)} cancelled · ${formatNumber(selectedMarketStats.refunded)} refunded`
          : 'Recent transaction rows from the supplied dataset. Status labels are source order statuses, not shipment progress.'}
        action={selectedMarket ? <button className="button button-outline button-small" onClick={() => setSelectedMarket('')}>Clear market filter</button> : undefined}
      >
        {marketTransactions.length ? <div className="tracking-order-list">{marketTransactions.map((transaction, index) => {
          const product = productsById.get(transaction.productId)
          return <button
            type="button"
            className="tracking-order-card"
            key={`${transaction.productId}-${transaction.date}-${transaction.country}-${index}`}
            onClick={() => {
              setQuery(transaction.productId)
              setCurrentPage(0)
              onNavigate('Transactions')
            }}
          >
            <span className={`tracking-order-dot ${transaction.status}`} />
            <span className="tracking-order-product"><strong>{product?.name ?? transaction.productId}</strong><small>{formatDate(transaction.date)} · {transaction.channel.replace(/_/g, ' ')}</small></span>
            <span className="tracking-order-location"><small>MARKET</small><strong>{transaction.country}</strong></span>
            <ArrowRight className="tracking-order-arrow" size={18} />
            <span className="tracking-order-location"><small>PRODUCT CATEGORY</small><strong>{transaction.category}</strong></span>
            <span className={`operations-pill ${transaction.status === 'completed' ? 'green' : transaction.status === 'refunded' ? 'amber' : 'red'}`}>{transaction.status}</span>
            <span className="tracking-order-revenue">{money(transaction.revenue)}</span>
          </button>
        })}</div> : <Empty message="No transaction records match the selected market." />}
        <p className="tracking-source-note">These are source transactions, not shipment events. The dataset has no routes, tracking IDs, carrier names, estimated arrivals, or GPS positions.</p>
      </Panel>

      <details className="tracking-provider-details">
        <summary><Truck size={16} />Track a real parcel with AfterShip<span>{integrationStatus?.aftership ? 'AFTERSHIP CONNECTED' : 'OPTIONAL PROVIDER'}</span></summary>
        <div className="tracking-provider-content">
          <p>Carrier events are separate from the archive and require a real tracking number, `API_WRITE_TOKEN`, and server-side `AFTERSHIP_API_KEY`.</p>
          <div className="operations-credential"><label>API write token<input type="password" autoComplete="off" value={apiToken} onChange={event => setApiToken(event.target.value)} placeholder="Enter the server API_WRITE_TOKEN" /></label><small>This token stays in this page's memory.</small></div>
          {integrationStatus && !integrationStatus.writes && <p className="operations-action-error" role="status">Tracking requests are disabled until the server has a valid API_WRITE_TOKEN configured.</p>}
          {integrationStatus && !integrationStatus.aftership && <p className="operations-action-error" role="status">AFTERSHIP_API_KEY is not configured on the server.</p>}
          <form className="operations-form operations-track-form" onSubmit={event => void addTracking(event)}>
            <label>Tracking number<input required minLength={4} maxLength={100} pattern="[A-Za-z0-9._/-]+" value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} placeholder="Enter a real tracking number" /></label>
            <label>Carrier slug (optional)<input maxLength={81} pattern="[A-Za-z0-9][A-Za-z0-9-]*" value={trackingCarrier} onChange={event => setTrackingCarrier(event.target.value)} placeholder="e.g. fedex" /></label>
            <button className="button button-dark" type="submit" disabled={trackingBusy}>{trackingBusy ? 'Looking up…' : <><Truck size={15} />Track real parcel</>}</button>
          </form>
          {trackingError && <p className="operations-action-error" role="alert">{trackingError}</p>}
          {integrationError && <p className="operations-action-error" role="alert">{integrationError}</p>}
          {trackingRecords.map(record => <article className="operations-tracking-card" key={record.id}>
            <header><div><strong>{record.trackingNumber}</strong><small>{record.carrier || 'Carrier detection'} · {record.statusDetail || record.status || 'Status pending'}</small></div><button className="button button-outline button-small" onClick={() => void refreshTracking(record.id)}><RefreshCw size={13} />Refresh</button></header>
            {record.estimatedDelivery && <p>Estimated delivery: {formatDate(record.estimatedDelivery)}</p>}
            {record.checkpoints?.length ? <ul>{record.checkpoints.map((checkpoint, index) => <li key={`${checkpoint.time}-${index}`}><i /><span><strong>{checkpoint.message || checkpoint.status || 'Carrier update'}</strong><small>{checkpoint.location || 'Location not supplied'} · {checkpoint.time ? new Date(checkpoint.time).toLocaleString() : 'Time not supplied'}</small>{checkpoint.coordinates && <small>Carrier coordinate: {checkpoint.coordinates.latitude}, {checkpoint.coordinates.longitude}</small>}</span></li>)}</ul> : <div className="operations-empty"><strong>No checkpoints returned yet</strong><span>Use Refresh to request the latest carrier events.</span></div>}
          </article>)}
        </div>
      </details>
    </div>
  }

  let content: ReactNode
  switch (page) {
    case 'Overview': content = renderOverview(); break
    case 'Transactions': content = renderTransactions(); break
    case 'Products': content = renderProducts(); break
    case 'Inventory': content = renderInventory(); break
    case 'Shipments': content = renderShipments(); break
    case 'Supplier Network': content = renderSuppliers(); break
    case 'Returns': content = renderReturns(); break
    case 'Pricing': content = renderPricing(); break
    case 'Marketing': content = renderMarketing(); break
    case 'Customer Insights': content = renderCustomers(); break
    case 'Risk & Alerts': content = renderAlerts(); break
    case 'What-if Simulator': content = renderSimulator(); break
    case 'Reports': content = renderReports(); break
    case 'AI Assistant': content = renderAi(); break
    case 'Live Tracking': content = renderTracking(); break
    case 'Dataset & Sources': content = renderSourceInfo(); break
  }

  return <div className="operations-hub">
    {page === 'Overview' && <div className={`operations-currency-notice ${exchangeRateError ? 'fallback' : ''}`} role="status">
      <div><strong>Currency conversion</strong><span>USD → INR at ₹{usdInrRate.toFixed(2)} per USD</span></div>
      <small>{exchangeRateLoading ? 'Fetching latest published rate…' : exchangeRateDate ? `Latest published Frankfurter rate · ${exchangeRateDate}` : 'Using your ₹94.86 fallback rate'}</small>
      {exchangeRateError && <span className="operations-currency-error">Live rate unavailable: {exchangeRateError}</span>}
      <button className="button button-outline button-small" disabled={exchangeRateLoading} onClick={() => setRateRefresh(value => value + 1)}><RefreshCw size={13} /> Refresh rate</button>
    </div>}
    {content}
    {reorderInventory && <div className="operations-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setReorderProductId('') }} onKeyDown={event => { if (event.key === 'Escape') setReorderProductId('') }}>
      <section className="operations-reorder-modal" role="dialog" aria-modal="true" aria-labelledby="reorder-dialog-title">
        <header className="operations-reorder-header"><div><span className="operations-reorder-eyebrow">INVENTORY · REORDER DRAFT</span><h2 id="reorder-dialog-title">{reorderProduct?.name ?? reorderInventory.productId}</h2><p>{reorderInventory.productId} · {reorderInventory.warehouse} · {formatNumber(reorderInventory.stock)} on hand, reorder point {formatNumber(reorderInventory.reorderPoint)}</p></div><button className="operations-icon-button" type="button" aria-label="Close reorder draft" onClick={() => setReorderProductId('')}><X size={15} /></button></header>
        {reorderSuppliers.length ? <>
          <div className="operations-reorder-fields">
            <label>Supplier<select value={reorderSupplierKey} onChange={event => {
              const nextKey = event.target.value
              const nextSupplier = reorderSuppliers.find(row => `${row.name}|${row.rank}` === nextKey)
              setReorderSupplierKey(nextKey)
              if (nextSupplier) setReorderQuantity(current => Math.max(current, nextSupplier.minOrderQty))
            }}>{reorderSuppliers.map(supplier => <option key={`${supplier.name}|${supplier.rank}`} value={`${supplier.name}|${supplier.rank}`}>{supplier.name}{supplier.primary ? ' · Primary' : ''}</option>)}</select></label>
            <label>Draft quantity (units)<input type="number" min={reorderSupplier?.minOrderQty ?? 1} step="1" value={reorderQuantity} onChange={event => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) setReorderQuantity(Math.max(reorderSupplier?.minOrderQty ?? 1, Math.floor(parsed)))
            }} /></label>
          </div>
          {reorderSupplier && <div className="operations-reorder-summary">
            <div><span>Minimum order</span><strong>{formatNumber(reorderSupplier.minOrderQty)} units</strong></div>
            <div><span>Recorded unit cost</span><strong>{money(reorderSupplier.unitCost)}</strong></div>
            <div><span>Estimated item subtotal</span><strong>{money(reorderSupplier.unitCost * reorderQuantity)}</strong></div>
            <div><span>Supplier lead time</span><strong>{formatNumber(reorderSupplier.leadTimeDays)} days</strong></div>
          </div>}
          <p className="operations-reorder-disclaimer">This only prepares a local draft from the supplied supplier-cost records. Exporting it does not place an order or change inventory; the data has no purchasing integration.</p>
          <div className="operations-reorder-actions"><button className="button button-outline" type="button" onClick={() => setReorderProductId('')}>Cancel</button><button className="button button-dark" type="button" disabled={!reorderSupplier || reorderQuantity < reorderSupplier.minOrderQty} onClick={() => {
            if (!reorderSupplier) return
            downloadCsv(`supplyshield-reorder-draft-${reorderInventory.productId.toLowerCase()}.csv`, [
              ['Status', 'Product ID', 'Product', 'Category', 'Warehouse', 'Supplier', 'Quantity', 'Minimum order quantity', 'Unit cost INR', 'Estimated item subtotal INR', 'Supplier lead days', 'Reliability'],
              ['Draft only - not submitted', reorderInventory.productId, reorderProduct?.name ?? reorderInventory.productId, reorderInventory.category, reorderInventory.warehouse, reorderSupplier.name, reorderQuantity, reorderSupplier.minOrderQty, toInr(reorderSupplier.unitCost, usdInrRate), toInr(reorderSupplier.unitCost * reorderQuantity, usdInrRate), reorderSupplier.leadTimeDays, reorderSupplier.reliability],
            ])
            setReorderProductId('')
          }}><Download size={14} />Export reorder draft</button></div>
        </> : <>
          <div className="operations-warning"><CircleAlert size={18} /><span>No supplier-cost record is available for this product, so a supplier-linked reorder draft cannot be prepared.</span></div>
          <div className="operations-reorder-actions"><button className="button button-outline" type="button" onClick={() => setReorderProductId('')}>Close</button></div>
        </>}
      </section>
    </div>}
    {globalSearchOpen && <div className="operations-search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCloseGlobalSearch() }}>
      <section className="operations-global-search" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
        <div className="operations-global-search-header"><div><h2 id="global-search-title">Search all data</h2><p>Search transactions, products, stock, suppliers, returns, pricing, marketing, and customer segments.</p></div><button className="operations-icon-button" aria-label="Close global search" onClick={onCloseGlobalSearch}><X size={15} /></button></div>
        <label className="operations-global-search-input"><Search size={17} /><input id="global-workspace-search" value={globalSearchQuery} onChange={event => setGlobalSearchQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onCloseGlobalSearch() }} placeholder="Search any record, category, location, channel…" autoComplete="off" /><kbd>ESC</kbd></label>
        <div className="operations-global-search-pages"><strong>Go to any page</strong><div>{allCommercePages.map(target => <button key={target} onClick={() => openQuickPage(target)}>{target}</button>)}</div></div>
        {globalSearchQuery.trim().length >= 2 && <div className="operations-global-search-results">
          <strong>Matching records</strong>
          {globalSearchResults.length ? globalSearchResults.map((result, index) => <button key={`${result.page}-${result.label}-${index}`} onClick={() => openSearchResult(result)}><span><b>{result.label}</b><small>{result.detail}</small></span><i>{result.page} <ArrowUpRight size={13} /></i></button>) : <p>No matching records. Try another term.</p>}
          {globalSearchResults.length >= 5 && <small className="operations-search-limit">Showing up to five matches per section.</small>}
        </div>}
      </section>
    </div>}
  </div>
}
