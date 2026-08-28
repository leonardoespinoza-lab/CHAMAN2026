# Backup lógico y simulacro MongoDB

## Estado y alcance

Esta herramienta prepara un simulacro recuperable sin desplegar código ni
modificar Railway. El primer uso autorizado es **Testing → MongoDB local
descartable**, modo `testing-local-drill`:

- origen: environment `Testing`, base `chaman_testing`;
- destino: un `mongod` local, ligado sólo a loopback, como replica set de un
  nodo y con base `chaman_restore_drill_*`;
- ChirpStack, LoRaWAN, MQTT, Redis y Producción quedan fuera de alcance.

Un dump de Producción continúa bloqueado hasta disponer de una ventana de
mantenimiento que demuestre congelamiento total de escritores. MongoDB
productivo es standalone y `mongodump` no ofrece por sí solo una fotografía
multi-colección consistente.

## Garantías fail-closed

- Las URI se ingresan por stdin y se guardan fuera del repositorio en archivos
  con ACL exclusiva. Una URI encontrada en el entorno del proceso aborta.
- Ningún hijo recibe el entorno completo. `mongosh`, Database Tools, Git,
  Railway CLI y PowerShell reciben un entorno mínimo; la URI nunca aparece en
  argv ni en variables de entorno.
- `railway status --json` se ejecuta con `--project` y `--environment`
  explícitos. Su stdout crudo se guarda con ACL, se hashea y el grafo
  proyecto→environment→servicio→volumen se deriva de esa captura. No se acepta
  un JSON de topología escrito a mano.
- El destino local se acredita consultando `hello`, `buildInfo`,
  `getCmdLineOpts`, `serverStatus` y `getParameter`. Debe ser primary, usar
  replica set, exponer un único endpoint loopback, tener su `dbPath` bajo
  `chaman-recovery-drill` y demostrar `ttlMonitorEnabled: false`.
- La prueba runtime dura diez minutos. Cada fase posterior usa una prueba
  fresca que debe conservar endpoint, replica set y `dbPath` sellados.
- El manifiesto fija modo, origen, SHA Git, checksums, inventario y evidencia de
  infraestructura. Los hashes se comparan sin depender de mayúsculas.
- El restore exige una base vacía, remapea el namespace y compara colecciones,
  opciones, conteos e índices, preservando el orden de claves compuestas.
- Antes de la primera escritura crea `restore-intent.json`. Si el restore queda
  parcial, ese intent sellado permite limpiar el destino sin inventar un recibo
  exitoso.
- El cleanup exige manifiesto e intent originales (y el recibo si llegó a
  crearse), una prueba runtime nueva y reescanea `listDatabases` después del
  drop. Funciona aunque las atestaciones originales ya hayan vencido.
- Ningún archivo existente se sobreescribe. Los artefactos viven fuera del
  repositorio.

## Herramientas portables

La versión comprobada en esta PC está registrada en:

`C:\Users\lespinoza\AppData\Local\Codex\chaman-recovery-tools\MANIFEST.json`

Se requieren MongoDB Database Tools 100.3 o superior, `mongosh` y un servidor
MongoDB del mismo major que el origen. Los binarios pueden seleccionarse con:

```powershell
$env:CHAMAN_MONGOSH_BIN = 'C:\ruta\mongosh.exe'
$env:CHAMAN_MONGODUMP_BIN = 'C:\ruta\mongodump.exe'
$env:CHAMAN_MONGORESTORE_BIN = 'C:\ruta\mongorestore.exe'
$env:CHAMAN_RAILWAY_BIN = 'C:\ruta\railway.exe'
```

Estas variables sólo contienen rutas de ejecutables, nunca credenciales.

## 1. Directorios y URI

Usar directorios dedicados fuera del repositorio. `create-uri-file` crea el
directorio secreto si su padre ya existe; si existe, exige que ya tenga ACL
restrictiva y no cambia permisos de un directorio compartido.

```powershell
$secret = Read-Host 'URI Mongo Testing' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) |
    node scripts/mongo-recovery.js create-uri-file `
      --output=D:\ChamanRecovery\secrets-testing\source.uri
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$secret = Read-Host 'URI Mongo local descartable' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) |
    node scripts/mongo-recovery.js create-uri-file `
      --output=D:\ChamanRecovery\secrets-local\target.uri
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
```

Las URI deben incluir respectivamente `/chaman_testing` y
`/chaman_restore_drill_<id>`.

## 2. Acreditar MongoDB local

El `mongod` se inicia fuera de esta herramienta con `--bind_ip 127.0.0.1`,
`--port 27019`, `--replSet chamanDrill`, `--setParameter
ttlMonitorEnabled=false` y un `--dbpath` nuevo bajo un directorio llamado
`chaman-recovery-drill`. El replica set debe anunciar el mismo endpoint
loopback de la URI, no el hostname de la PC.

