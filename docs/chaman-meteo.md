# Chamán-Meteo

## Alcance

Chamán-Meteo es la fuente histórica paralela de Chamán Agro basada en
Copernicus CDS / ERA5-Land hourly time-series. Conserva información horaria
en UTC, calcula variables agronómicas versionadas y genera agregados diarios
en la zona horaria de cada punto.

La integración existente con sensores, FieldClimate y Open-Meteo no se
elimina ni cambia de prioridad durante esta fase. Chamán-Meteo se valida en
Testing antes de conectarlo como fuente operativa de lotes o siembras.

Límite funcional: `2020-01-01`. El worker, las APIs y cualquier reparación
deben rechazar fechas anteriores aunque ERA5-Land disponga de un archivo más
extenso.

## Arquitectura actual

```text
Admin / futuro consumidor agronómico
                  |
            sdc-api-cliente
                  |
             sdc-api-clima
                  |
               sdc-datos
                  |
      colecciones weather_* en MongoDB
                  ^
                  |
      sdc-meteo-worker (privado)
                  |
     Copernicus CDS ERA5-Land time-series
```

El worker es el único componente que recibe `CDS_API_KEY`. La clave no debe
existir en el frontend, las APIs, Git ni los logs.

Las colecciones son aditivas:

- `weather_grid_points`: puntos meteorológicos reutilizables;
- `weather_location_bindings`: relación lógica entre lotes/establecimientos y
  un punto;
- `weather_hourly_raw`: RAW legacy v1, conservado sin escrituras v2;
- `weather_hourly_raw_versions`: RAW v2 por punto, `sourceVersion` y hora;
- `weather_hourly_derived`: cálculos por hora y `calculationVersion`;
- `weather_daily`: agregados por fecha local y versión de cálculo;
- `weather_grid_coverage`: cobertura legacy v1, conservada sin escrituras v2;
- `weather_grid_coverage_versions`: cobertura exacta por punto,
  `calculationVersion` y `sourceVersion`;
- `weather_import_jobs`: trazabilidad de backfill, incremental y reparación.

Los históricos conservan índices compuestos por punto, versión y fecha para
las consultas del panel. Además, `weather_hourly_derived` y `weather_daily`
tienen un índice aditivo por `calculationVersion`: el estado administrativo
cuenta la versión activa en toda la colección y no debe recorrer datos de
versiones anteriores. La migración v2 crea índices aditivos en las colecciones
paralelas versionadas y en las colecciones v2 compartidas de derivados,
diarios y jobs; no modifica índices ni documentos de RAW o coverage legacy.
Jobs conserva un índice por estado para los conteos y otro por versión/fuente
y fecha de actualización para el último diagnóstico y la paginación.

## Variables ERA5-Land descargadas

Se solicitan las 19 variables disponibles en el producto time-series usado:

| Grupo | Variable CDS | Unidad fuente |
| --- | --- | --- |
| Atmósfera | `2m_temperature` | K |
| Atmósfera | `2m_dewpoint_temperature` | K |
| Atmósfera | `surface_pressure` | Pa |
| Precipitación | `total_precipitation` | m |
| Radiación | `surface_solar_radiation_downwards` | J/m² |
| Radiación | `surface_thermal_radiation_downwards` | J/m² |
| Viento | `10m_u_component_of_wind` | m/s |
| Viento | `10m_v_component_of_wind` | m/s |
| Superficie | `skin_temperature` | K |
| Nieve | `snow_cover` | fracción 0–1 |
| Nieve | `snow_depth` (`sde` en CSV) | m de espesor físico |
| Suelo | `soil_temperature_level_1..4` | K |
| Suelo | `volumetric_soil_water_level_1..4` | m³/m³ |

Capas de suelo ERA5-Land: 0–7 cm, 7–28 cm, 28–100 cm y 100–289 cm.

El parser acepta exactamente `snow_depth` o el nombre corto `sde` que entrega
el CSV time-series. No se usan nombres ambiguos de otros productos, por
ejemplo `sd` o `snow_depth_water_equivalent` (equivalente de agua), como alias
de `snow_depth` físico.

## Normalización y cálculos

La versión `chaman-meteo-agro-v2` usa conversiones determinísticas, nunca
inferidas por magnitud:

- K → °C: `K - 273.15`;
- Pa → kPa: `Pa / 1000`;
- m de precipitación → mm: `m * 1000`;
- J/m² → MJ/m²: `J / 1_000_000`.

Los derivados horarios incluyen:

