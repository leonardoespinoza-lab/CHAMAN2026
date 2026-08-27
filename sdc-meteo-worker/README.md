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

El despliegue inicial debe tener una sola réplica y ejecutarse primero en
Railway Testing. Redis agrega un lease por punto para impedir importaciones
simultáneas.
