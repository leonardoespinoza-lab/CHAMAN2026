# sdc-meteo-worker

Importador privado de Chamán-Meteo. Descarga ERA5-Land time-series por punto,
conserva la fuente cruda, deriva humedad relativa, VPD, viento y ET0, genera
resúmenes diarios y persiste todo mediante el canal interno de `sdc-datos`.

El worker falla cerrado: requiere `CHAMAN_METEO_ENABLED=true`,
`CHAMAN_METEO_IMPORT_ENABLED=true`, `CDS_API_KEY` y
`CHAMAN_METEO_INTERNAL_TOKEN`. Nunca registra la clave CDS.

Los puntos piloto se cargan con `CHAMAN_METEO_GRID_POINTS_JSON`; por ejemplo:

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

En la primera importacion, `historicalStart` del punto tiene prioridad sobre
`CHAMAN_METEO_HISTORICAL_START`. Los resumenes diarios se reconstruyen desde
todo el hourly persistido de cada dia local afectado, para no perder las horas
que cruzan el limite UTC. Las trazas negativas de precipitacion se conservan en
raw y se normalizan en derived con el umbral QA configurable
`CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM` (0.001 mm por defecto); un
negativo mayor queda excluido del agregado diario y marcado para revision.

El despliegue inicial debe tener una sola réplica y ejecutarse primero en
Railway Testing. Redis agrega un lease por punto para impedir importaciones
simultáneas.