- humedad relativa desde temperatura y punto de rocío, acotada a 0–100 %;
- VPD en kPa;
- velocidad y dirección meteorológica desde U/V a 10 m;
- viento equivalente a 2 m para ET₀;
- radiación neta estimada;
- ET₀ horaria FAO-56, identificada como estimación;
- temperaturas y humedades de las cuatro capas de suelo.

ET₀ y ETc permanecen separadas. Chamán-Meteo calcula ET₀; ETc requerirá Kc,
cultivo y etapa fenológica en el motor agronómico.

Los agregados diarios se reconstruyen desde registros horarios persistidos,
no solamente desde el último lote descargado. Registran horas esperadas (23,
24 o 25 según zona/DST), horas disponibles por métrica, extremos, medias,
acumulados y flags de calidad.

### Convención temporal de acumulados

El producto time-series entrega precipitación y radiaciones desacumuladas a
resolución horaria, pero etiqueta cada valor con el **fin** de su intervalo.
Por eso el registro `00:00` representa el intervalo que terminó en esa
medianoche y pertenece al día civil anterior. Chamán-Meteo conserva ese
timestamp UTC y, al totalizar por zona local, usa intervalos
`(medianoche, medianoche siguiente]`. Las variables instantáneas continúan
perteneciendo a la fecha local de su propio timestamp. Esta separación evita
correr una hora la lluvia, la radiación y ET₀, incluso en días DST de 23 o
25 horas.

