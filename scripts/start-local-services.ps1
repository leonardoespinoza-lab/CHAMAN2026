$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$services = @(
  @{ Name = "sdc-datos"; Port = 5000; Path = "sdc-datos" },
  @{ Name = "sdc-auth"; Port = 5001; Path = "sdc-auth" },
  @{ Name = "sdc-api-clima"; Port = 5008; Path = "sdc-api-clima" },
  @{ Name = "sdc-api-predicciones"; Port = 5007; Path = "sdc-api-predicciones" },
  @{ Name = "sdc-api-lora"; Port = 5012; Path = "sdc-api-lora" },
  @{ Name = "sdc-api-cliente"; Port = 5002; Path = "sdc-api-cliente" },
  @{ Name = "sdc-app-chaman"; Port = 4200; Path = "sdc-app-chaman" }
)

foreach ($service in $services) {
  $existing = Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "$($service.Name) ya tiene el puerto $($service.Port) ocupado; no se inicia otra instancia."
    continue
  }

  $workdir = Join-Path $root $service.Path
  $logFile = Join-Path $logs "$($service.Name).log"

  if ($service.Name -eq "sdc-app-chaman") {
    $command = "npm start -- --host 127.0.0.1 --port 4200 > `"$logFile`" 2>&1"
  } else {
    $command = "npm run start:dev > `"$logFile`" 2>&1"
  }

  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", $command `
    -WorkingDirectory $workdir `
    -WindowStyle Hidden

  Write-Host "Iniciado $($service.Name) en puerto $($service.Port). Log: $logFile"
}

Write-Host ""
Write-Host "Abrir app: http://127.0.0.1:4200"
Write-Host "Recordatorio: MongoDB local debe estar corriendo antes de iniciar los servicios."
