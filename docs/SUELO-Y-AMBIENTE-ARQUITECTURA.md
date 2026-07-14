# Suelo y ambiente — arquitectura operativa

Fecha de validación de fuentes: 14 de julio de 2026.

## Decisiones de seguridad agronómica

- El assessment es único por lote y por versión de geometría; nunca por siembra.
- La geometría se normaliza con el mismo motor oficial de ubicación y se identifica por `geometryHash`.
- Los valores manuales, de laboratorio y sensores no se sobrescriben. Una discrepancia se conserva como contraste.
- Fósforo disponible nunca se estima: sin laboratorio se devuelve `No medido`.
- Drenaje no se deriva solamente de textura.
- La API de lectura responde con estado persistido. Si el lote todavía no tiene assessment, encola el cálculo sin bloquear el render; las fuentes externas se consultan en el trabajo asíncrono.
- El balance meteorológico conserva primero capacidad de campo y punto de marchitez confirmados; el agua útil estimada es fallback.

## Fuentes INTA verificadas

El 14-07-2026 se verificaron `GetCapabilities`, `DescribeFeatureType` y un `GetFeature` real del WFS de INTA Digital GEO:

| Registro              | Capa WFS                              | Cobertura              | Atributos comprobados                                                        |
| --------------------- | ------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `inta-ba-50k-v2`      | `geonode:Suelos_BA_50mil_V2`          | Buenos Aires           | unidad, series, capacidad de uso y taxonomía                                 |
| `inta-jujuy-soils`    | `geonode:suelo_jujuy_pj4326`          | Jujuy                  | unidad, taxonomía y capacidad de uso                                         |
| `inta-lerma-soils`    | `geonode:carta_suelos_valle_lerma_ll` | Salta / Valle de Lerma | unidad, series, orden, suborden, gran grupo y capacidad                      |
| `inta-argentina-500k` | `geonode:suelos_argentina_1_500`      | Nacional               | textura superficial/subsuelo, taxonomía, drenaje, profundidad y limitaciones |

El registro está centralizado en `inta-soil-layers.ts`. WFS se usa para atributos y geometrías; no WMS. Cada respuesta se filtra por BBOX y luego se intersecta con el polígono completo para obtener hectáreas y porcentaje real.

## SoilGrids

- Fuente: SoilGrids250m 2.0, ISRIC — World Soil Information.
- Acceso: WCS GeoTIFF; no API REST beta.
- Resolución: 250 m.
- Profundidades: 0–5, 5–15, 15–30, 30–60, 60–100 y 100–200 cm.
- Propiedades: arena, limo, arcilla, densidad aparente, fragmentos gruesos, pH, carbono orgánico, nitrógeno total, CIC, agua a 33 kPa y agua a 1500 kPa.
- Incertidumbre textural: Q0.05, Q0.50 y Q0.95.
- Licencia/atribución: CC BY 4.0; `SoilGrids™ · ISRIC — World Soil Information`.

Las estadísticas se calculan por intersección de cada celda raster con el lote. El valor representativo es la media ponderada por superficie; además se conservan percentiles espaciales, desviación, píxeles válidos, cobertura e intervalo predictivo.

Factores de conversión: [documentación oficial SoilGrids](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html). Acceso WCS: [documentación oficial](https://docs.isric.org/globaldata/soilgrids/wcs.html).

## Textura

1. Se validan arena, limo y arcilla y solo se normalizan a 100 dentro de ±3 puntos (tolerancia al redondeo y remuestreo independiente de las capas WCS).
2. Se calcula la clase USDA completa de doce categorías.
3. Se reduce mediante el mapeo versionado `chaman-7-v1` a las siete clases existentes.
4. La textura canónica inicial representa 0–30 cm con ponderación 5/10/15 cm.

La referencia normativa es el [Soil Survey Manual / triángulo textural USDA NRCS](https://www.nrcs.usda.gov/sites/default/files/2022-09/Soil-Survey-Manual.pdf).

## Persistencia y automatización

- Colección Mongo: `lot_soil_assessments`.
- Unicidad: `loteId`.
- Estados: `pending`, `processing`, `ready`, `partial`, `no_coverage`, `invalid_geometry`, `source_unavailable` y `failed`.
- Reprocesamiento: cambio de polígono, creación, cambio manual relevante, cambio de versión, reintento o backfill administrativo.
- El job es idempotente mediante `resolutionKey` (lote + hash + versiones).
- La migración crea solamente colección e índices; el backfill se ejecuta por separado y de forma controlada.

Variables opcionales:

- `SOIL_INTELLIGENCE_ENABLED`
- `SOIL_INTELLIGENCE_STARTUP_BACKFILL_LIMIT`
- `SOIL_INTELLIGENCE_RECOVERY_LIMIT`
- `SOIL_INTELLIGENCE_CRON`
- `SOIL_INTELLIGENCE_INTERNAL_TOKEN`
- `SOIL_INTA_TIMEOUT_MS`
- `SOIL_INTA_MAX_FEATURES`
- `SOILGRIDS_WCS_ENABLED`
- `SOILGRIDS_TIMEOUT_MS`
- `SOILGRIDS_MAX_CONCURRENCY`

## API y frontend

- Interna: `GET /soil-intelligence/lots/:id`.
- Entradas agronómicas: `GET /soil-intelligence/lots/:id/agronomic-inputs`.
- Cliente: `GET /lotes/:id/suelo-ambiente`.
- Reintento autorizado: `POST /lotes/:id/suelo-ambiente/reprocesar`.
- Tarjeta: una vez por lote, inmediatamente debajo de ubicación oficial.
