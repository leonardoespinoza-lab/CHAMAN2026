$ports = @(5000, 5001, 5002, 5007, 5008, 4200)

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    try {
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
      Write-Host "Detenido proceso $($connection.OwningProcess) en puerto $port"
    } catch {
      Write-Host "No se pudo detener proceso $($connection.OwningProcess) en puerto $port"
    }
  }
}
