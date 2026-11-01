import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourcePath = process.argv[2]
if (!sourcePath) throw new Error('Pass the source CSV path as the first argument.')

const outputPath = path.join(root, 'client', 'public', 'global_supply_chain_risk_2026.json')
const requiredColumns = [
  'Shipment_ID',
  'Date',
  'Origin_Port',
  'Destination_Port',
  'Transport_Mode',
  'Product_Category',
  'Distance_km',
  'Weight_MT',
  'Fuel_Price_Index',
  'Geopolitical_Risk_Score',
  'Weather_Condition',
  'Carrier_Reliability_Score',
  'Lead_Time_Days',
  'Disruption_Occurred',
]

function parseCsv(contents) {
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

  if (quoted) throw new Error('The source CSV contains an unterminated quoted field.')
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }

  const headers = rows.shift()
  if (!headers?.length || requiredColumns.some(column => !headers.includes(column))) {
    throw new Error('The source CSV is missing one or more required supply-chain columns.')
  }

  return rows.filter(values => values.some(value => value.trim() !== '')).map(values => {
    if (values.length !== headers.length) throw new Error('A CSV row has a different number of values than the header.')
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
  })
}

function numberField(row, field, minimum, maximum = Number.POSITIVE_INFINITY) {
  const value = Number(row[field])
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${field} value in shipment ${row.Shipment_ID}.`)
  }
  return value
}

const rows = parseCsv(readFileSync(sourcePath, 'utf8'))
if (rows.length === 0) throw new Error('The source CSV contains no shipment rows.')

const shipmentIds = new Set()
const shipments = rows.map(row => {
  const date = row.Date
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`Invalid date in shipment ${row.Shipment_ID}.`)
  }
  if (!row.Shipment_ID || shipmentIds.has(row.Shipment_ID)) {
    throw new Error(`Shipment IDs must be present and unique: ${row.Shipment_ID || '(blank)'}.`)
  }
  shipmentIds.add(row.Shipment_ID)
  if (!row.Origin_Port || !row.Destination_Port || !row.Transport_Mode || !row.Product_Category || !row.Weather_Condition) {
    throw new Error(`Missing categorical shipment data in ${row.Shipment_ID}.`)
  }
  if (row.Disruption_Occurred !== '0' && row.Disruption_Occurred !== '1') {
    throw new Error(`Invalid Disruption_Occurred value in shipment ${row.Shipment_ID}.`)
  }

  return {
    shipmentId: row.Shipment_ID,
    date,
    originPort: row.Origin_Port,
    destinationPort: row.Destination_Port,
    transportMode: row.Transport_Mode,
    productCategory: row.Product_Category,
    distanceKm: numberField(row, 'Distance_km', 0),
    weightMt: numberField(row, 'Weight_MT', 0),
    fuelPriceIndex: numberField(row, 'Fuel_Price_Index', 0),
    geopoliticalRiskScore: numberField(row, 'Geopolitical_Risk_Score', 0, 10),
    weatherCondition: row.Weather_Condition,
    carrierReliabilityScore: numberField(row, 'Carrier_Reliability_Score', 0, 1),
    leadTimeDays: numberField(row, 'Lead_Time_Days', 0),
    disruptionOccurred: row.Disruption_Occurred === '1',
  }
})

const dates = shipments.map(shipment => shipment.date).sort()
const disrupted = shipments.filter(shipment => shipment.disruptionOccurred)
const summary = {
  recordCount: shipments.length,
  disruptionCount: disrupted.length,
  disruptionRate: disrupted.length / shipments.length,
  averageLeadTimeDays: shipments.reduce((sum, shipment) => sum + shipment.leadTimeDays, 0) / shipments.length,
  averageCarrierReliability: shipments.reduce((sum, shipment) => sum + shipment.carrierReliabilityScore, 0) / shipments.length,
  dateFrom: dates[0],
  dateTo: dates[dates.length - 1],
}
const output = JSON.stringify({ version: 1, dataset: 'Global Supply Chain Risk 2026', sourceFile: path.basename(sourcePath), summary, shipments })
writeFileSync(outputPath, `${output}\n`)
console.log(`Wrote ${shipments.length.toLocaleString()} validated shipments to ${path.relative(root, outputPath)} (${(Buffer.byteLength(output) / 1_000_000).toFixed(2)} MB).`)
