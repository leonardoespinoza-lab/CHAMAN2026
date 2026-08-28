# Backup logico y simulacro de restauracion de MongoDB

## Alcance y regla de seguridad

Este procedimiento genera evidencia recuperable antes de una promocion de
Chamán. No despliega codigo, no cambia Railway y no se ejecuta automaticamente
en CI. El `plan` es offline; `dump`, `restore`, `verify` y `cleanup` requieren una
operacion humana deliberada.

MongoDB productivo es actualmente standalone. `mongodump` no puede crear por si
solo una fotografia transaccional multi-coleccion en ese modo. Por eso el dump
solo se habilita con una atestacion vigente de **congelamiento completo de
escrituras de la aplicacion**. Si no se puede probar ese congelamiento, el backup
se cancela. No se usa `fsyncLock` ni se modifica la base productiva.

El tooling nunca debe apuntar a ChirpStack. No modifica sesiones LoRaWAN,
gateways, MQTT, Redis ni configuraciones de sensores.

## Garantias fail-closed

- La URI de origen y destino se captura con `Read-Host -AsSecureString`, se
  mantiene en una variable de entorno solamente durante el proceso padre y se
  redacta de errores. No aparece en manifiestos ni en los argumentos de procesos
  hijos. Database Tools la lee desde un YAML temporal restringido; `mongosh`
  desde un archivo temporal restringido. Ambos se sobrescriben y eliminan en
  `finally`.
- La URI debe contener el nombre explicito de la base y coincidir con la
  atestacion.
- El origen exige `sourceEnvironment=production`, cinco controles de escritura
  en `true` y una ventana de congelamiento menor a dos horas.
- El destino exige una instancia dedicada y descartable, sin trafico productivo
  ni integraciones externas. Su base debe comenzar con
  `chaman_restore_drill_`.
- Una evidencia separada, obtenida por API Railway de solo lectura, enumera IDs
  de ambiente, servicio, volumen, identidad de red y todos los aliases. Su hash
  liga ambas atestaciones; cualquier coincidencia o alias ambiguo aborta.
- Cada accion que escribe exige una frase exacta distinta en una variable de
  entorno.
- No se sobreescriben archives, recibos ni evidencias existentes.
- Los artefactos de backup y simulacro deben estar fuera del repositorio.
- Antes del restore se comprueba que el destino no tenga colecciones y que el
  major de MongoDB coincida con el origen.
- El resultado compara colecciones, opciones, conteos exactos e indices y ejecuta dos
  auditorias agronomicas de solo lectura.

Esto no reemplaza cifrado en reposo, control de acceso, retencion fuera de la PC
ni una politica de continuidad. El archive contiene datos productivos y debe
tratarse como informacion confidencial.

## Prerrequisitos

1. Una ventana de mantenimiento aprobada y comunicada.
2. Espacio libre suficiente fuera del repositorio (recomendado: tres veces el
   tamaño estimado de la base).
3. `mongosh`, `mongodump` y `mongorestore` instalados. Las Database Tools deben
   ser compatibles con el servidor.
4. Dependencias de `sdc-datos` instaladas para las auditorias:

   ```powershell
   npm ci --prefix sdc-datos
   ```

5. Una instancia Mongo aislada y descartable con el mismo major que produccion.
   No puede compartir servicio, volumen, credenciales ni red de aplicacion con
   produccion.
6. Dos personas identificadas en las atestaciones: operador y aprobador. Los
   archivos de ejemplo estan en `deploy/recovery/` y nunca deben contener URI,
   usuario o contraseña.
7. Evidencia Railway vigente, recolectada por un operador y revisada por otra
   persona, usando `deploy/recovery/railway-isolation-evidence.example.json`.
8. MongoDB Database Tools 100.3 o superior, porque `--config` con `uri` fue
   incorporado en esa version. Referencia oficial:
   https://www.mongodb.com/docs/database-tools/mongodump/#std-option-mongodump.--config

## 1. Plan y preflight offline

