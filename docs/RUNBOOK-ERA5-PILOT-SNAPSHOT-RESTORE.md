# Runbook de snapshot y restauracion del piloto ERA5

## Alcance

Esta herramienta protege **un solo lote con exactamente una siembra activa** en
la base `chaman_testing`. No copia Produccion, no conoce Railway y no permite
otra base. El primer piloto ERA5 no debe ejecutarse si este flujo no termina en
verde.

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
- Resuelve siembra, lote, establecimiento y siembras activas mediante `$lookup`
  en Mongo; exige un solo resultado y `lotes.idSiembra` coherente.
- Exige un unico binding activo del lote y un punto de grilla habilitado.
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

No usar una URI que seleccione Produccion aunque el usuario tenga permisos
limitados. La herramienta verifica el nombre logico, pero la revision humana de
host/proyecto sigue siendo obligatoria.

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
manifiesto. Mantener desactivado el batch general. Verificar metricas y salidas
antes de continuar.

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
- No restaura colecciones de usuarios, tokens, notificaciones, colas, logs,
  dispositivos, ChirpStack, LoRaWAN ni credenciales externas.
- El bundle contiene datos operativos de Testing: debe almacenarse cifrado,
  con acceso limitado y borrado controlado al cerrar el piloto.
