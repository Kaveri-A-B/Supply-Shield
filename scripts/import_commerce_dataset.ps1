param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\client\public\commerce_dataset.json')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName Microsoft.VisualBasic

$tableDefinitions = [ordered]@{
  transactions = @{
    file = 'transactions.csv'
    columns = @('product_id', 'date', 'quantity', 'unit_price_usd', 'discount_pct', 'revenue_usd', 'cost_usd', 'profit_usd', 'shipping_cost_usd', 'channel', 'payment_method', 'status', 'country', 'category')
  }
  inventory = @{
    file = 'inventory.csv'
    columns = @('product_id', 'category', 'stock_units', 'reorder_point', 'warehouse_location', 'last_restock_date', 'supplier_lead_days')
  }
  marketing = @{
    file = 'marketing_spend.csv'
    columns = @('year_month', 'channel', 'spend_usd', 'impressions', 'clicks', 'ctr', 'actual_orders', 'actual_customers', 'actual_revenue_usd', 'roas', 'cac_usd', 'cost_per_order_usd', 'month_multiplier')
  }
  pricing = @{
    file = 'price_history.csv'
    columns = @('product_id', 'category', 'year_month', 'listed_price_usd', 'base_price_usd', 'competitor_price_usd', 'price_index', 'is_promotional', 'price_elasticity', 'units_sold', 'revenue_usd', 'margin_pct')
  }
  products = @{
    file = 'products.csv'
    columns = @('product_id', 'name', 'category', 'brand', 'unit_price_usd', 'unit_cost_usd', 'weight_kg', 'is_active', 'launch_date')
  }
  returns = @{
    file = 'returns.csv'
    columns = @('product_id', 'return_date', 'reason', 'refund_amount_usd', 'restocked')
  }
  suppliers = @{
    file = 'supplier_costs.csv'
    columns = @('product_id', 'category', 'supplier_name', 'supplier_rank', 'unit_cost_usd', 'ordering_cost_usd', 'annual_holding_cost_usd', 'holding_cost_pct', 'lead_time_days', 'min_order_qty', 'reliability_score', 'is_primary')
  }
}

function Write-CsvRows {
  param(
    [System.IO.StreamWriter]$Writer,
    [string]$EntryName,
    [string[]]$ExpectedColumns
  )

  $entry = $archive.GetEntry($EntryName)
  if ($null -eq $entry) { throw "Required dataset file '$EntryName' is missing from the archive." }
  $stream = $entry.Open()
  $reader = [System.IO.StreamReader]::new($stream)
  $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($reader)
  $parser.TextFieldType = 'Delimited'
  $parser.SetDelimiters(',')
  $parser.HasFieldsEnclosedInQuotes = $true
  try {
    $actualColumns = $parser.ReadFields()
    $outputColumns = $ExpectedColumns
    $unexpectedColumns = @($actualColumns | Where-Object {
      $_ -notin $ExpectedColumns -and $_ -notin @('transaction_id', 'customer_id', 'return_id')
    })
    $missingColumns = @($ExpectedColumns | Where-Object { $_ -notin $actualColumns })
    if ($unexpectedColumns.Count -gt 0 -or $missingColumns.Count -gt 0) {
      throw "Unexpected or missing columns in '$EntryName'."
    }

    if ($EntryName -eq 'returns.csv') {
      $requiredColumns = @('product_id', 'return_date', 'reason', 'refund_amount_usd', 'restocked')
      if (@($requiredColumns | Where-Object { $_ -notin $actualColumns }).Count -gt 0) { throw "Required columns are missing from '$EntryName'." }
    }

    return ,@{ Parser = $parser; Reader = $reader; Stream = $stream; OutputColumns = $outputColumns; ActualColumns = $actualColumns }
  } catch {
    $parser.Close()
    $reader.Close()
    $stream.Close()
    throw
  }
}

