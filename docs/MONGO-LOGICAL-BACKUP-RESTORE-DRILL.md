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
- El manifiesto schema v2 fija modo, origen, SHA Git, archive y observaciones
  source antes/después. Como este dump por base no usa oplog ni snapshot,
  `sourcePointInTimeGuaranteed` queda siempre en `false`; la comparación informa
  además cualquier deriva observada —por ejemplo la provocada por TTL— sin
  presentar esas lecturas como contenido del archive.
- Dump y certificación exigen que
  `git status --porcelain --untracked-files=normal` esté vacío; un worktree
  sucio aborta para que el SHA sellado represente el código ejecutado.
- El archive candidato se restaura primero en una base local vacía y con TTL
  deshabilitado. Sólo se certifica después de 130 segundos, dos inventarios
  adicionales estables y ambas auditorías aprobadas.
- El segundo restore usa otra base vacía y compara sin tolerancias contra el
  inventario certificado: colecciones, opciones, conteos, índices y el digest
  `dbHash` de cada colección, preservando el orden de claves compuestas.
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

Cada `target.json`:

- `drillMode`: `testing-local-drill`;
- `environment`: `local-recovery-drill`;
- `database`: `chaman_restore_drill_*`;
- `instanceIdentity.provider`: `local-mongodb`;
- `instanceIdentity.instanceId` y fingerprint: valores del runtime proof.

La atestación source lleva la evidencia usada durante el dump. Cada destino
local —certificación y segundo restore— lleva su propia evidencia fresca y su
runtime proof específico; las tres evidencias deben derivar la misma instancia
MongoDB de Testing. Testing también se congela: API, workers, jobs y escrituras
de operador deben estar detenidos y los cinco controles deben ser verdaderos.

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

El dump devuelve `candidate-sealed` y `verify-backup` devuelve
`archive-candidate-verified`. Genera `source-inventory-before.json` y
`source-inventory-after.json`; su comparación queda sellada en el manifiesto.
El archive todavía **no** es una referencia de restore hasta completar la
certificación local. Después se documenta el fin del freeze de Testing.

La cuenta Mongo usada por la herramienta debe poder ejecutar el comando
`dbHash`. MongoDB 8 devuelve hashes MD5 por colección; Chamán los usa como
detector determinista de cambios de contenido y falla si falta uno. No es una
firma criptográfica contra colisiones intencionales, ni vuelve point-in-time al
dump. Si el servidor o sus permisos no admiten `dbHash`, el drill queda NO-GO:
no se degrada a comparar sólo conteos.

## 6. Primer restore: certificar el contenido real del archive

Crear un directorio vacío y restringido. La URI, runtime proof, evidencia y
atestación deben referir una primera base descartable, por ejemplo
`chaman_restore_drill_<ID>_cert`. Esa base debe estar vacía y acreditar TTL
false.

```powershell
$env:CHAMAN_RESTORE_CONFIRM = 'restore:<DRILL_ID>:chaman_restore_drill_<ID>_cert'
npm run mongo:recovery -- certify-archive-restore `
  --attestation=D:\ChamanRecovery\target-cert.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-cert\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-cert\runtime-proof-restore.json `
  --target-uri-file=D:\ChamanRecovery\secrets-cert\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --output-dir=D:\ChamanRecovery\certificate-run-001
Remove-Item Env:CHAMAN_RESTORE_CONFIRM
```

Esperar al menos **130 segundos** desde `completedAt` del restore antes de
verificar. Luego:

```powershell
npm run mongo:recovery -- certify-archive-verify `
  --attestation=D:\ChamanRecovery\target-cert.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-cert\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-cert\runtime-proof-verify.json `
  --target-uri-file=D:\ChamanRecovery\secrets-cert\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --output-dir=D:\ChamanRecovery\certificate-run-001
```

La certificación exige igualdad exacta entre inventario inmediato,
pre-auditoría y post-auditoría, y exige `ok: true` en las dos auditorías.
`archive-certification.json` liga esos archivos al SHA del archive, manifiesto,
atestación, evidencia y runtime proof TTL=false. También conserva, sin
tolerancias ni allowlists, la diferencia source-before/source-after/archive.
Una modificación de un valor, aun con el mismo número de documentos, cambia el
digest de la colección y bloquea la certificación.

