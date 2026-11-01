type CustomerGroup = { name: string; customers: number }
type RawCustomerSummary = {
  total: number
  premium: number
  verified: number
  countries: CustomerGroup[]
  currencies: CustomerGroup[]
  ageBands: CustomerGroup[]
  genders: CustomerGroup[]
}

export type Transaction = {
  productId: string
  date: string
  quantity: number
  unitPrice: number
  discount: number
  revenue: number
  cost: number
  profit: number
  shippingCost: number
  channel: string
  paymentMethod: string
  status: string
  country: string
  category: string
}

export type InventoryRecord = {
  productId: string
  category: string
  stock: number
  reorderPoint: number
  warehouse: string
  lastRestockDate: string
  supplierLeadDays: number
}

export type Product = {
  productId: string
  name: string
  category: string
  brand: string
  unitPrice: number
  unitCost: number
  weightKg: number
  active: boolean
  launchDate: string
}

export type ReturnRecord = {
  productId: string
  returnDate: string
  reason: string
  refundAmount: number
  restocked: boolean
}

export type SupplierCost = {
  productId: string
  category: string
  name: string
  rank: number
  unitCost: number
  orderingCost: number
  annualHoldingCost: number
  holdingCostPct: number
  leadTimeDays: number
  minOrderQty: number
  reliability: number
  primary: boolean
}

export type PriceRecord = {
  productId: string
  category: string
  month: string
  listedPrice: number
  basePrice: number
  competitorPrice: number
  priceIndex: number
  promotional: boolean
  priceElasticity: number
  unitsSold: number
  revenue: number
  marginPct: number
}

export type MarketingRecord = {
  month: string
  channel: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  orders: number
  customers: number
  revenue: number
  roas: number
  cac: number
  costPerOrder: number
  monthMultiplier: number
}

export type CommerceDataset = {
  dataset: string
  sourceFile: string
  transactions: Transaction[]
  inventory: InventoryRecord[]
  products: Product[]
  returns: ReturnRecord[]
  suppliers: SupplierCost[]
  pricing: PriceRecord[]
  marketing: MarketingRecord[]
  customers: RawCustomerSummary
}