`ttlMonitorEnabled=false` se usa **exclusivamente en este MongoDB local,
aislado y descartable**, para impedir que un índice TTL modifique la fotografía
mientras se audita. Nunca se configura en MongoDB de Testing, Producción,
Railway ni en una instancia compartida. Los índices TTL se restauran sin
alterarlos y siguen formando parte de la comparación.

El inicio local debe contener, entre otros, estos argumentos:

```text
mongod --bind_ip 127.0.0.1 --port 27019 --replSet chamanDrill --dbpath <DIRECTORIO_DEDICADO> --setParameter ttlMonitorEnabled=false
```

Luego se inicia el replica set:

```javascript
rs.initiate({
  _id: 'chamanDrill',
  members: [{ _id: 0, host: '127.0.0.1:27019' }],
})
```

Después de confirmar que ese único nodo es primary:

```powershell
npm run mongo:recovery -- runtime-proof `
  --target-uri-file=D:\ChamanRecovery\secrets-local\target.uri `
  --expected-dbpath-root=C:\Users\lespinoza\AppData\Local\Codex\chaman-recovery-drill\run-001 `
  --output=D:\ChamanRecovery\secrets-local\runtime-proof.json
```

No editar ese JSON. Es schema v2 y sella el valor booleano devuelto por
`getParameter.ttlMonitorEnabled`; `true`, ausencia o la cadena `"false"`
cancelan plan, preflight, restore y verify. Si vence, generar otro archivo con
nombre nuevo.

## 3. Recolectar evidencia Railway

Este es el único comando que consulta Railway. Es de sólo lectura y no usa el
estado enlazado de la carpeta:

```powershell
npm run mongo:recovery -- collect-infrastructure-evidence `
  --mode=testing-local-drill `
  --project-id=<UUID_PROYECTO_CHAMAN> `
  --source-environment=Testing `
  --source-service=<UUID_O_NOMBRE_MONGODB_TESTING> `
  --runtime-proof=D:\ChamanRecovery\secrets-local\runtime-proof.json `
  --output-dir=D:\ChamanRecovery\evidence-001 `
  --evidence-id=testing_local_yyyymmdd_hhmm `
  --collector=<OPERADOR> `
  --reviewed-by=<OTRA_PERSONA>
```

El directorio contiene:

- `railway-status-source.raw.json`, stdout exacto de Railway;
- `infrastructure-evidence.json`, grafo derivado y hashes.

La persona revisora debe comparar la captura con el Admin de Railway antes de
usar el SHA de `infrastructure-evidence.json` en las atestaciones.

## 4. Atestaciones Testing→local

Copiar las plantillas fuera del repo y completar datos reales. Para este modo:

`source-freeze.json`:

- `drillMode`: `testing-local-drill`;
- `sourceEnvironment`: `testing`;
- `database`: `chaman_testing`;
- `instanceIdentity.provider`: `railway`;
- `instanceIdentity.instanceId`: service ID derivado por el collector.

`target.json`:

- `drillMode`: `testing-local-drill`;
- `environment`: `local-recovery-drill`;
- `database`: `chaman_restore_drill_*`;
- `instanceIdentity.provider`: `local-mongodb`;
- `instanceIdentity.instanceId` y fingerprint: valores del runtime proof.

Ambas atestaciones llevan el SHA-256 de la misma evidencia. Testing también se
congela: API, workers, jobs y escrituras de operador deben estar detenidos y los
cinco controles deben ser verdaderos.

### Precaución con `railway scale`

En Railway CLI 5.26.1, los servicios históricos pueden aparecer como región
`sfo`, pero ese nombre no se admite para volver a escalar. El nombre operativo
es `us-west` y el estado resultante se informa como `us-west2`. Además, bajar y
subir réplicas crea un deployment nuevo y puede tomar la punta actual de la
rama configurada. Por eso `scale` no es, por sí solo, un mecanismo de freeze
reversible.

Sólo se puede usar para este drill después de que todos los escritores de
Testing hayan sido desplegados desde una rama de release inmóvil y se haya
registrado el mismo SHA exacto antes y después. Servicios sin SHA Git fijado
deben quedar fuera o recibir primero una imagen/release inmutable. Si esas
precondiciones no se cumplen, el dump se cancela; nunca se atestigua
`activeWritersVerifiedZero` por mera intención.

## 5. Plan, dump y verificación offline

```powershell
npm run mongo:recovery -- plan --phase=dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-001\infrastructure-evidence.json `
  --output-dir=D:\ChamanRecovery\backup-001

