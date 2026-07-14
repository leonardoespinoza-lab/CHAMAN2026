# Ubicación del lote — GeoRef Argentina

## Objetivo

`Ubicación del lote` clasifica automáticamente el polígono guardado de cada lote dentro de la estructura territorial oficial argentina. El cálculo pertenece al lote y a su geometría, no a una siembra. Una misma resolución se reutiliza mientras no cambien:

- el hash normalizado de la geometría;
- el snapshot oficial de GeoRef;
- la versión del motor de resolución.

El motor no modifica el departamento manual histórico, no cambia las coordenadas utilizadas por Open-Meteo o FieldClimate y no forma parte del motor de suelos. Si el dato manual difiere del resultado oficial, ambos se conservan y se muestra un conflicto explícito.

## Fuente y licencia

- Servicio oficial: [GeoRef Argentina](https://www.argentina.gob.ar/georef).
- Descargas completas: `https://apis.datos.gob.ar/georef/api/v2.0/{recurso}.geojson`.
- Sistema de coordenadas: WGS84 / EPSG:4326.
- Licencia: Creative Commons Atribución 4.0 Internacional.
- Atribución persistida y visible: `Servicio Georef - argentina.gob.ar/georef`.

Recursos sincronizados:

| Recurso local | Recurso GeoRef | Uso |
|---|---|---|
| `provincias` | Provincias | País y provincia por intersección |
| `departamentos` | Departamentos | Partido, comuna o departamento |
| `gobiernos_locales` | Gobiernos locales | Municipio/gobierno local cuando existe oficialmente |
| `localidades` | Localidades | Localidad de referencia y distancia desde el límite |
| `localidades_censales` | Localidades censales | Cobertura geoestadística |
| `asentamientos` | Asentamientos | Pueblo, paraje u otra referencia rural cercana |

GeoRef puede no informar municipio en áreas rurales. Ese `null` es un resultado válido y no se reemplaza por una inferencia.

## Arquitectura

```text
Guardar/importar/editar polígono
              |
              v
normalización + reparación segura + hash estable
              |
              v
evento idempotente lote/geometría/fuente/motor
              |
              v
catálogo GeoRef local versionado en MongoDB
              |
              v
intersección del polígono completo + áreas reales
              |
              +--> provincia / nivel 2 / gobierno local / localidad censal
              |
              +--> distancia desde el borde a localidad y asentamiento
              v
resultado persistido + intersecciones + confianza + advertencias
              |
              v
GET de solo lectura y tarjeta “Ubicación del lote”
```

MongoDB ya era la solución espacial operativa de Chaman (`2dsphere`), por lo que no se agregó PostGIS. Mongo prefiltra candidatos con `$geoIntersects`/`$geoNear`; Turf calcula el área geodésica de la intersección, el punto interior y la distancia al límite. La limitación documentada es que MongoDB no calcula por sí solo porcentajes de solapamiento; ese cálculo exacto para la geometría descargada se realiza en el servicio.

## Persistencia

- `georef_catalog_entities`: entidades oficiales inmutables por snapshot, geometría, atributos originales, fuente, fecha, hash y licencia.
- `georef_catalog_snapshots`: versión, recursos, conteos, checksums y estado.
- `georef_catalog_state`: puntero único al snapshot activo. Su actualización es la activación atómica.
- `lot_administrative_locations`: historial idempotente de resoluciones; una sola queda `isCurrent` por lote.
- `lot_administrative_intersections`: todas las jurisdicciones intersectadas, área y porcentaje.

La importación valida mínimos esperados antes de activar. Si hay error, se marca el snapshot como fallido, se eliminan sus entidades parciales y el puntero activo anterior no cambia.

Un lock distribuido en MongoDB evita sincronizaciones simultáneas entre réplicas. El lock expira para permitir recuperación ante una caída; cada descarga usa timeout y reintentos exponenciales configurables. Un lock ocupado conserva y devuelve el snapshot activo sin duplicar la importación.

### Reparación conservadora de GeoJSON oficial

Durante una prueba real se observaron anillos degenerados y anillos secundarios no contenidos por el exterior en algunos gobiernos locales. La carga:

1. elimina duplicados consecutivos y cierra anillos;
2. descarta sólo anillos con menos de tres vértices únicos;
3. convierte un anillo desconectado en parte independiente de un `MultiPolygon`;
4. conserva el hash de la geometría original y una marca `geometryRepair` auditable.

No se activa el snapshot si una entidad queda sin una geometría reparable.

## Resolución

1. Admite `Polygon` y `MultiPolygon`.
2. Detecta coordenadas `[lat, lon]` invertidas cuando el conjunto coincide inequívocamente con Argentina.
3. Cierra anillos, elimina puntos consecutivos repetidos y rechaza geometrías vacías o sin tres vértices distintos.
4. Canonicaliza anillos y partes para obtener un hash estable aunque cambie el vértice inicial o el orden de un `MultiPolygon`.
5. Calcula superficie real en m² y un punto interior representativo.
6. Prefiltra cada capa por intersección espacial y calcula el solapamiento del polígono completo.
7. Conserva todas las intersecciones y elige la dominante por área.
8. Nombra el nivel 2 como `Partido` en Buenos Aires, `Comuna` en CABA y `Departamento` en las demás provincias.
9. Busca localidad y asentamiento cercanos, pero muestra la distancia mínima desde el límite del lote, no desde el centroide.
10. Usa coincidencia administrativa sólo como desempate entre lugares prácticamente equidistantes; nunca elige una referencia mucho más lejana.

La confianza es versionada y explicable:

- `alta`: provincia y nivel 2 cubren al menos 98% y no hay advertencias territoriales;
- `media`: cobertura principal suficiente pero parcial o con advertencias;
- `baja`: falta una jurisdicción esencial, se usó fallback puntual o hay cobertura insuficiente.

## Eventos y trabajos

Motivos soportados por el contrato `IEventoResolucionUbicacionLote`:

- `lot_created`, `geometry_added`, `geometry_changed`;
- `lot_split`, `lot_merged`;
- `source_version_changed`, `resolver_version_changed`;
- `partial_retry`, `failed_retry`, `backfill`, `manual_retry`.

Los flujos actuales de crear, importar KML/KMZ y editar pasan por `lotes.create/update`, por lo que disparan automáticamente el motor. El contrato deja preparados split/merge para futuros flujos explícitos.

Trabajos:

- sincronización semanal configurable del catálogo;
- sincronización inicial si está habilitada;
- backfill después de una activación o al iniciar;
- resolución inmediata protegida para diagnóstico.

## API

API de cliente, con autorización del tenant:

- `GET /lotes/:id/ubicacion`: lee únicamente el resultado persistido.
- `POST /lotes/:id/ubicacion/reprocesar?force=true`: reintento excepcional; no aparece como cálculo normal en la tarjeta.

Servicio de datos, protegido con `x-chaman-internal-token`:

- `GET /lot-locations/lotes/:id`;
- `POST /lot-locations/lotes/:id/resolve`;
- `GET /lot-locations/admin/status`;
- `POST /lot-locations/admin/sync`;
- `POST /lot-locations/admin/backfill`;
- `POST /lot-locations/admin/sync-and-backfill`.

## Estados de interfaz

La tarjeta se muestra una sola vez después del resumen general y contempla:

- sin geometría;
- pendiente / procesando;
- lista / parcial;
- geometría inválida;
- fuera de Argentina;
- municipio oficial ausente;
- múltiples jurisdicciones;
- conflicto con ubicación manual;
- fuente no disponible / error.

Las distancias se guardan en metros y se redondean sólo al mostrar. No hay botón normal de “calcular”.

## Migración y despliegue

La migración crea únicamente colecciones e índices; no consulta GeoRef ni reescribe lotes:

```powershell
$env:MONGO_URI='<mongo>'
$env:DB_NAME='chaman'
npm run migrate:lot-location:plan
$env:CHAMAN_MIGRATION_CONFIRM='20260714-lot-administrative-location-v1:apply'
npm run migrate:lot-location:apply
```

Rollback:

```powershell
$env:CHAMAN_MIGRATION_CONFIRM='20260714-lot-administrative-location-v1:rollback'
npm run migrate:lot-location:rollback
```

El rollback elimina los índices de esta migración. Sólo elimina colecciones creadas por ella si siguen vacías; si ya contienen snapshots o resoluciones, las preserva para no perder información.

### Variables

| Variable | Servicio | Valor recomendado Testing |
|---|---|---|
| `LOT_LOCATION_INTERNAL_TOKEN` | datos + api-cliente | mismo secreto aleatorio |
| `GEOREF_SYNC_ENABLED` | datos | `true` |
| `GEOREF_BASE_URL` | datos | `https://apis.datos.gob.ar/georef/api/v2.0` |
| `GEOREF_SYNC_CRON` | datos | `15 3 * * 0` |
| `GEOREF_SYNC_STARTUP_DELAY_MS` | datos | `30000` |
| `GEOREF_SYNC_LOCK_TTL_MS` | datos | `1800000` |
| `GEOREF_REQUEST_TIMEOUT_MS` | datos | `120000` |
| `GEOREF_REQUEST_RETRIES` | datos | `3` |
| `GEOREF_RETRY_BASE_DELAY_MS` | datos | `1000` |
| `GEOREF_BACKFILL_LIMIT` | datos | `0` (todos) |
| `GEOREF_LOCALITY_MAX_DISTANCE_METERS` | datos | `100000` |
| `GEOREF_SETTLEMENT_MAX_DISTANCE_METERS` | datos | `25000` |
| `LOT_LOCATION_RESOLVER_VERSION` | datos | `lot-location-v1.0.0` |

Promoción profesional: migración y variables en Testing, deploy de datos/API/web, sincronización, backfill, validación visual y recién después promoción del mismo commit a producción.
