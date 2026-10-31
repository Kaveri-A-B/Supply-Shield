import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const rawDirectory = path.join(root, 'ml', 'data', 'raw')
const outputPath = path.join(root, 'client', 'public', 'olist_orders.json')

function parseCsv(fileName) {
  const contents = readFileSync(path.join(rawDirectory, fileName), 'utf8')
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index]
    if (quoted) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }

  const headers = rows.shift()
  if (!headers?.length) throw new Error(`CSV has no header: ${fileName}`)
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

const customers = new Map(parseCsv('olist_customers_dataset.csv').map(row => [row.customer_id, row.customer_state]))
const sellers = new Map(parseCsv('olist_sellers_dataset.csv').map(row => [row.seller_id, row.seller_state]))
const itemsByOrder = new Map()
for (const item of parseCsv('olist_order_items_dataset.csv')) {
  const regions = itemsByOrder.get(item.order_id) ?? new Set()
  regions.add(sellers.get(item.seller_id))
  itemsByOrder.set(item.order_id, regions)
}

const regionByState = {
  AC: 'North', AL: 'Northeast', AM: 'North', AP: 'North', BA: 'Northeast', CE: 'Northeast',
  DF: 'Central-West', ES: 'Southeast', GO: 'Central-West', MA: 'Northeast', MG: 'Southeast',
  MS: 'Central-West', MT: 'Central-West', PA: 'North', PB: 'Northeast', PE: 'Northeast',
  PI: 'Northeast', PR: 'South', RJ: 'Southeast', RN: 'Northeast', RO: 'North',
  RR: 'North', RS: 'South', SC: 'South', SE: 'Northeast', SP: 'Southeast', TO: 'North',
}
const regionCodes = { North: 'N', Northeast: 'NE', 'Central-West': 'CW', Southeast: 'SE', South: 'S' }

function regionForState(state) {
  return regionByState[state] ?? null
}

function parseTimestamp(value) {
  const timestamp = Date.parse(`${value.replace(' ', 'T')}Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

const eligibleOrders = parseCsv('olist_orders_dataset.csv')
  .filter(order => order.order_status === 'delivered'
    && order.order_id
    && order.order_delivered_customer_date
    && order.order_estimated_delivery_date
    && parseTimestamp(order.order_delivered_customer_date) !== null
    && parseTimestamp(order.order_estimated_delivery_date) !== null)
  .sort((left, right) => left.order_purchase_timestamp.localeCompare(right.order_purchase_timestamp))

const orders = eligibleOrders.map(order => {
  const purchaseTime = parseTimestamp(order.order_purchase_timestamp)
  const estimatedTime = parseTimestamp(order.order_estimated_delivery_date)
  const deliveredTime = parseTimestamp(order.order_delivered_customer_date)
  if (purchaseTime === null || estimatedTime === null || deliveredTime === null) throw new Error('Invalid timestamp in an eligible delivered Olist order.')
  const sellerRegions = [...(itemsByOrder.get(order.order_id) ?? [])]
    .map(regionForState)
    .filter((region, regionIndex, regions) => region !== null && regions.indexOf(region) === regionIndex)
  const sellerRegion = sellerRegions.length === 1 ? sellerRegions[0] : sellerRegions.length ? 'Multiple regions' : 'Not available'
  const customerRegion = regionForState(customers.get(order.customer_id))

  return [
    order.order_purchase_timestamp.slice(0, 10),
    order.order_estimated_delivery_date.slice(0, 10),
    order.order_delivered_customer_date.slice(0, 10),
    deliveredTime > estimatedTime ? 1 : 0,
    deliveredTime > estimatedTime ? Math.ceil((deliveredTime - estimatedTime) / 86_400_000) : 0,
    regionCodes[sellerRegion] ?? 'M',
    regionCodes[customerRegion] ?? '-',
  ]
})

const lateCount = orders.filter(order => order[3] === 1).length
if (orders.length !== 96_470 || lateCount !== 7_826) {
  throw new Error(`Olist validation failed: expected 96,470 eligible orders and 7,826 late deliveries; found ${orders.length} and ${lateCount}.`)
}

const output = JSON.stringify({ version: 1, orders })
writeFileSync(outputPath, `${output}\n`)
console.log(`Wrote ${orders.length.toLocaleString()} anonymized Olist orders (${lateCount.toLocaleString()} late) to ${path.relative(root, outputPath)} (${(Buffer.byteLength(output) / 1_000_000).toFixed(2)} MB).`)
