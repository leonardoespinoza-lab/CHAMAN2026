# Runbook de snapshot y restauracion del piloto ERA5

## Alcance

Esta herramienta protege **un solo lote con exactamente una siembra activa** en
la base `chaman_testing`. No copia Produccion, no conoce Railway y no permite
otra base. El primer piloto ERA5 no debe ejecutarse si este flujo no termina en
verde.

La herramienta es una serie de seguridad cherry-pickeable. **No contiene el
bridge ERA5**. Sobre la rama integrada foundation + bridge aplicar el rango
completo posterior al baseline `901cfda`, en orden topológico, hasta el tip de
`codex/era5-pilot-snapshot-tool` (`git cherry-pick 901cfda..codex/era5-pilot-snapshot-tool`).
Ese rango incluye `7bebce1`, `20fb94d`, `53d3e45`, `b76fbc4` y el commit final
de este endurecimiento; resolver conflictos sin omitir commits y ejecutar toda
la validación nuevamente.

El cierre mutable incluye:

- `siembras` y `lotes`, incluidos sus punteros y ultimas predicciones;
- `observaciones_meteorologicas` seleccionadas por la misma identidad del upsert:
  `idEstablecimiento + timestamp + granularidad`. Las horas se cierran por el
  intervalo UTC de la zona IANA del punto; los diarios se cierran por
  `fechaLocal`, por el rango calendario UTC y por las identidades explícitas de
  mediodía local, `00:00Z` y `01:00Z`. Así una etiqueta o timestamp incoherente
  no puede ocultar una fila que el piloto sí podría actualizar;
- indicadores legacy, generaciones preparadas, generacion activa e historicas;
- predicciones sanitarias, predicciones de riego y alertas vinculadas por
  `idSiembra` o `idLote`.

Establecimiento, semilla, crono, binding, punto de grilla y diarios ERA5 se
guardan como referencias verificables. Restore nunca los modifica.

## Garantias fail-closed

- IDs ObjectId exactos; no admite nombres, regex ni queries libres.
- `from` debe ser exactamente la fecha de siembra.
- Aborta salvo que la base declarada en la URI sea `chaman_testing`.
- Aborta ante cualquier flag de entorno productivo.
- Exige un fingerprint SHA-256 explícito del endpoint del cluster Testing; el
  nombre lógico de la base por sí solo no es suficiente.
- Aborta si el establecimiento contiene otro lote, si una observación del rango
  contiene `idLote` o `contextosLote` ajenos, o si falta la attestation operativa.
- El piloto inicial es exclusivamente agrometeorológico. Crons, predicciones,
  notificaciones, outbox y push deben permanecer congelados desde antes del
  plan hasta después de verify/restore.
- Resuelve siembra, lote, establecimiento y siembras activas mediante `$lookup`
  en Mongo; exige un solo resultado y `lotes.idSiembra` coherente.
- Exige un unico binding activo del lote y un punto de grilla habilitado.
- Binding y grilla deben coincidir exactamente con el contrato del bridge:
  proveedor/dataset, país, coordenadas, distancia declarada, `historicalStart`
  y timezone IANA válidos.
- Exige índices únicos críticos y cobertura diaria continua
  `chaman-meteo-agro-v2`, con 23-25 horas válidas por día, desde siembra hasta
  el extremo solicitado. Temperaturas nulas, vacías o no finitas se rechazan;
  strings numéricos explícitos se interpretan igual que en el bridge y deben
  respetar sus rangos plausibles y el orden mínima ≤ media ≤ máxima.
- `bridge-today` sella la fecha local que usará el piloto. La cobertura ERA5 se
  calcula con el mismo corte del bridge: hoy y los cuatro días previos quedan
  fuera de ERA5 y continúan bajo Open-Meteo.
- Escanea secretos y aborta antes de escribir el bundle, incluidos Buffer,
  BSON Binary, `$binary`, base64 y credenciales anidadas como `api.key`.
