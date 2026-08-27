# Chamán-Meteo — habilitación controlada en Railway Testing

Chamán-Meteo se despliega primero como fuente histórica paralela. No reemplaza
Open-Meteo, FieldClimate ni sensores durante el piloto.

## 1. Migración aditiva

Ejecutar una única vez contra la base **Testing**:

```text
npm run migrate:chaman-meteo:plan
CHAMAN_MIGRATION_CONFIRM=20260827-chaman-meteo-foundation-v1:apply
npm run migrate:chaman-meteo:apply
```

La migración sólo crea colecciones e índices nuevos. El rollback quita los
índices creados pero conserva cualquier dato meteorológico importado.

## 2. Variables compartidas

En `sdc-datos`, `sdc-api-clima`, `sdc-api-cliente` y `sdc-meteo-worker`:

```text
CHAMAN_METEO_INTERNAL_TOKEN=<secreto largo generado para Testing>
```

En `sdc-api-clima`:

```text
CHAMAN_METEO_ENABLED=true
CHAMAN_METEO_IMPORT_ENABLED=false
CHAMAN_METEO_CDS_CONFIGURED=false
CHAMAN_METEO_HISTORICAL_START=2020-01-01
CHAMAN_METEO_CALCULATION_VERSION=chaman-meteo-agro-v1
CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM=0.001
```

En el worker privado `sdc-meteo-worker`:

```text
CHAMAN_METEO_ENABLED=true
CHAMAN_METEO_IMPORT_ENABLED=false
CDS_API_URL=https://cds.climate.copernicus.eu/api
CDS_API_KEY=<secreto nuevo de Copernicus>
CHAMAN_METEO_HISTORICAL_START=2020-01-01
CHAMAN_METEO_CALCULATION_VERSION=chaman-meteo-agro-v1
CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM=0.001
```

La clave CDS se carga **únicamente** en el worker como variable secreta; nunca
en las APIs, Git, comandos de build, logs o formularios del frontend. Después
de comprobar el arranque del worker, marcar
`CHAMAN_METEO_CDS_CONFIGURED=true` sólo en `sdc-api-clima` para que Admin
muestre el estado sin recibir la clave.

## 3. Worker piloto

Crear un servicio privado con `CHAMAN_SERVICE=sdc-meteo-worker`, una sola
réplica y acceso a Redis y `sdc-datos` por red privada. Cargar inicialmente uno
o dos puntos mediante `CHAMAN_METEO_GRID_POINTS_JSON`.

El servicio se construye desde `sdc-meteo-worker/` usando su Dockerfile propio;
al desplegarlo manualmente desde el monorepo se debe usar ese directorio como
raíz del upload.

Primero desplegar con `CHAMAN_METEO_IMPORT_ENABLED=false` y comprobar `/health`
y la tarjeta Admin. Luego habilitar el importador únicamente en Testing.

## 4. Criterios antes de producción

- cobertura horaria sin duplicados ni saltos no explicados;
- humedad relativa contrastada con estaciones/sensores;
- lluvia y radiación verificadas en unidades correctas;
- ET0 marcada como estimada hasta completar validación agronómica;
- prioridad productiva sin cambios: sensor > FieldClimate > fuente de respaldo;
- rollback probado apagando las dos feature flags.
