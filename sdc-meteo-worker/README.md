# sdc-meteo-worker

Importador privado de Chamán-Meteo. Descarga las 19 variables disponibles de
ERA5-Land time-series por punto y conserva sus unidades de origen en la serie
cruda. La serie derivada agrega unidades operativas (incluidos humedad
relativa, VPD, viento a 2 m, ET0, temperatura de piel y cobertura de nieve) y
los resúmenes diarios informan extremos, promedios o acumulados según la
métrica, además de las horas disponibles por variable. Todo se persiste
mediante el canal interno de `sdc-datos`.

El worker falla cerrado: requiere `CHAMAN_METEO_ENABLED=true`,
`CHAMAN_METEO_IMPORT_ENABLED=true`, `CDS_API_KEY` y
`CHAMAN_METEO_INTERNAL_TOKEN`. Nunca registra la clave CDS.

Los puntos piloto se cargan con `CHAMAN_METEO_GRID_POINTS_JSON`. `countryCode`,
coordenadas y una zona IANA explícita son obligatorios; no existe fallback
silencioso a UTC. Por ejemplo:

```json
[
  {
    "key": "pilot-neuquen-01",
    "latitude": -38.7888,
    "longitude": -68.1043,
    "countryCode": "AR",
    "timezone": "America/Argentina/Salta"
  }
]
```

La version de calculo por defecto es `chaman-meteo-agro-v2` y la fuente cruda
es `era5-land-timeseries-19var-v2`. Ningun punto puede importar antes de
`CHAMAN_METEO_HISTORICAL_START` (2020-01-01 como minimo); si el punto define un
inicio posterior, se respeta el mas reciente. Los resumenes diarios se reconstruyen desde
todo el hourly persistido de cada dia local afectado, para no perder las horas
que cruzan el limite UTC. Las trazas negativas de precipitacion se conservan en
raw y se normalizan en derived con el umbral QA configurable
`CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM` (0.001 mm por defecto); un
negativo mayor queda excluido del agregado diario y marcado para revision.

El despliegue inicial debe tener una sola réplica y ejecutarse primero en
Railway Testing. Redis agrega un lease por punto para impedir importaciones
simultáneas.

## Reparacion v2 controlada

Una reparacion se ejecuta como tarea de una sola pasada y queda desactivada si
no se informan **todos** los parametros. La secuencia segura en Testing es:

```text
CHAMAN_METEO_ENABLED=true
CHAMAN_METEO_IMPORT_ENABLED=true
CHAMAN_METEO_RUN_ONCE=true
CHAMAN_METEO_REPAIR_GRID_POINT=<key existente y habilitada>
CHAMAN_METEO_REPAIR_FROM=2020-01-01
CHAMAN_METEO_REPAIR_TO=2026-08-20
CHAMAN_METEO_REPAIR_FORCE=false
```

No se deben configurar estas variables de reparacion en el servicio continuo
de produccion. El worker divide rangos largos en segmentos de hasta
`CHAMAN_METEO_BACKFILL_DAYS_PER_RUN`, agrega un dia UTC de halo a cada borde
para reconstruir dias locales completos y registra el rango solicitado y el
rango efectivamente descargado. Cada segmento usa un `jobKey` que incluye
tipo, fuente y version de calculo. Un segmento `AVAILABLE` no se repite; para
reintentarlo deliberadamente se requiere `FORCE=true`, siempre junto con
`RUN_ONCE=true`.

Antes de marcar un segmento `AVAILABLE`, el worker exige las 24 horas UTC por
dia y presencia finita de las 19 variables ERA5-Land. Un faltante se persiste
como `PARTIAL`, con diagnostico sin secretos, y no avanza coverage. Las
conversiones v2 son fijas por contrato: K a °C, Pa a kPa, m de
precipitacion a mm y J a MJ. La profundidad fisica de nieve permanece en m.
El request CDS usa `snow_depth`, mientras que el CSV time-series identifica
esa misma magnitud con el nombre corto exacto `sde`. `sd` y
`snow_depth_water_equivalent` no se aceptan como aliases porque representan
equivalente de agua. Una reparacion `RUN_ONCE` que termina `PARTIAL` o `FAILED`
queda registrada y, solo despues de confirmar esa escritura, finaliza sin
reintento automatico de Railway; repetirla requiere una nueva decision
explicita. Un error previo o un fallo al persistir conserva exit code no-cero.

## Coexistencia v1/v2 y rollback

V2 no escribe en `weather_hourly_raw` ni en `weather_grid_coverage`. Esas dos
colecciones y sus indices permanecen reservados al binario v1. El worker v2
escribe RAW en `weather_hourly_raw_versions` (clave unica punto + fuente +
hora) y progreso en `weather_grid_coverage_versions` (clave unica punto +
version de calculo + version de fuente). Las lecturas de coverage y el
recalculo v2 exigen el par completo `calculationVersion`/`sourceVersion`; un
par parcial se rechaza.

La migracion `20260828-chaman-meteo-v2-read-indexes.js` crea solamente indices
en colecciones v2 y no copia, borra ni actualiza documentos legacy. Su rollback
quita exclusivamente los indices creados por ella y conserva los documentos.
Esto permite apagar v2 y volver al worker v1 sin que el RAW o el marcador v2 le
hagan creer que su propia serie esta completa; al reactivar v2, retoma su
coverage exacta.

La identidad fisica de un `gridPointKey` (coordenadas, pais, zona horaria,
provider y dataset) es inmutable. Cambiarla requiere una key nueva o una
migracion explicita; evita mezclar series de ubicaciones diferentes.