Referencia primaria: [ERA5-Land hourly time-series Product User Guide](https://confluence.ecmwf.int/spaces/CKB/pages/536218894/ERA5-Land%2Bhourly%2BAnalysis%2BReady%2BCloud%2BOptimised%2BARCO%2Bdata%2Bon%2Bsingle%2Blevels%2Bfrom%2B1950%2Bto%2Bpresent%2BProduct%2BUser%2BGuide%2BPUG).

### ET₀ horaria

La ecuación horaria es FAO-56 Penman-Monteith (ecuación 53): utiliza
temperatura y punto de rocío, presión, viento convertido a 2 m, radiación
neta y flujo de calor del suelo horario (`0,1 Rn` de día y `0,5 Rn` de
noche). La radiación neta se estima con albedo 0,23, radiación térmica
descendente ERA5-Land y emisión saliente de Stefan-Boltzmann calculada con
temperatura de piel; si falta esta última, se usa temperatura del aire y se
registra un flag explícito. El resultado se identifica como estimado y debe
seguir comparándose contra estaciones antes de ser fuente operativa.

La prueba numérica reproduce el ejemplo 19 de FAO-56 (0,63 mm/h, tolerancia
0,01). Referencia primaria: [FAO-56, capítulo 4](https://www.fao.org/4/X0490E/x0490e08.htm).

## Versionado y reparación

Los datos RAW v2 conviven por punto/fuente/hora en una colección paralela. Los
derivados y diarios conviven por `calculationVersion`, y coverage exige el par
exacto cálculo/fuente. Un worker v1 restaurado sólo observa sus colecciones
legacy; una reactivación v2 recupera su RAW y coverage propios.

Un punto exige coordenadas válidas, país AR/UY/PY/BR/CL y una zona horaria IANA
explícita. Su identidad física (coordenadas, país, zona, provider y dataset) no
puede cambiar bajo la misma key.

Una reparación v2 se habilita sólo de manera explícita y de una sola ejecución:

```text
CHAMAN_METEO_RUN_ONCE=true
CHAMAN_METEO_REPAIR_GRID_POINT=<clave exacta>
CHAMAN_METEO_REPAIR_FROM=YYYY-MM-DD
CHAMAN_METEO_REPAIR_TO=YYYY-MM-DD
CHAMAN_METEO_REPAIR_FORCE=false
```

Los tres parámetros de reparación son obligatorios en conjunto. El rango se
segmenta, ignora la cobertura RAW previa y usa jobs `REPAIR` versionados. Un
job ya `AVAILABLE` no se repite salvo `CHAMAN_METEO_REPAIR_FORCE=true`.
Producción debe conservar estas variables ausentes.
Un repair `RUN_ONCE` con diagnóstico `PARTIAL` o `FAILED` confirmado en
almacenamiento termina sin activar los reintentos `ON_FAILURE` de Railway. Un
error previo o un fallo al persistir conserva exit code no-cero. El operador
debe corregir la causa y disparar deliberadamente una nueva ejecución.

## API histórica actual

Endpoints administrativos paginados:

```text
GET /chaman-meteo/status
GET /chaman-meteo/grid-points
GET /chaman-meteo/jobs
GET /chaman-meteo/hourly?gridPointKey=...&from=...&toExclusive=...&limit=...&offset=...
GET /chaman-meteo/daily?gridPointKey=...&from=YYYY-MM-DD&toExclusive=YYYY-MM-DD&limit=...&offset=...
```

Los rangos son semiabiertos: `from <= instante < toExclusive`. La API de clima
fija la versión de cálculo; el navegador no puede pedir arbitrariamente una
versión antigua.

La creación automática de un punto a partir de las coordenadas de una siembra
sigue fuera de alcance. Existe un primer puente diario hacia el motor
agrometeorológico, pero queda apagado por defecto, exige binding exacto y
allowlist piloto por lote con una única siembra activa y sólo completa huecos
atmosféricos anteriores a la ventana reciente de Open-Meteo. Al apagarlo, sus
variables y generaciones persistidas quedan excluidas de cálculos y respuestas.
Ver `docs/chaman-meteo-agromet-bridge.md`.

## Panel Admin

El módulo Chamán-Meteo permite:

- elegir punto y rango 24 h, 7 días, 30 días o personalizado;
- visualizar atmósfera, precipitación, radiación, viento y cuatro capas de
  suelo;
- distinguir máximos horarios de ráfagas (ERA5-Land time-series no entrega
  ráfagas en este contrato);
- ver fuente, versión, zona horaria, completitud y flags de calidad;
- exportar el contrato cargado a CSV sólo cuando la consulta esté completa.

Los gráficos no conectan huecos y usan la zona horaria del punto. El RAW se
mantiene siempre en UTC.

## Variables de entorno

Comunes o de API:

```text
CHAMAN_METEO_ENABLED=false
CHAMAN_METEO_IMPORT_ENABLED=false
CHAMAN_METEO_INTERNAL_TOKEN=
CHAMAN_METEO_HISTORICAL_START=2020-01-01
CHAMAN_METEO_CALCULATION_VERSION=chaman-meteo-agro-v2
CHAMAN_METEO_SOURCE_VERSION=era5-land-timeseries-19var-v2
CHAMAN_METEO_AGROMET_BRIDGE_ENABLED=false
CHAMAN_METEO_AGROMET_LOT_ALLOWLIST=
```

Exclusivas del worker:

```text
CDS_API_URL=https://cds.climate.copernicus.eu/api
CDS_API_KEY=
CHAMAN_METEO_GRID_POINTS_JSON=[]
CHAMAN_METEO_BACKFILL_DAYS_PER_RUN=31
CHAMAN_METEO_POLL_SECONDS=21600
```

## Secuencia segura de despliegue

1. Compilar y probar modelos, Datos, API Clima, API Cliente, worker y frontend.
2. Publicar una rama aislada.
3. Desplegar en Testing con importación apagada.
4. Aplicar únicamente la migración aditiva de índices en la base Testing.
5. Desplegar primero `sdc-datos`; comprobar que `status` devuelve exactamente
   `chaman-meteo-agro-v2` y `era5-land-timeseries-19var-v2`.
6. Desplegar después API Clima, API Cliente y frontend. La API falla cerrada y
   no presenta conteos v1 como v2 si detecta un `sdc-datos` anterior.
7. Desplegar el worker al final, todavía con importación apagada.
8. Auditar puntos legacy. Si sólo carecen de `countryCode`/`timezone`, el
   upsert controlado los enriquece una vez; cualquier otra diferencia física
   exige una key nueva y nunca se sobrescribe silenciosamente.
9. Ejecutar una reparación v2 acotada para un punto piloto.
10. Validar unidades, cobertura, flags y visualización.
11. Comparar contra Open-Meteo y, cuando existan, sensores de campo.
12. Mantener Producción y la prioridad de fuentes sin cambios hasta aprobación.

El rollback se realiza en orden inverso y con la importación apagada antes de
retirar el worker. RAW y coverage v2 permanecen aislados de las colecciones v1.
Mientras `sdc-datos` v2 convive temporalmente con una API v1, las llamadas de
status/jobs sin versiones se interpretan como vista legacy: RAW/coverage
legacy, derivados/diarios v1 y jobs v1 o previos sin versión. Los conteos v2 no
pueden contaminar el diagnóstico de rollback.

## Validación pendiente antes de reemplazar Open-Meteo

Para coordenadas y períodos controlados se deben comparar temperatura,
humedad, lluvia, radiación, viento, VPD y ET₀ mediante MAE, RMSE, sesgo y
correlación. Una diferencia no implica automáticamente un error: ERA5-Land es
reanálisis de grilla, mientras una estación es una observación puntual. Las
diferencias y el método deberán quedar documentados antes de conectar el motor
sanitario o fenológico a esta nueva fuente.