Limpiar esta primera base con el procedimiento de la sección 8 antes de avanzar.

## 7. Segundo restore exacto y auditoría final

Crear otra base local vacía —nombre, URI, runtime proof, evidencia y atestación
nuevos— distinta de la base de certificación. El mismo proceso `mongod` puede
usarse si continúa aislado, pero la base debe ser diferente y vacía.

```powershell
$env:CHAMAN_RESTORE_CONFIRM = 'restore:<DRILL_ID>:chaman_restore_drill_<ID>_final'
npm run mongo:recovery -- restore `
  --attestation=D:\ChamanRecovery\target-final.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-final\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-final\runtime-proof-restore.json `
  --target-uri-file=D:\ChamanRecovery\secrets-final\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --archive-certification=D:\ChamanRecovery\certificate-run-001\archive-certification.json `
  --output-dir=D:\ChamanRecovery\drill-final-001
Remove-Item Env:CHAMAN_RESTORE_CONFIRM
```

El restore aborta antes de emitir recibo exitoso si su inventario inmediato no
coincide exactamente con el certificado. Esperar nuevamente al menos 130
segundos y ejecutar:

```powershell
npm run mongo:recovery -- verify `
  --attestation=D:\ChamanRecovery\target-final.json `
  --infrastructure-evidence=D:\ChamanRecovery\evidence-final\infrastructure-evidence.json `
  --runtime-proof=D:\ChamanRecovery\secrets-final\runtime-proof-verify.json `
  --target-uri-file=D:\ChamanRecovery\secrets-final\target.uri `
  --manifest=D:\ChamanRecovery\backup-001\manifest.json `
  --archive-certification=D:\ChamanRecovery\certificate-run-001\archive-certification.json `
  --output-dir=D:\ChamanRecovery\drill-final-001
```

La salida aceptable es `verification.json` con `status: passed`. Compara el
certificado contra inventario inmediato, pre-auditoría y final, además de
comparar esos tres entre sí. Las dos auditorías son bloqueantes.

## 8. Cleanup incluso después de expiración

No renovar ni reemplazar las atestaciones originales. Generar una prueba
runtime nueva del mismo endpoint, replica set y `dbPath`; el proceso se vuelve a
consultar inmediatamente antes del drop y su PID se comprueba dentro del propio
comando que ejecuta `dropDatabase`. Para cleanup se declara explícitamente
`--purpose=cleanup`: es la única fase que puede aceptar una prueba schema v1
histórica o un monitor TTL activo, porque su única mutación autorizada es
eliminar la base descartable ligada al intent original.

Para una cadena nueva con manifiesto schema v2, la prueba **corriente** pasada a
cleanup también debe ser schema v2; el CLI lo comprueba antes del drop. La
compatibilidad schema v1 queda limitada a la prueba histórica/original y al
cleanup integral de intentos legacy cuyo manifiesto también sea v1.

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

El simulacro de recuperabilidad del archive es GO sólo si existen, para el
mismo `drillId`:

- captura Railway cruda y evidencia derivada intactas;
- manifiesto candidato v2, archive con checksum válido y observaciones source
  before/after sin ocultar su deriva;
- `archive-certification.json` ligado al primer restore, con tres inventarios
  iguales y ambas auditorías aprobadas;
- cleanup receipt del primer destino con rescan negativo;
- segundo restore receipt ligado al mismo SHA del archive y certificado;
- `verification.json` final en `passed`, al menos 130 segundos después y sin
  deriva respecto del certificado;
- cleanup receipt del segundo destino con rescan negativo;
- revisión humana y ubicación controlada del archive.

`sourcePointInTimeGuaranteed: false` no se convierte en `true` por certificar:
el proceso demuestra que el archive se restaura de forma estructuralmente
exacta y estable, no que sea una fotografía point-in-time de Testing. Para esa
garantía hace falta snapshot del proveedor o dump completo de replica set con
oplog; `mongodump --oplog` no admite `--db`.

Ante cualquier duda de URI, destino, freeze, versión o identidad runtime, se
cancela. Nunca se restaura sobre Producción, Testing compartido ni ChirpStack.