- Archivos NDJSON EJSON, conteos, IDs y SHA-256 por coleccion; manifiesto con
  hash propio.
- Bundle y attestations se rechazan si están dentro del worktree. El manifiesto
  sella Node 20.x y los SHA-256 de `package-lock.json` y
  `sdc-datos/package-lock.json`; verify/restore exigen los mismos locks.
- Los índices se verifican antes de abrir y después de cerrar cada transacción,
  porque Mongo no admite `listIndexes` dentro de ella. Cobertura y datos
  mutables se vuelven a validar dentro del snapshot transaccional.
- Plan, snapshot y verify leen un punto consistente mediante transaccion Mongo
  con `readConcern=snapshot`; no mezclan documentos de momentos distintos.
- Restore requiere transacciones Mongo con `readConcern=snapshot` y
  `writeConcern=majority`. Si el servidor no las soporta, falla sin degradar a
  escrituras sueltas.
- Restore usa compare-and-swap: el estado debe coincidir exactamente con la
  foto post-piloto. Si alguien cambio un documento despues, no escribe nada.
- Al sellar post-state y al restaurar, la misma transacción vuelve a resolver
  lote/siembra, única siembra activa, exclusividad del establecimiento,
  binding/grilla y contextos meteorológicos sobre **todas** las observaciones
  leídas por la consulta sellada, incluso IDs re-keyeados fuera del rango. La
  prueba queda ligada al hash del manifiesto; `recordPostState` no admite una
  afirmación autocertificada.
- La restauración vuelve a leer y verifica el estado restaurado **dentro de la
  misma transacción**, antes del commit mayoritario. No interpreta una escritura
  posterior al commit como si la restauración hubiese fallado.
- Una segunda restauracion contra el estado ya restaurado es idempotente.
- `verify` y `restore` vuelven a exigir worktree limpio y el mismo `codeSha`
  sellado en el bundle; no se admite ejecutar otro commit.

## Preparacion offline

Instalar las dependencias ya fijadas del servicio Datos:

```powershell
npm --prefix sdc-datos ci
npm run test:era5:pilot:snapshot
```

Ejecutar con Node.js 20.x, igual que `engines` y `.nvmrc`. No regenerar ninguno de los dos lockfiles
durante el piloto: ambos hashes forman parte de la identidad restaurable.

La URI se entrega solo por una variable local secreta. Nunca se pasa en la
linea de comandos ni se guarda en el bundle:

```powershell
$env:CHAMAN_TESTING_MONGODB_URI = '<URI que termina en /chaman_testing>'
```

Infraestructura debe entregar dos JSON aprobados y externos al repositorio. El
fingerprint no se deriva ni se aprueba desde la URI activa durante la ejecución.
Para replica sets se sellan los hosts ordenados; para SRV, el hostname SRV.

```json
{"schemaVersion":2,"purpose":"era5-agromet-pilot","operationId":"era5-pilot-20260828-lote-01","environment":"testing","database":"chaman_testing","endpointFingerprint":"<SHA256 APROBADO>","approvedBy":"<RESPONSABLE>","evidence":"<TICKET/ACTA>","approvedAt":"2026-08-28T12:00:00.000Z","expiresAt":"2026-08-29T12:00:00.000Z"}
```

```json
{"schemaVersion":3,"environment":"testing","database":"chaman_testing","operationId":"era5-pilot-20260828-lote-01","endpointFingerprint":"<MISMO SHA256 APROBADO>","codeSha":"<HEAD LIMPIO DE 40 CARACTERES>","statement":"AGROMET_ONLY:CRONS_FROZEN:NOTIFICATIONS_DISABLED:OUTBOX_DISABLED:PUSH_DISABLED","pilotConfig":{"lotId":"<OBJECT_ID_LOTE>","sowingId":"<OBJECT_ID_SIEMBRA>","from":"<FECHA_SIEMBRA>","to":"<ULTIMO_DIA>","historicalStart":"<HISTORICAL_START_EXACTO>","bridgeToday":"<FECHA_LOCAL_SELLADA>","recentOpenMeteoDays":5,"calculationVersion":"chaman-meteo-agro-v2","sourceVersion":"era5-land-timeseries-19var-v2"},"approvedBy":"<RESPONSABLE>","evidence":"<TICKET/LOGS>","approvedAt":"2026-08-28T12:00:00.000Z","expiresAt":"2026-08-28T20:00:00.000Z"}
```