const tableColumns = {
  transactions: ['product_id', 'date', 'quantity', 'unit_price_usd', 'discount_pct', 'revenue_usd', 'cost_usd', 'profit_usd', 'shipping_cost_usd', 'channel', 'payment_method', 'status', 'country', 'category'],
  inventory: ['product_id', 'category', 'stock_units', 'reorder_point', 'warehouse_location', 'last_restock_date', 'supplier_lead_days'],
  products: ['product_id', 'name', 'category', 'brand', 'unit_price_usd', 'unit_cost_usd', 'weight_kg', 'is_active', 'launch_date'],
  returns: ['product_id', 'return_date', 'reason', 'refund_amount_usd', 'restocked'],
  suppliers: ['product_id', 'category', 'supplier_name', 'supplier_rank', 'unit_cost_usd', 'ordering_cost_usd', 'annual_holding_cost_usd', 'holding_cost_pct', 'lead_time_days', 'min_order_qty', 'reliability_score', 'is_primary'],
  pricing: ['product_id', 'category', 'year_month', 'listed_price_usd', 'base_price_usd', 'competitor_price_usd', 'price_index', 'is_promotional', 'price_elasticity', 'units_sold', 'revenue_usd', 'margin_pct'],
  marketing: ['year_month', 'channel', 'spend_usd', 'impressions', 'clicks', 'ctr', 'actual_orders', 'actual_customers', 'actual_revenue_usd', 'roas', 'cac_usd', 'cost_per_order_usd', 'month_multiplier'],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseTable(value: unknown, expectedColumns: readonly string[], name: string): string[][] {
  if (!isRecord(value)) throw new Error(`The ${name} table is invalid or incomplete.`)
  const columns = value.columns
  const rawRows = value.rows
  if (!Array.isArray(columns)
    || columns.length !== expectedColumns.length
    || !expectedColumns.every((column, index) => columns[index] === column)
    || !Number.isInteger(value.rowCount)
    || !Array.isArray(rawRows)
    || value.rowCount !== rawRows.length
  ) throw new Error(`The ${name} table is invalid or incomplete.`)

  const rows = rawRows as unknown[]
  if (rows.some(row => !Array.isArray(row)
    || row.length !== expectedColumns.length
    || row.some(cell => typeof cell !== 'string')
  )) throw new Error(`The ${name} table contains an invalid row.`)
  return rows as string[][]
}

function numberAt(row: string[], index: number, table: string) {
  const value = Number(row[index])
  if (!Number.isFinite(value)) throw new Error(`The ${table} table contains a non-numeric value.`)
  return value
}

function booleanAt(row: string[], index: number, table: string) {
  if (row[index] === 'True') return true
  if (row[index] === 'False') return false
  throw new Error(`The ${table} table contains an invalid boolean value.`)
}

function requireCustomerSummary(value: unknown): RawCustomerSummary {
  if (!isRecord(value)
    || !Number.isInteger(value.total)
    || !Number.isInteger(value.premium)
    || !Number.isInteger(value.verified)
  ) throw new Error('The customer aggregate is invalid.')

  const groupKeys = ['countries', 'currencies', 'ageBands', 'genders'] as const
  for (const key of groupKeys) {
    const groups = value[key]
    if (!Array.isArray(groups) || groups.some(group =>
      !isRecord(group)
      || typeof group.name !== 'string'
      || !Number.isInteger(group.customers)
    )) throw new Error(`The customer ${key} aggregate is invalid.`)
  }
  return value as unknown as RawCustomerSummary
}

export function parseCommerceDataset(value: unknown): CommerceDataset {
  if (!isRecord(value) || value.version !== 1 || value.dataset !== 'Commerce Archive' || value.sourceFile !== 'archive.zip' || !isRecord(value.tables)) {
    throw new Error('The commerce dataset file is invalid or incomplete.')
  }

  const transactions = parseTable(value.tables.transactions, tableColumns.transactions, 'transactions')
  const inventory = parseTable(value.tables.inventory, tableColumns.inventory, 'inventory')
  const products = parseTable(value.tables.products, tableColumns.products, 'products')
  const returns = parseTable(value.tables.returns, tableColumns.returns, 'returns')
  const suppliers = parseTable(value.tables.suppliers, tableColumns.suppliers, 'suppliers')
  const pricing = parseTable(value.tables.pricing, tableColumns.pricing, 'pricing')
  const marketing = parseTable(value.tables.marketing, tableColumns.marketing, 'marketing')

  return {
    dataset: value.dataset,
    sourceFile: value.sourceFile,
    transactions: transactions.map(row => ({
      productId: row[0],
      date: row[1],
      quantity: numberAt(row, 2, 'transactions'),
      unitPrice: numberAt(row, 3, 'transactions'),
      discount: numberAt(row, 4, 'transactions'),
      revenue: numberAt(row, 5, 'transactions'),
      cost: numberAt(row, 6, 'transactions'),
      profit: numberAt(row, 7, 'transactions'),
      shippingCost: numberAt(row, 8, 'transactions'),
      channel: row[9],
      paymentMethod: row[10],
      status: row[11],
      country: row[12],
      category: row[13],
    })),
    inventory: inventory.map(row => ({
      productId: row[0],
      category: row[1],
      stock: numberAt(row, 2, 'inventory'),
      reorderPoint: numberAt(row, 3, 'inventory'),
      warehouse: row[4],
      lastRestockDate: row[5],
      supplierLeadDays: numberAt(row, 6, 'inventory'),
    })),
    products: products.map(row => ({
      productId: row[0],
      name: row[1],
      category: row[2],
      brand: row[3],
      unitPrice: numberAt(row, 4, 'products'),
      unitCost: numberAt(row, 5, 'products'),
      weightKg: numberAt(row, 6, 'products'),
      active: booleanAt(row, 7, 'products'),
      launchDate: row[8],
    })),
    returns: returns.map(row => ({
      productId: row[0],
      returnDate: row[1],
      reason: row[2],
      refundAmount: numberAt(row, 3, 'returns'),
      restocked: booleanAt(row, 4, 'returns'),
    })),
    suppliers: suppliers.map(row => ({
      productId: row[0],
      category: row[1],
      name: row[2],
      rank: numberAt(row, 3, 'suppliers'),
      unitCost: numberAt(row, 4, 'suppliers'),
      orderingCost: numberAt(row, 5, 'suppliers'),
      annualHoldingCost: numberAt(row, 6, 'suppliers'),
      holdingCostPct: numberAt(row, 7, 'suppliers'),
      leadTimeDays: numberAt(row, 8, 'suppliers'),
      minOrderQty: numberAt(row, 9, 'suppliers'),
      reliability: numberAt(row, 10, 'suppliers'),
      primary: booleanAt(row, 11, 'suppliers'),
    })),
    pricing: pricing.map(row => ({
      productId: row[0],
      category: row[1],
      month: row[2],
      listedPrice: numberAt(row, 3, 'pricing'),
      basePrice: numberAt(row, 4, 'pricing'),
      competitorPrice: numberAt(row, 5, 'pricing'),
      priceIndex: numberAt(row, 6, 'pricing'),
      promotional: booleanAt(row, 7, 'pricing'),
      priceElasticity: numberAt(row, 8, 'pricing'),
      unitsSold: numberAt(row, 9, 'pricing'),
      revenue: numberAt(row, 10, 'pricing'),
      marginPct: numberAt(row, 11, 'pricing'),
    })),
    marketing: marketing.map(row => ({
      month: row[0],
      channel: row[1],
      spend: numberAt(row, 2, 'marketing'),
      impressions: numberAt(row, 3, 'marketing'),
      clicks: numberAt(row, 4, 'marketing'),
      ctr: numberAt(row, 5, 'marketing'),
      orders: numberAt(row, 6, 'marketing'),
      customers: numberAt(row, 7, 'marketing'),
      revenue: numberAt(row, 8, 'marketing'),
      roas: numberAt(row, 9, 'marketing'),
      cac: numberAt(row, 10, 'marketing'),
      costPerOrder: numberAt(row, 11, 'marketing'),
      monthMultiplier: numberAt(row, 12, 'marketing'),
    })),
    customers: requireCustomerSummary(value.customerSummary),
  }
}