function Write-Table {
  param(
    [System.IO.StreamWriter]$Writer,
    [string]$Name,
    [hashtable]$Definition
  )

  $source = Write-CsvRows -Writer $Writer -EntryName $Definition.file -ExpectedColumns $Definition.columns
  try {
    $Writer.Write('"' + $Name + '":{"columns":')
    $Writer.Write((ConvertTo-Json -InputObject $source.OutputColumns -Compress))
    $Writer.Write(',"rowCount":')
    $Writer.Write('0,"rows":[')
    $rowCount = 0
    $positions = @{}
    for ($index = 0; $index -lt $source.ActualColumns.Length; $index++) { $positions[$source.ActualColumns[$index]] = $index }
    while (-not $source.Parser.EndOfData) {
      $values = $source.Parser.ReadFields()
      if ($values.Length -ne $source.ActualColumns.Length) { throw "A row in '$($Definition.file)' has an unexpected number of columns." }
      $selected = [string[]]@($source.OutputColumns | ForEach-Object { $values[$positions[$_]] })
      if ($rowCount -gt 0) { $Writer.Write(',') }
      $Writer.Write((ConvertTo-Json -InputObject $selected -Compress))
      $rowCount++
    }
    $Writer.Write('],"rowCount":')
    $Writer.Write($rowCount)
    $Writer.Write('}')
    return $rowCount
  } finally {
    $source.Parser.Close()
    $source.Reader.Close()
    $source.Stream.Close()
  }
}

function Get-CustomerSummary {
  $entry = $archive.GetEntry('customers.csv')
  if ($null -eq $entry) { throw "Required dataset file 'customers.csv' is missing from the archive." }
  $stream = $entry.Open()
  $reader = [System.IO.StreamReader]::new($stream)
  $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($reader)
  $parser.TextFieldType = 'Delimited'
  $parser.SetDelimiters(',')
  $parser.HasFieldsEnclosedInQuotes = $true
  $groupCounts = @{
    countries = @{}
    currencies = @{}
    ageBands = @{}
    genders = @{}
  }
  $total = 0
  $premium = 0
  $verified = 0
  try {
    $columns = $parser.ReadFields()
    $positions = @{}
    for ($index = 0; $index -lt $columns.Length; $index++) { $positions[$columns[$index]] = $index }
    foreach ($required in @('country', 'currency', 'age', 'gender', 'is_premium', 'email_verified')) {
      if (-not $positions.ContainsKey($required)) { throw "Required customer summary column '$required' is missing." }
    }
    while (-not $parser.EndOfData) {
      $values = $parser.ReadFields()
      if ($values.Length -ne $columns.Length) { throw 'A customer row has an unexpected number of columns.' }
      $age = [int]$values[$positions.age]
      $band = if ($age -lt 25) { 'Under 25' } elseif ($age -lt 35) { '25-34' } elseif ($age -lt 45) { '35-44' } elseif ($age -lt 55) { '45-54' } else { '55+' }
      foreach ($group in @(
        @{ Name = 'countries'; Key = $values[$positions.country] },
        @{ Name = 'currencies'; Key = $values[$positions.currency] },
        @{ Name = 'ageBands'; Key = $band },
        @{ Name = 'genders'; Key = $values[$positions.gender] }
      )) {
        if (-not $groupCounts[$group.Name].ContainsKey($group.Key)) { $groupCounts[$group.Name][$group.Key] = 0 }
        $groupCounts[$group.Name][$group.Key]++
      }
      if ($values[$positions.is_premium] -eq 'True') { $premium++ }
      if ($values[$positions.email_verified] -eq 'True') { $verified++ }
      $total++
    }
  } finally {
    $parser.Close()
    $reader.Close()
    $stream.Close()
  }

  $summary = [ordered]@{ total = $total; premium = $premium; verified = $verified }
  foreach ($groupName in @('countries', 'currencies', 'ageBands', 'genders')) {
    $summary[$groupName] = @($groupCounts[$groupName].GetEnumerator() | Sort-Object Name | ForEach-Object {
      [ordered]@{ name = $_.Name; customers = $_.Value }
    })
  }
  return $summary
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) { throw "Archive not found: $ArchivePath" }
$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$archive = [System.IO.Compression.ZipFile]::OpenRead([System.IO.Path]::GetFullPath($ArchivePath))
$writer = [System.IO.StreamWriter]::new($outputFullPath, $false, [System.Text.UTF8Encoding]::new($false))
try {
  $writer.Write('{"version":1,"dataset":"Commerce Archive","sourceFile":"archive.zip","tables":{')
  $firstTable = $true
  foreach ($tableName in $tableDefinitions.Keys) {
    if (-not $firstTable) { $writer.Write(',') }
    $firstTable = $false
    [void](Write-Table -Writer $writer -Name $tableName -Definition $tableDefinitions[$tableName])
  }
  $customerSummary = Get-CustomerSummary
  $writer.Write('},"customerSummary":')
  $writer.Write((ConvertTo-Json -InputObject $customerSummary -Depth 8 -Compress))
  $writer.Write('}')
} finally {
  $writer.Dispose()
  $archive.Dispose()
}

Write-Output "Sanitized dataset written to $outputFullPath"
