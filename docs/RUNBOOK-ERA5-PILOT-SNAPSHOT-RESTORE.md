# Runbook de snapshot y restauracion del piloto ERA5

## Alcance

Esta herramienta protege **un solo lote con exactamente una siembra activa** en
la base `chaman_testing`. No copia Produccion, no conoce Railway y no permite
otra base. El primer piloto ERA5 no debe ejecutarse si este flujo no termina en
verde.

La herramienta es un artefacto de seguridad cherry-pickeable. **No contiene el
bridge ERA5**: debe integrarse sobre la rama que ya contenga foundation + bridge
y verificarse nuevamente allí antes de publicar Testing.

El cierre mutable incluye:

- `siembras` y `lotes`, incluidos sus punteros y ultimas predicciones;
- `observaciones_meteorologicas` del establecimiento durante todo el intervalo
  solicitado (no solo las filas que ya mencionan al lote, porque el upsert se
  identifica por establecimiento, timestamp y granularidad);
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
- Exige índices únicos críticos y cobertura diaria continua
  `chaman-meteo-agro-v2`, con 23-25 horas válidas por día, desde siembra hasta
  el extremo solicitado.
- Escanea secretos y aborta antes de escribir el bundle.
- Archivos NDJSON EJSON, conteos, IDs y SHA-256 por coleccion; manifiesto con
  hash propio.
- Plan, snapshot y verify leen un punto consistente mediante transaccion Mongo
  con `readConcern=snapshot`; no mezclan documentos de momentos distintos.
- Restore requiere transacciones Mongo con `readConcern=snapshot` y
  `writeConcern=majority`. Si el servidor no las soporta, falla sin degradar a
  escrituras sueltas.
- Restore usa compare-and-swap: el estado debe coincidir exactamente con la
  foto post-piloto. Si alguien cambio un documento despues, no escribe nada.
- Una segunda restauracion contra el estado ya restaurado es idempotente.

## Preparacion offline

Instalar las dependencias ya fijadas del servicio Datos:

```powershell
npm --prefix sdc-datos ci
npm run test:era5:pilot:snapshot
```

La URI se entrega solo por una variable local secreta. Nunca se pasa en la
linea de comandos ni se guarda en el bundle:

```powershell
$env:CHAMAN_TESTING_MONGODB_URI = '<URI que termina en /chaman_testing>'
```

Obtener una vez el fingerprint no secreto del endpoint aprobado. El valor sólo
identifica protocolo y host; no incorpora usuario, contraseña, query ni base:

```powershell
$env:CHAMAN_TESTING_CLUSTER_FINGERPRINT = node -e "const t=require('./scripts/lib/era5-pilot-snapshot'); process.stdout.write(t.testingClusterFingerprint(process.env.CHAMAN_TESTING_MONGODB_URI))"
$env:CHAMAN_ERA5_PILOT_SAFETY_ATTESTATION = 'AGROMET_ONLY:CRONS_FROZEN:NOTIFICATIONS_DISABLED:OUTBOX_DISABLED:PUSH_DISABLED'
```

Comparar y registrar ese fingerprint en el acta aprobada de Testing. Si cambia
el endpoint, no actualizarlo automáticamente: volver a verificar proyecto y
cluster. No usar una URI de Producción aunque apunte a una base llamada
`chaman_testing`.

## 1. Plan de solo lectura

```powershell
npm run era5:pilot:snapshot -- plan `
  --operation-id era5-pilot-20260828-lote-01 `
  --lot-id <OBJECT_ID_LOTE> `
  --sowing-id <OBJECT_ID_SIEMBRA> `
  --from <FECHA_SIEMBRA_YYYY-MM-DD> `
  --to <ULTIMO_DIA_QUE_PUEDE_AFECTAR_EL_PILOTO>
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
resultado `already_restored` confirma idempotencia. Cualquier drift, conflicto,
error de transaccion o diferencia posterior es un bloqueo: no reintentar
alterando el manifiesto ni editar NDJSON manualmente.

## Limitaciones deliberadas

- No es un importador Produccion → Testing ni reemplaza el contrato selectivo
  de 21 siembras.
- No crea el binding, no descarga ERA5 y no ejecuta el reproceso.
- Por seguridad inicial exige un establecimiento con un único lote. No sirve
  para establecimientos compartidos hasta implementar restore granular probado.
- La cobertura debe existir completa hasta `to`; por el retraso natural de ERA5,
  elegir como `to` el último día ya materializado, nunca completar huecos a mano.
- No restaura colecciones de usuarios, tokens, notificaciones, colas, logs,
  dispositivos, ChirpStack, LoRaWAN ni credenciales externas.
- El bundle contiene datos operativos de Testing: debe almacenarse cifrado,
  con acceso limitado y borrado controlado al cerrar el piloto.
