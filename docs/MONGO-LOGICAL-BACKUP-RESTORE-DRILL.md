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

- La URI de origen y destino se recibe solo por variables de entorno y se
  redacta de errores. No aparece en manifiestos.
- La URI debe contener el nombre explicito de la base y coincidir con la
  atestacion.
- El origen exige `sourceEnvironment=production`, cinco controles de escritura
  en `true` y una ventana de congelamiento menor a dos horas.
- El destino exige una instancia dedicada y descartable, sin trafico productivo
  ni integraciones externas. Su base debe comenzar con
  `chaman_restore_drill_`.
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

## 1. Plan y preflight offline

Copiar las plantillas fuera del repo, completar fechas UTC reales y usar el mismo
`attestationId`/`drillId`. La atestacion de origen solo se completa despues de
congelar escrituras.

El plan valida el contrato sin buscar herramientas ni conectar:

```powershell
npm run mongo:recovery -- plan --phase=dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --output-dir=D:\ChamanRecovery\backup_yyyymmdd_hhmm
```

El preflight tambien comprueba las versiones locales, pero sigue sin conectarse:

```powershell
npm run mongo:recovery -- preflight --phase=dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
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
$env:CHAMAN_MONGO_SOURCE_URI = '<URI productiva con /chaman>'
$env:CHAMAN_BACKUP_CONFIRM = 'dump:backup_yyyymmdd_hhmm:chaman'

npm run mongo:recovery -- dump `
  --attestation=D:\ChamanRecovery\source-freeze.json `
  --output-dir=D:\ChamanRecovery\backup_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_MONGO_SOURCE_URI
Remove-Item Env:CHAMAN_BACKUP_CONFIRM
```

El directorio debe ser nuevo. Contendra:

- `backup.archive.gz`;
- `source-inventory.json` con nombres, conteos e indices, nunca documentos;
- `manifest.json` con SHA-256, versiones y datos de consistencia, sin secretos.

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
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm
```

Crear `drill_yyyymmdd_hhmm` vacio fuera del repo antes del restore.

## 4. Restaurar

```powershell
$env:CHAMAN_MONGO_RESTORE_URI = '<URI aislada con /chaman_restore_drill_yyyymmdd_hhmm>'
$env:CHAMAN_RESTORE_CONFIRM = 'restore:backup_yyyymmdd_hhmm:chaman_restore_drill_yyyymmdd_hhmm'

npm run mongo:recovery -- restore `
  --attestation=D:\ChamanRecovery\target.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_RESTORE_CONFIRM
```

No se usa `--drop`: el destino debe estar vacio. El archive se remapea de la base
original a la base con prefijo de recovery. El recibo queda como
`restored-unverified`; todavia no habilita una promocion.

## 5. Verificar restauracion y agronomia

Manteniendo solo la URI aislada en la terminal:

```powershell
npm run mongo:recovery -- verify `
  --attestation=D:\ChamanRecovery\target.json `
  --manifest=D:\ChamanRecovery\backup_yyyymmdd_hhmm\manifest.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_MONGO_RESTORE_URI
```

La evidencia `verification.json` solo queda en `passed` cuando:

- todas las colecciones y vistas esperadas existen y conservan sus opciones;
- los conteos exactos coinciden;
- los indices normalizados coinciden;
- el major de MongoDB coincide;
- no faltan siembras ni semillas para lotes activos;
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
$env:CHAMAN_MONGO_RESTORE_URI = '<URI aislada con /chaman_restore_drill_yyyymmdd_hhmm>'
$env:CHAMAN_CLEANUP_CONFIRM = 'cleanup:backup_yyyymmdd_hhmm:chaman_restore_drill_yyyymmdd_hhmm'

npm run mongo:recovery -- cleanup `
  --attestation=D:\ChamanRecovery\target.json `
  --output-dir=D:\ChamanRecovery\drill_yyyymmdd_hhmm

Remove-Item Env:CHAMAN_CLEANUP_CONFIRM
Remove-Item Env:CHAMAN_MONGO_RESTORE_URI
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