$env:CHAMAN_BACKUP_CONFIRM = 'dump:<DRILL_ID>:chaman_testing'
npm run mongo:recovery -- dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-001\infrastructure-evidence.json `
  --source-uri-file=D:\ChamanRecovery\secrets-testing\source.uri `
  --output-dir=D:\ChamanRecovery\backup-001
Remove-Item Env:CHAMAN_BACKUP_CONFIRM

npm run mongo:recovery -- verify-backup `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json
```

El dump sólo es utilizable cuando devuelve `sealed` y `verify-backup` devuelve
`backup-verified`. Después se documenta el fin del freeze de Testing.

## 6. Restore y auditoría

Crear un directorio vacío y restringido para el drill. Generar un runtime proof
nuevo si el anterior tiene más de diez minutos y usarlo en cada fase.

```powershell
$env:CHAMAN_RESTORE_CONFIRM = 'restore:<DRILL_ID>:chaman_restore_drill_<ID>'
npm run mongo:recovery -- restore `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-001\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-local\runtime-proof-restore.json `
  --target-uri-file=D:\ChamanRecovery\secrets-local\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --output-dir=D:\ChamanRecovery\drill-001
Remove-Item Env:CHAMAN_RESTORE_CONFIRM

Esperar al menos **130 segundos** desde `completedAt` del restore antes de
ejecutar `verify`. Es una comprobación de estabilidad superior a dos ciclos
normales de 60 segundos del monitor TTL; el inventario diferido debe conservar
exactamente colecciones, conteos, opciones e índices del inventario fuente. El
CLI rechaza fechas inválidas, futuras o cualquier demora menor a 130 segundos, y deja
el retraso efectivo y el umbral requerido dentro de `verification.json`.

npm run mongo:recovery -- verify `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-001\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-local\runtime-proof-verify.json `
  --target-uri-file=D:\ChamanRecovery\secrets-local\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --output-dir=D:\ChamanRecovery\drill-001
```

La salida aceptable es `verification.json` con `status: passed`. Además se
conservan inventarios exclusivos antes y después de las auditorías, las
auditorías agronómicas y una copia ACL del runtime proof exacto usado antes del
restore. El inventario final se compara tanto con la fuente como con el
inventario pre-auditoría; cualquier deriva impide `passed`.

## 7. Cleanup incluso después de expiración

No renovar ni reemplazar las atestaciones originales. Generar una prueba
runtime nueva del mismo endpoint, replica set y `dbPath`; el proceso se vuelve a
consultar inmediatamente antes del drop y su PID se comprueba dentro del propio
comando que ejecuta `dropDatabase`. Para cleanup se declara explícitamente
`--purpose=cleanup`: es la única fase que puede aceptar una prueba schema v1
histórica o un monitor TTL activo, porque su única mutación autorizada es
eliminar la base descartable ligada al intent original.

La atestación, la evidencia y la copia del runtime proof usada originalmente
para restaurar pueden estar vencidas durante cleanup: se conservan y validan
por hash e identidad. En cambio, el archivo pasado ahora mediante
`--runtime-proof` debe ser una captura **fresca y vigente** del proceso actual;
`--purpose=cleanup` no relaja su ventana de diez minutos.

```powershell
npm run mongo:recovery -- runtime-proof `
  --purpose=cleanup `
  --target-uri-file=D:\ChamanRecovery\secrets-local\target.uri `
  --expected-dbpath-root=C:\Users\lespinoza\AppData\Local\Codex\chaman-recovery-drill\run-001 `
  --output=D:\ChamanRecovery\secrets-local\runtime-proof-cleanup.json

$env:CHAMAN_CLEANUP_CONFIRM = 'cleanup:<DRILL_ID>:chaman_restore_drill_<ID>'
npm run mongo:recovery -- cleanup `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-001\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-local\runtime-proof-cleanup.json `
  --target-uri-file=D:\ChamanRecovery\secrets-local\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --output-dir=D:\ChamanRecovery\drill-001
Remove-Item Env:CHAMAN_CLEANUP_CONFIRM
```

`cleanup-receipt.json` conserva los hashes originales, el process ID probado y
`rescanFound: false`. Después se detiene el `mongod` local y se conserva la
evidencia del drill según la política de retención.

## Criterio de salida

El simulacro es GO sólo si existen, para el mismo `drillId`:

- captura Railway cruda y evidencia derivada intactas;
- manifiesto sellado y archive con checksum válido;
- restore receipt ligado al manifiesto y atestación;
- `verification.json` en `passed`, capturado al menos 130 segundos después del
  restore y sin deriva del inventario;
- cleanup receipt con rescan negativo;
- revisión humana y ubicación controlada del archive.

Ante cualquier duda de URI, destino, freeze, versión o identidad runtime, se
cancela. Nunca se restaura sobre Producción, Testing compartido ni ChirpStack.
