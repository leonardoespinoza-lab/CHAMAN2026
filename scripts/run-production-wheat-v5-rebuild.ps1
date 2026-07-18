param(
  [switch]$Apply,
  [Parameter(Mandatory = $false)]
  [string]$BackupId
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$migrationId = 'production-wheat-v5-20260718'
$databaseName = 'chaman'

function Get-RailwayVariables([string]$Service) {
  $raw = & railway variables --json --service $Service --environment production
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron cargar variables de $Service." }
  return (($raw -join "`n") | ConvertFrom-Json)
}

function Set-ProcessVariables($Variables) {
  foreach ($property in $Variables.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
  }
}

function Wait-Service([int]$Port, [int]$Attempts = 80) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $client = $null
    try {
      $client = [System.Net.Sockets.TcpClient]::new()
      $client.Connect('127.0.0.1', $Port)
      return
    } catch {
      Start-Sleep -Milliseconds 500
    } finally {
      if ($client) { $client.Dispose() }
    }
  }
  throw "El servicio local no respondio en el puerto $Port."
}

if (-not $Apply) {
  & railway run --service MongoDB --environment production node `
    scripts/migrations/20260718-production-wheat-v5-snapshot.js plan
  exit $LASTEXITCODE
}

if (-not $BackupId) { throw 'Apply exige -BackupId de un snapshot ready.' }
$expectedConfirmation = "${migrationId}:rebuild:${BackupId}"
if ($env:CHAMAN_PRODUCTION_REPAIR_CONFIRM -ne $expectedConfirmation) {
  throw 'Reconstruccion cancelada: falta confirmacion productiva exacta.'
}

$planRaw = & railway run --service MongoDB --environment production node `
  scripts/migrations/20260718-production-wheat-v5-snapshot.js plan
if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el plan productivo.' }
$plan = (($planRaw -join "`n") | ConvertFrom-Json).result
$sowingIds = @($plan.latest.rows | Where-Object status -ne 'v5' | ForEach-Object idSiembra)
if ($plan.activeWheatSowings -eq 0) {
  throw 'Plan inconsistente: no se iniciara la reconstruccion.'
}
if ($sowingIds.Count -eq 0) {
  [pscustomobject]@{ database = $databaseName; backupId = $BackupId; requested = 0; rebuilt = 0; status = 'already-v5' } |
    ConvertTo-Json
  exit 0
}

$mongoVariables = Get-RailwayVariables 'MongoDB'
$dataVariables = Get-RailwayVariables 'chaman-datos'
$climateVariables = Get-RailwayVariables 'chaman-clima'
$predictionVariables = Get-RailwayVariables 'chaman-predicciones'
if (-not $mongoVariables.MONGO_PUBLIC_URL) { throw 'MongoDB no expone una URL publica para el runner local.' }

$dataProcess = $null
$climateProcess = $null
$predictionProcess = $null
$logDir = Join-Path $workspace 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$dataLog = Join-Path $logDir 'production-v5-data.log'
$dataErrorLog = Join-Path $logDir 'production-v5-data.error.log'
$climateLog = Join-Path $logDir 'production-v5-climate.log'
$climateErrorLog = Join-Path $logDir 'production-v5-climate.error.log'
$predictionLog = Join-Path $logDir 'production-v5-predictions.log'
$predictionErrorLog = Join-Path $logDir 'production-v5-predictions.error.log'

try {
  Set-ProcessVariables $dataVariables
  $env:MONGO_URI = [string]$mongoVariables.MONGO_PUBLIC_URL
  $env:MONGO_URL = [string]$mongoVariables.MONGO_PUBLIC_URL
  $env:DB_NAME = $databaseName
  $env:ENV = 'test'
  $env:NODE_ENV = 'test'
  $env:GEOREF_SYNC_ENABLED = 'false'
  $env:SOIL_INTELLIGENCE_ENABLED = 'false'
  $env:PORT = '5600'
  $dataProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-datos') -WindowStyle Hidden `
    -RedirectStandardOutput $dataLog -RedirectStandardError $dataErrorLog -PassThru
  Wait-Service 5600

  Set-ProcessVariables $climateVariables
  $env:ENV = 'test'
  $env:NODE_ENV = 'test'
  $env:PORT = '5608'
  $env:PREFIX = 'clima'
  $env:API_DATOS = 'http://127.0.0.1:5600'
  $env:AGROMETEO_CRON_ENABLED = 'false'
  $climateProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-api-clima') -WindowStyle Hidden `
    -RedirectStandardOutput $climateLog -RedirectStandardError $climateErrorLog -PassThru
  Wait-Service 5608

  Set-ProcessVariables $predictionVariables
  $env:ENV = 'test'
  $env:NODE_ENV = 'test'
  $env:PORT = '5607'
  $env:PREFIX = 'sdc-predicciones'
  $env:API_DATOS = 'http://127.0.0.1:5600'
  $env:API_CLIMA = 'http://127.0.0.1:5608/clima-test'
  $env:PREDICCIONES_MALEZAS_CRON_ENABLED = 'false'
  $env:PREDICCIONES_AGROCLIMA_CRON_ENABLED = 'false'
  $predictionProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-api-predicciones') -WindowStyle Hidden `
    -RedirectStandardOutput $predictionLog -RedirectStandardError $predictionErrorLog -PassThru
  Wait-Service 5607

  $headers = @{}
  if ($env:AGROMETEO_INTERNAL_TOKEN) {
    $headers['x-chaman-internal-token'] = $env:AGROMETEO_INTERNAL_TOKEN
  }
  $results = @()
  foreach ($id in $sowingIds) {
    $climateUrl = "http://127.0.0.1:5608/clima-test/agrometeorologia/siembras/$id/reprocesar"
    $predictionUrl = "http://127.0.0.1:5607/sdc-predicciones-test/prediccions/$id/reconstruir"
    try {
      $climateOk = $false
      for ($attempt = 1; $attempt -le 4 -and -not $climateOk; $attempt++) {
        try {
          Invoke-RestMethod -Method Post -Uri $climateUrl -Headers $headers `
            -ContentType 'application/json' -Body '{"sincronizarClima":true}' -TimeoutSec 300 | Out-Null
          $climateOk = $true
        } catch {
          if ($attempt -eq 4) { throw }
          Start-Sleep -Seconds ([Math]::Min(10, 2 * $attempt))
        }
      }
      $response = $null
      for ($attempt = 1; $attempt -le 2 -and -not $response; $attempt++) {
        try {
          $response = Invoke-RestMethod -Method Post -Uri $predictionUrl `
            -ContentType 'application/json' -Body '{}' -TimeoutSec 300
        } catch {
          if ($attempt -eq 2) { throw }
          Start-Sleep -Seconds 3
        }
      }
      $documents = @($response).Count
      if ($documents -eq 0) { throw 'El motor no materializo documentos sanitarios.' }
      $results += [pscustomobject]@{ idSiembra = $id; ok = $true; documentos = $documents }
    } catch {
      $results += [pscustomobject]@{ idSiembra = $id; ok = $false; error = $_.Exception.Message }
      throw "Fallo la reconstruccion de $id; el servicio activo su rollback por siembra."
    }
  }

  [pscustomobject]@{
    database = $databaseName
    backupId = $BackupId
    requested = $sowingIds.Count
    rebuilt = @($results | Where-Object ok).Count
    results = $results
  } | ConvertTo-Json -Depth 5
} finally {
  foreach ($process in @($predictionProcess, $climateProcess, $dataProcess)) {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  }
}