Copiar las plantillas fuera del repo, completar fechas UTC reales y usar el mismo
`attestationId`/`drillId`. Antes de firmarlas, calcular los fingerprints sin
conectar a MongoDB:

```powershell
$secret = Read-Host 'URI Mongo origen' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:CHAMAN_MONGO_SOURCE_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
npm run mongo:recovery -- fingerprint --side=source
} finally { Remove-Item Env:CHAMAN_MONGO_SOURCE_URI -ErrorAction SilentlyContinue; [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$secret = Read-Host 'URI Mongo recovery' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:CHAMAN_MONGO_RESTORE_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
npm run mongo:recovery -- fingerprint --side=target
} finally { Remove-Item Env:CHAMAN_MONGO_RESTORE_URI -ErrorAction SilentlyContinue; [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
```

Copiar cada `endpointFingerprintSha256` a su atestacion y registrar un
`instanceId` verificable de la plataforma. Los dos IDs y fingerprints deben ser
distintos. Una base de recovery creada en el host productivo es invalida. La
atestacion de origen solo se completa despues de congelar escrituras.

La evidencia no debe redactarse a mano: se conserva la respuesta del canal
Railway de solo lectura en un archivo separado, se revisan todos los dominios y
aliases y se copia su SHA-256 a ambas atestaciones. El verificador offline puede
probar la ligadura, vigencia y ausencia de coincidencias, pero no puede demostrar
por si solo que un JSON manual provino de Railway. Por eso una recoleccion manual,
un alias no inventariado o evidencia sin respuesta original inmutable es NO-GO.

El plan valida el contrato sin buscar herramientas ni conectar:

```powershell
npm run mongo:recovery -- plan --phase=dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --output-dir=D:\ChamanRecovery\backup_yyyymmdd_hhmm
```

El preflight tambien comprueba las versiones locales, pero sigue sin conectarse:

```powershell
npm run mongo:recovery -- preflight --phase=dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --output-dir=D:\ChamanRecovery\backup_yyyymmdd_hhmm
```

## 2. Congelar escrituras y crear el dump

Antes de firmar `source-freeze.json`:

1. Poner la API en modo mantenimiento sin escrituras o detener sus replicas.
2. Detener workers de datos, clima, predicciones, NDVI, FTP y cualquier consumidor
   que escriba Mongo.
3. Deshabilitar cron y tareas programadas.
4. Bloquear cambios manuales de operadores.
5. Verificar que no quedan escritores activos y registrar hora/evidencia en el
   ticket.

No basta detener un solo servicio: todos los cinco controles de la atestacion
deben ser verdaderos. Mantener el congelamiento hasta que el comando informe
`status: sealed` y el operador registre el SHA-256.

En una terminal efimera, sin guardar secretos en archivos o historial:

```powershell
$secret = Read-Host 'URI Mongo origen' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$env:CHAMAN_MONGO_SOURCE_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
$env:CHAMAN_BACKUP_CONFIRM = 'dump:backup_yyyymmdd_hhmm:chaman'

npm run mongo:recovery -- dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --output-dir=D:\ChamanRecovery\backup_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_MONGO_SOURCE_URI
Remove-Item Env:CHAMAN_BACKUP_CONFIRM
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
```

El directorio debe ser nuevo. Contendra:

- `backup.archive.gz`;
- `source-inventory.json` con nombres, conteos e indices, nunca documentos;
- `manifest.json` con SHA-256, versiones y datos de consistencia, sin secretos.

Si una fase falla despues de crear su directorio, queda un
`<fase>-failure-receipt.json` con hash del error y lista cerrada de artefactos
parciales. Esos artefactos no se consideran recuperables ni se reutilizan.

Verificar nuevamente sin conexion:

