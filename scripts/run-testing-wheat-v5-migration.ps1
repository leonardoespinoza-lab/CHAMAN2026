param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$databaseName = 'chaman_testing'
$defaultSowingIds = @(
  '6a2961220eda3ebcfd6961e8', '6a29775776661845da5a12d1',
  '6a2977be76661845da5a1316', '6a298a2d8d39620d061966fb',
  '6a2ac2e413cbbcb1c22074a3', '6a3594abf1cb6377cdb54da2',
  '6a359e9468cacd83d101b01f',
  '6a46727a8ad6b0f32010c279', '6a4673448ad6b0f32010c5b1',
  '6a46b8e23268f3f0a6cc97d8', '6a46b95a3268f3f0a6cc9905',
  '6a46b9ae3268f3f0a6cc9a18', '6a46bb163268f3f0a6cc9cb9',
  '6a46ca3fb650bce1655e2d7b', '6a46cd13a65b079b1875f056',
  '6a46cdf9a65b079b1875f3a6', '6a46cf79a65b079b1875f72b',
  '6a46cf61a65b079b1875f617'
)
$sowingIds = if ($env:TESTING_WHEAT_SOWING_IDS) {
  @($env:TESTING_WHEAT_SOWING_IDS.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} else {
  $defaultSowingIds
}

if (-not $Apply) {
  [pscustomobject]@{
    mode = 'plan'
    database = $databaseName
    wheatSowings = $sowingIds.Count
  } | ConvertTo-Json
  exit 0
}

$mongo = $env:MONGO_PUBLIC_URL
if (-not $mongo) { $mongo = $env:MONGO_URL }
if (-not $mongo) { $mongo = $env:MONGO_URI }
if (-not $mongo -or $mongo -match 'production|chaman_prod') {
  throw 'Migracion rechazada: falta una URL publica inequivoca de Testing.'
}

$dataProcess = $null
$climateProcess = $null
$predictionProcess = $null
$dataLog = Join-Path $workspace 'logs\testing-v5-data.log'
$dataErrorLog = Join-Path $workspace 'logs\testing-v5-data.error.log'
$predictionLog = Join-Path $workspace 'logs\testing-v5-predictions.log'
$predictionErrorLog = Join-Path $workspace 'logs\testing-v5-predictions.error.log'
$climateLog = Join-Path $workspace 'logs\testing-v5-climate.log'
$climateErrorLog = Join-Path $workspace 'logs\testing-v5-climate.error.log'

function Wait-Service([int]$Port, [int]$Attempts = 40) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $client = $null
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $client.Connect('127.0.0.1', $Port)
      return
    } catch {
      Start-Sleep -Milliseconds 500
    } finally {
      if ($client) { $client.Dispose() }
    }
  }
  throw "El servicio local no respondio en el puerto $Port"
}

try {
  $env:MONGO_URI = $mongo
  $env:MONGO_URL = $mongo
  $env:DB_NAME = $databaseName
  $env:ENV = 'test'
  $env:NODE_ENV = 'test'
  $env:GEOREF_SYNC_ENABLED = 'false'
  $env:SOIL_INTELLIGENCE_ENABLED = 'false'
  $env:PREDICCIONES_MALEZAS_CRON_ENABLED = 'false'
  $env:PREDICCIONES_AGROCLIMA_CRON_ENABLED = 'false'

  $env:PORT = '5500'
  $dataProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-datos') -WindowStyle Hidden `
    -RedirectStandardOutput $dataLog -RedirectStandardError $dataErrorLog -PassThru
  Wait-Service 5500

  $env:PORT = '5508'
  $env:PREFIX = 'clima'
  $env:API_DATOS = 'http://127.0.0.1:5500'
  $env:AGROMETEO_CRON_ENABLED = 'false'
  $climateProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-api-clima') -WindowStyle Hidden `
    -RedirectStandardOutput $climateLog -RedirectStandardError $climateErrorLog -PassThru
  Wait-Service 5508

  $env:PORT = '5507'
  $env:PREFIX = 'sdc-predicciones'
  $env:API_DATOS = 'http://127.0.0.1:5500'
  $env:API_CLIMA = 'http://127.0.0.1:5508/clima-test'
  $predictionProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory (Join-Path $workspace 'sdc-api-predicciones') -WindowStyle Hidden `
    -RedirectStandardOutput $predictionLog -RedirectStandardError $predictionErrorLog -PassThru
  Wait-Service 5507

  $results = @()
  foreach ($id in $sowingIds) {
    $url = "http://127.0.0.1:5507/sdc-predicciones-test/prediccions/$id/reconstruir"
    try {
      $response = Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -Body '{}' -TimeoutSec 180
      $documentCount = @($response).Count
      if ($documentCount -eq 0) {
        throw 'El motor no materializo ningun documento sanitario.'
      }
      $results += [pscustomobject]@{
        idSiembra = $id
        ok = $true
        documentos = $documentCount
      }
    } catch {
      $results += [pscustomobject]@{
        idSiembra = $id
        ok = $false
        error = $_.Exception.Message
      }
      throw "Fallo la reconstruccion de $id. El motor restauro su respaldo transaccional."
    }
  }
  [pscustomobject]@{
    database = $databaseName
    rebuilt = @($results | Where-Object ok).Count
    results = $results
  } | ConvertTo-Json -Depth 5
} finally {
  if ($predictionProcess -and -not $predictionProcess.HasExited) {
    Stop-Process -Id $predictionProcess.Id -Force
  }
  if ($climateProcess -and -not $climateProcess.HasExited) {
    Stop-Process -Id $climateProcess.Id -Force
  }
  if ($dataProcess -and -not $dataProcess.HasExited) {
    Stop-Process -Id $dataProcess.Id -Force
  }
}