```powershell
$env:CHAMAN_TESTING_CLUSTER_ATTESTATION_FILE = 'D:\attestations\cluster-testing.json'
$env:CHAMAN_ERA5_PILOT_SAFETY_ATTESTATION_FILE = 'D:\attestations\era5-pilot-freeze.json'
```

Si cambia el endpoint, no actualizar el acta automáticamente. No usar una URI
de Producción aunque apunte a una base llamada `chaman_testing`.
Las fechas de las actas son ISO-8601 UTC canónico con milisegundos. La del
cluster puede cubrir como máximo 30 días; la operativa, 24 horas. Ambas deben
estar vigentes y vinculadas al mismo `operationId`; la operativa también queda
vinculada al endpoint, al commit y a toda la configuración crítica exactos,
incluido `historicalStart`. El fingerprint del endpoint queda dentro del
manifiesto; verify/restore rechazan usar el bundle bajo otro cluster Testing.

## 1. Plan de solo lectura

```powershell
npm run era5:pilot:snapshot -- plan `
  --operation-id era5-pilot-20260828-lote-01 `
  --lot-id <OBJECT_ID_LOTE> `
  --sowing-id <OBJECT_ID_SIEMBRA> `
  --from <FECHA_SIEMBRA_YYYY-MM-DD> `
  --to <ULTIMO_DIA_QUE_PUEDE_AFECTAR_EL_PILOTO> `
  --historical-start <CHAMAN_METEO_HISTORICAL_START_EXACTO> `
  --bridge-today <FECHA_LOCAL_DEL_PUNTO_YYYY-MM-DD>
```

Revisar que haya exactamente una siembra, un lote y un binding; revisar los
conteos de todas las colecciones. Copiar `requiredConfirmation` solo después de
esa revision.

## 2. Snapshot previo

Usar un directorio nuevo, fuera del repositorio y con respaldo cifrado:

```powershell
$env:CHAMAN_ERA5_PILOT_CONFIRM = '<requiredConfirmation exacta del plan>'
npm run era5:pilot:snapshot -- snapshot `
  --operation-id era5-pilot-20260828-lote-01 `
  --lot-id <OBJECT_ID_LOTE> `
  --sowing-id <OBJECT_ID_SIEMBRA> `
  --from <FECHA_SIEMBRA_YYYY-MM-DD> `
  --to <ULTIMO_DIA_QUE_PUEDE_AFECTAR_EL_PILOTO> `
  --historical-start <CHAMAN_METEO_HISTORICAL_START_EXACTO> `
  --bridge-today <FECHA_LOCAL_DEL_PUNTO_YYYY-MM-DD> `
  --bundle D:\backups\era5-pilot-20260828-lote-01
Remove-Item Env:CHAMAN_ERA5_PILOT_CONFIRM
```

Verificar inmediatamente que Testing aun coincide:

```powershell
npm run era5:pilot:snapshot -- verify --bundle D:\backups\era5-pilot-20260828-lote-01
```

No iniciar el piloto si esta verificacion falla.

## 3. Piloto

Ejecutar el bridge y reproceso solamente para el `idSiembra` y `idLote` del
manifiesto y únicamente hasta la generación agrometeorológica. Mantener
desactivados el batch general, motor sanitario, riego, alertas, workers de
notificaciones, outbox y proveedor push. Verificar métricas y salidas antes de
continuar. La attestation es una confirmación humana verificable, no detiene
procesos por sí sola.

## 4. Sellar el estado posterior

Inmediatamente despues del piloto y antes de cualquier otra escritura sobre el
lote:

```powershell
npm run era5:pilot:snapshot -- verify `
  --bundle D:\backups\era5-pilot-20260828-lote-01 `
  --record-post-state