```powershell
npm run mongo:recovery -- verify-backup `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json
```

Solo despues de `sealed` y `backup-verified` se restablecen los servicios de
escritura conforme al ticket. Si falla el sellado, no usar el archive y mantener
el incidente controlado hasta decidir si se repite dentro de una nueva ventana.

## 3. Preparar el destino descartable

Crear una instancia de recovery sin conexiones de Chamán y una base vacia, por
ejemplo `chaman_restore_drill_yyyymmdd_hhmm`. Completar
`disposable-target-attestation.json` fuera del repo. Su `drillId` debe coincidir
con el manifiesto.

El preflight valida herramientas y checksums sin conectarse:

```powershell
npm run mongo:recovery -- preflight --phase=restore `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm
```

Crear `drill_yyyymmdd_hhmm` vacio fuera del repo antes del restore.

## 4. Restaurar

```powershell
$secret = Read-Host 'URI Mongo recovery' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$env:CHAMAN_MONGO_RESTORE_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
$env:CHAMAN_RESTORE_CONFIRM = 'restore:backup_yyyymmdd_hhmm:chaman_restore_drill_yyyymmdd_hhmm'

npm run mongo:recovery -- restore `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_RESTORE_CONFIRM
```

No se usa `--drop`: el destino debe estar vacio. El archive se remapea de la base
original a la base con prefijo de recovery. Se guardan inventarios antes y justo
despues del restore; una diferencia impide crear un recibo exitoso. El recibo queda como
`restored-unverified`; todavia no habilita una promocion.

## 5. Verificar restauracion y agronomia

Manteniendo solo la URI aislada en la terminal:

```powershell
npm run mongo:recovery -- verify `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_MONGO_RESTORE_URI
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
```

La evidencia `verification.json` solo queda en `passed` cuando:

- todas las colecciones y vistas esperadas existen y conservan sus opciones;
- los conteos exactos coinciden;
- los indices normalizados coinciden;
- el major de MongoDB coincide;
- no faltan siembras ni semillas para lotes activos;
- las semillas se comparan por IDs unicos: varias siembras pueden compartir la
  misma variedad sin producir falsos faltantes;
- no aparecen claves duplicadas de prediccion.

Tambien se ejecuta la auditoria general de integridad de lotes. Sus hallazgos
historicos quedan documentados, pero no demuestran por si mismos una falla del
restore; la comparacion estructural y la matriz agronomica critica si son
bloqueantes. Revisar los tres archivos de auditoria antes de firmar el ticket.

La evidencia aceptable para una futura promocion es el SHA-256 del manifiesto y
un `verification.json` con `status: passed`. Un log de `mongodump` aislado no es
prueba de recuperabilidad.

## 6. Cleanup seguro

El cleanup elimina solamente la base cuyo nombre comienza con
`chaman_restore_drill_`; no borra el archive ni la evidencia local.

```powershell
$secret = Read-Host 'URI Mongo recovery' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$env:CHAMAN_MONGO_RESTORE_URI = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
$env:CHAMAN_CLEANUP_CONFIRM = 'cleanup:backup_yyyymmdd_hhmm:chaman_restore_drill_yyyymmdd_hhmm'

npm run mongo:recovery -- cleanup `
  --attestation=D:\ChamanRecovery\target.json `
  --infrastructure-evidence=D:\ChamanRecovery\railway-evidence.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_CLEANUP_CONFIRM
Remove-Item Env:CHAMAN_MONGO_RESTORE_URI
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
```

Conservar `cleanup-receipt.json`. Luego destruir la instancia/volumen descartable
desde su plataforma y registrar esa segunda evidencia en el ticket. La destruccion
de infraestructura no se automatiza desde este repositorio.

## Criterio de salida y recuperacion

Una promocion que escriba datos productivos sigue bloqueada si falta cualquiera
de estos elementos:

- manifest sellado y checksum verificado;
- restore receipt del mismo `drillId`;
- verificacion `passed`;
- revision humana de auditorias;
- ubicacion cifrada y controlada del archive;
- SHA Git exacto de la version a promover y SHA de rollback.

Ante cualquier duda de destino, version, freeze o URI, cancelar. Nunca se prueba
un restore sobre produccion, Testing compartido ni la base de ChirpStack.
