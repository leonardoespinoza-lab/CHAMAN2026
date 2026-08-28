# Puente historico Chaman-Meteo -> motor agrometeorologico

## Estado de esta version

Esta rama incorpora un primer puente **apagado por defecto**. No ejecuta
reprocesos, no modifica variables de Railway, no usa credenciales y no toca
datos productivos.

El puente actua solamente cuando se cumplen todas estas condiciones:

1. `CHAMAN_METEO_ENABLED=true`;
2. el contrato/versionado v2 de Chaman-Meteo es valido;
3. `CHAMAN_METEO_AGROMET_BRIDGE_ENABLED=true`;
4. el lote o una siembra del contexto esta en una allowlist explicita;
5. existe un `weather_location_binding` activo para ese lote y su punto
   `weather_grid_points` exacto tambien esta activo;
6. el centroide vigente del lote no difiere mas de 1 km del registrado en el
   binding;
7. el diario ERA5-Land tiene todas las horas esperadas (23, 24 o 25 segun la
   zona/fecha) y temperatura minima, media y maxima validas.

Si falta cualquiera de estas condiciones, el puente falla cerrado y conserva
sin cambios las fuentes operativas existentes.

## Jerarquia y ventana

La union diaria conserva esta prioridad por variable:

```text
sensor de campo > central FieldClimate > Open-Meteo > Chaman-Meteo/ERA5-Land
```

ERA5-Land completa exclusivamente valores diarios ausentes; nunca reemplaza
un valor ya aportado por una fuente prioritaria. La union usa `fechaLocal` como
clave, elimina duplicados diarios y persiste como maximo una observacion diaria
por fecha/contexto.

El rango se inicia en la fecha solicitada por el motor (para cultivos anuales,
la siembra) y se limita al inicio historico configurado de Chaman-Meteo. Hoy y
los cuatro dias anteriores quedan reservados a Open-Meteo, al igual que todo el
pronostico. El contrato operativo inicial es por lo tanto:

```text
[siembra, inicio de los ultimos 5 dias) -> ERA5-Land sólo en huecos
[inicio de los ultimos 5 dias, futuro] -> fuentes actuales/Open-Meteo
```

La procedencia queda explicita mediante `fuente=chaman_meteo`, fuente por
variable y flags de proveedor, dataset, punto, version de fuente, version de
calculo, binding verificado y calidad de reanalisis.

## Configuracion (sin valores productivos por defecto)

```text
CHAMAN_METEO_AGROMET_BRIDGE_ENABLED=false
CHAMAN_METEO_AGROMET_LOT_ALLOWLIST=
CHAMAN_METEO_AGROMET_SOWING_ALLOWLIST=
```

Las allowlists son identificadores separados por coma. Activar el flag sin una
allowlist no habilita ningun lote ni siembra.

## Migraciones, lecturas y escrituras

Este cambio no crea colecciones ni requiere una migracion de Mongo. Con el
flag apagado no agrega escrituras al flujo actual.

Al habilitar un piloto, el puente lee `weather_location_bindings`,
`weather_grid_points` y `weather_daily`, y el sincronizador hace upsert en la
coleccion existente `observaciones_meteorologicas`. Si a continuacion se
ejecuta el reproceso completo del motor, ese proceso tambien prepara y activa
una generacion en `indicadores_agrometeorologicos` e
`indicadores_agrometeorologicos_generaciones`; no es una migracion, pero si es
una escritura productiva que exige el snapshot previo por siembra.

## Foto read-only de produccion (2026-08-28)

- 86 siembras activas auditadas.
- 21 sin serie agrometeorologica y con fuente `sin_fuente`:
  19 de trigo y 2 de cebada.
- En el mismo control, 24 trigos y 8 cebadas ya usan `open_meteo`.
- El plan vigente de Mongo en Railway no ofrece backup nativo/PITR.

Allowlist candidata observada (manifiesto humano, **no configuracion activa**):

```text
6a7de0361447da860d8106cc
6a7efa53975346ea77478896
6a7f0139975346ea774793b5
6a806519963c5f88fa62d815
6a8c74e83b0e91ed17836378
6a8c751f3b0e91ed178366f6
6a8c754b3b0e91ed17836a08
6a8c756f3b0e91ed17836fa9
6a8067ef963c5f88fa62f548
6a85f52af9b27f4600038e91
6a8897303b0e91ed177f8e8e
6a8897633b0e91ed177f92b6
6a8897853b0e91ed177f95b2
6a889aff3b0e91ed177fa07f
6a889ada3b0e91ed177f9e14
6a8c3e8b3b0e91ed17830b43
6a8c62773b0e91ed178348f2
6a8ee6ed3b0e91ed17862a7a
6a8c65333b0e91ed17834f54
6a8f3daab68369637d5f0482
6a8f00243b0e91ed17865141
```

## Condiciones previas a cualquier piloto productivo

1. Desplegar y validar primero en Testing.
2. Crear/auditar el binding exacto y la cobertura ERA5-Land desde la siembra
   para un unico piloto.
3. Exportar un snapshot recuperable, por siembra, de observaciones,
   indicadores/generacion activa y predicciones antes del reproceso. La falta
   de PITR vuelve este paso obligatorio.
4. Habilitar una unica siembra y ejecutar un reproceso manual controlado.
5. Confirmar continuidad diaria, temperaturas finitas, GDD completo, fuente
   por variable y ausencia de reemplazos de sensor/FieldClimate/Open-Meteo.
6. Repetir por lotes pequenos; nunca cargar las 21 de una vez.
7. Ante cualquier desvio, apagar el flag. No borrar RAW ni diarios ERA5.

## Criterios de aceptacion para las 21

- las 21 dejan de fallar especificamente por falta de cobertura termica;
- `batch.fallidas=0` para esas siembras en una corrida controlada;
- existe un unico dia por fecha desde siembra hasta el horizonte esperado;
- cada dia historico tiene temperatura minima/media/maxima finitas;
- `gddAccumulationComplete=true` al final del tramo observado;
- no quedan bloqueos `serie_agrometeorologica_canonica` ni
  `incomplete_gdd_accumulation` causados por el hueco historico;
- ninguna variable previa de sensor, FieldClimate u Open-Meteo cambia de valor
  o procedencia;
- una enfermedad puede seguir fuera de ventana o con riesgo cero: no se fuerza
  una alerta, sólo se elimina el bloqueo por datos historicos faltantes.

## Brechas deliberadamente pendientes

- No se crean automaticamente puntos ni bindings; una asociación geografica
  erronea debe seguir requiriendo revision humana.
- No se incluye un comando de reproceso masivo ni se activa la allowlist viva.
- No se implementa en esta rama la exportacion/restauracion de snapshots por
  siembra.
- El puente inicial aporta diarios; el historico horario ERA5 queda fuera hasta
  validar comparaciones contra estaciones y sensores.
- No hay merge, push ni despliegue desde esta rama.