```

Esto no escribe Mongo. Crea `post-state.json` y muestra
`requiredRestoreConfirmation`. Si luego cambia cualquier documento dentro del
cierre, restore abortara.

## 5. Restore, solo si el piloto debe revertirse

Detener primero cualquier cron o proceso que pueda escribir el lote. Conservar
evidencia de la razon del rollback. Luego:

```powershell
$env:CHAMAN_ERA5_PILOT_CONFIRM = '<requiredRestoreConfirmation exacta>'
npm run era5:pilot:snapshot -- restore --bundle D:\backups\era5-pilot-20260828-lote-01
Remove-Item Env:CHAMAN_ERA5_PILOT_CONFIRM
```

Un resultado `restored` confirma que Mongo volvio a los hashes previos. Un
resultado `already_restored` confirma idempotencia. Restore puede ejecutarse
otro día: usa el `bridgeToday` sellado y no lo sustituye por la fecha actual.
Cualquier drift, re-key,
borrado, documento creado, conflicto,
error de transaccion o diferencia posterior es un bloqueo: no reintentar
alterando el manifiesto ni editar NDJSON manualmente.

Si la transacción ya confirmó el restore pero el control posterior de índices
falla, la salida es `restored_but_index_postcheck_failed`, con
`databaseMutationCommitted=true` y el error de postcheck. No interpretar ese
recibo como rollback: los datos ya fueron restaurados y corresponde reparar o
auditar el índice sin repetir el restore a ciegas.

La confirmación fuerte ocurre dentro de la transacción. Después de un
`restored`, mantener los escritores congelados y ejecutar `verify` sin
`--record-post-state`. Si ese `verify` detecta drift, significa que hubo una
escritura **posterior** al commit ya confirmado: no volver a ejecutar restore a
ciegas; conservar la evidencia e identificar primero al escritor concurrente.

## Limitaciones deliberadas

- No es un importador Produccion → Testing ni reemplaza el contrato selectivo
  de 21 siembras.
- No crea el binding, no descarga ERA5 y no ejecuta el reproceso.
- Por seguridad inicial exige un establecimiento con un único lote. No sirve
  para establecimientos compartidos hasta implementar restore granular probado.
- La cobertura debe existir completa hasta `to`; por el retraso natural de ERA5,
  elegir como `to` el último día ya materializado, nunca completar huecos a mano.
- Restore exige que IDs, pertenencias y alcance todavía se resuelvan exactamente
  como quedaron sellados; cualquier deriva aborta antes de mutar.
- Los bundles schema v1/v2/v3 quedan deliberadamente incompatibles con este
  flujo schema v4; deben recrearse con el commit exacto que se vaya a ejecutar.
- El worktree debe estar limpio: `codeSha` debe ser el HEAD exacto ejecutado.
- En la imagen desplegada de `testing-datos`, donde Railway excluye `.git`, la
  herramienta acepta exclusivamente `RAILWAY_GIT_COMMIT_SHA`, junto con las
  identidades nativas de proyecto, deployment, servicio y entorno Testing. En
  cualquier otro servicio o entorno falla cerrado; en la PC sigue exigiendo el
  worktree Git limpio.
- `NODE_ENV=production` puede indicar el modo optimizado de Node dentro de esa
  misma imagen de Testing. Sólo se admite con la identidad Railway anterior;
  un entorno Railway productivo o cualquier otro servicio sigue abortando.
- No restaura colecciones de usuarios, tokens, notificaciones, colas, logs,
  dispositivos, ChirpStack, LoRaWAN ni credenciales externas.
- El bundle contiene datos operativos de Testing: debe almacenarse cifrado,
  con acceso limitado y borrado controlado al cerrar el piloto.
