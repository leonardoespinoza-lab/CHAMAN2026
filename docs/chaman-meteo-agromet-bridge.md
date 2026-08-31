# Puente historico Chaman-Meteo -> motor agrometeorologico

## Estado de esta version

Esta rama incorpora un primer puente **apagado por defecto**. No ejecuta
reprocesos, no modifica variables de Railway, no usa credenciales y no toca
datos productivos.

El puente actua solamente cuando se cumplen todas estas condiciones:

1. `CHAMAN_METEO_ENABLED=true`;
2. el contrato/versionado v2 de Chaman-Meteo es valido;
3. `CHAMAN_METEO_AGROMET_BRIDGE_ENABLED=true`;
4. en modo piloto, el lote esta en una allowlist explicita y el contexto
   contiene exactamente una siembra activa; en modo automatico, el conjunto
   solicitado debe coincidir exactamente con todas las siembras activas reales
   del lote;
5. existe un `weather_location_binding` activo para ese lote y su punto
   `weather_grid_points` exacto tambien esta activo;
6. el centroide vigente del lote no difiere mas de 1 km del registrado en el
   binding;
7. las coordenadas del binding, las de la grilla, `distanceKm`, proveedor,
   dataset y timezone son autoconsistentes; la grilla no queda a mas de 15 km;
8. el diario ERA5-Land tiene todas las horas esperadas (23, 24 o 25 segun la
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
clave. Si `weather_daily` devuelve fechas duplicadas, paginacion incompleta o
filas fuera del rango, el lote piloto se bloquea completo: no se elige una fila
arbitrariamente ni se persiste el resultado ambiguo.

El primer puente incorpora solamente variables atmosfericas. Temperatura y
humedad de suelo ERA5 permanecen visibles en el panel historico, pero no se
inyectan en el motor de lotes ni se rotulan como medicion de sonda.

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
CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED=false
CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM=
CHAMAN_METEO_AGROMET_LOT_ALLOWLIST=
```

La allowlist contiene identificadores de lote separados por coma. Con el modo
automatico apagado, activar el puente sin ella no habilita ningun lote.
`CHAMAN_METEO_AGROMET_SOWING_ALLOWLIST` queda deliberadamente sin efecto: una
autorizacion por siembra no puede abrir un contexto meteorologico compartido
con otras siembras.

El modo automatico tiene dos carriles independientes y fail-closed:

- backlog: solamente lotes presentes en `CHAMAN_METEO_AGROMET_LOT_ALLOWLIST`;
- siembras futuras: solamente contextos cuya fecha inicial sea igual o
  posterior a `CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM`.

Si falta una fecha de activacion valida, el modo automatico no incorpora
siembras nuevas fuera de la allowlist. Esto evita que una activacion despliegue
de golpe puntos para todas las siembras historicas activas.

Para cada lote elegible, API Clima exige un país soportado, zona horaria IANA
proveniente de Open-Meteo o de la central asociada y coordenadas validas. El
país se toma primero de la ubicación oficial y, cuando ese dato falta, de una
zona horaria inequívoca de Argentina, Uruguay, Paraguay, Brasil o Chile; nunca
se adivina mediante límites geográficos superpuestos.
Luego ajusta el punto a la grilla ERA5-Land de 0,1 grados, crea una key que
incluye país, coordenadas y zona horaria, registra un binding inmutable y pide
histórico desde la fecha de siembra (nunca antes de 2020-01-01). Si varios
lotes comparten punto, `historicalStart` sólo puede retroceder; nunca se recorta
cobertura existente.

El storage interno permite crear o reactivar un binding explicito mediante
`POST /chaman-meteo-internal/bindings/upsert`. Sigue protegido por el token
interno, admite solamente `locationType=lote`, exige un punto habilitado y
comprueba en servidor que la distancia declarada coincide (tolerancia 100 m)
y no supera 15 km. La identidad fisica de un binding existente es inmutable:
solo puede cambiar `active`. El bridge vuelve a contrastar el binding contra
el centroide actual del lote antes de usar un solo valor.

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

El apagado es efectivo aunque ya existan documentos: antes de calcular o
responder, API Clima retira las variables cuya fuente sea `chaman_meteo`; una
fila sin trazabilidad por variable se descarta completa. Una generacion activa
que uso ERA5 tampoco se expone con el puente apagado: se recupera la serie
legacy estable si existe y, si no existe, se responde `sin_datos`. Mongo conserva
los documentos para auditoria y una reactivacion controlada; el kill switch no
borra evidencia.

## Foto read-only de produccion (revalidada 2026-08-31)

- 86 siembras activas auditadas.
- Los logs de `chaman-clima` identifican exactamente 21 siembras que fallan en
  cada corrida horaria por cobertura termica diaria incompleta: 19 de trigo y
  2 de cebada.
- Las 21 pertenecen a lotes con una unica siembra activa, no tienen
  dispositivos asociados y todavia no poseen una generacion agrometeorologica
  activa utilizable.
- Las 21 tienen coordenadas validas. Veinte resuelven Argentina desde la
  ubicacion oficial; el lote restante queda cubierto por la resolucion
  fail-closed desde su zona horaria IANA, sin inferencia por coordenadas.
- Un lote ya tiene binding y cobertura ERA5-Land completa hasta 2026-08-26;
  los otros 20 permanecen sin binding y deben entrar por tandas.
- No faltan documentos diarios: existen todas las fechas entre la siembra y
  2026-08-26. La revalidacion actual encontro **571 dias** cuyos documentos
  `open_meteo` no contienen simultaneamente temperatura minima, media y maxima.
  En los 21 casos, la primera fecha con cobertura termica completa es
  2026-07-09; los huecos anteriores varian entre 12 y 42 dias por siembra. La
  diferencia respecto de la foto inicial de 2026-08-28 queda conservada como
  evidencia de que el diagnostico debe repetirse antes de cada lote piloto.
- Por eso el puente debe completar variables ausentes dentro de filas
  existentes, no crear una serie paralela ni sustituir valores validos. La
  funcion de merge conserva la prioridad de Open-Meteo y usa ERA5-Land solo en
  esos campos termicos vacios.
- En el mismo control general, 24 trigos y 8 cebadas ya usan `open_meteo` sin
  este bloqueo.
- El piloto exige de todos modos un snapshot logico por siembra, independiente
  de los backups programados de Railway, para permitir una restauracion exacta
  y acotada sin revertir datos de otros clientes.

## Evidencia del piloto no persistente en Testing (2026-08-31)

- Se importaron 69 diarios ERA5-Land completos para un Trigo aislado, desde su
  siembra 2026-05-01 hasta 2026-07-08. Cada diario paso cobertura horaria
  completa y el job quedo `AVAILABLE`; el bridge de Railway permanecio apagado.
- Se reprodujo en memoria el mismo patron productivo eliminando solamente las
  temperaturas de los 69 diarios Open-Meteo. Sin ERA5, los 69 indicadores
  quedaron con `incomplete_gdd_accumulation`, sin acumulado publicable.
- El merge operativo completo exclusivamente temperatura con
  `fuentePorVariable=chaman_meteo`, conservo la precipitacion Open-Meteo en los
  69 dias y produjo `gddAccumulationComplete=true`, sin un solo dia incompleto.
- La compuerta climatica sanitaria quedo lista en 69/69 dias. La variedad
  JURAMENTO conserva `cronograma_referencia` y confianza `referencia`, por lo
  que la compuerta fenologica no abre alertas automaticas. Es una limitacion
  agronomica independiente de la cobertura meteorologica y no se debe ocultar
  ni forzar mediante ERA5.

## Evidencia del piloto persistente y acotado en Testing (2026-08-31)

- El commit `2ed956e345c1c30d259e769ea2d05b0f9aa373ff` se desplego solamente
  en los servicios de Testing. La rama y los servicios de Produccion
  permanecieron en `7b119f0c4d075b36abf08439bc4b59ac9ae4f3b7` durante toda la prueba.
- La vinculacion automatica se habilito exclusivamente para el lote Testing
  `6a5f5132bf400cab88ea2752`; el cron agrometeorologico siguio apagado y no se
  definio una fecha de activacion para siembras futuras.
- El bridge aprovisiono el punto
  `era5-land:ar:-32.7:-62.6:america-argentina-cordoba`, con pais `AR`, zona
  horaria IANA valida, inicio historico 2026-06-01 y binding activo a 2,514 km
  del centro del lote.
- El worker importo dos tramos disponibles, ambos con estado `AVAILABLE`, 100%
  de progreso y sin error: 744 horas desde 2026-06-01 hasta 2026-07-01 y 1.344
  horas desde 2026-07-02 hasta 2026-08-26. La cobertura diaria final fue
  continua: 87 dias, desde la siembra hasta la ultima fecha ERA5 disponible.
- El reproceso manual alcanzo solamente la siembra
  `6a5f514cbf400cab88ea27cd`. Antes y despues se compararon 522 celdas de
  variables resueltas por Open-Meteo: el hash fue identico, no cambio ningun
  valor ni procedencia, no aparecieron fechas duplicadas y ERA5 no sustituyo
  temperaturas ya presentes.
- La generacion agrometeorologica resultante tuvo 91 dias hasta 2026-08-30,
  `gddAccumulationComplete=true` y cero dias con
  `incomplete_gdd_accumulation`. En este piloto persistente no se escribieron
  dias `chaman_meteo` porque Open-Meteo ya cubria las temperaturas; la prueba
  no persistente anterior demuestra por separado que el mismo merge completa
  los huecos termicos y habilita el GDD.
- Al cierre, Produccion conservaba
  `CHAMAN_METEO_AGROMET_BRIDGE_ENABLED=false`, sin aprovisionamiento automatico
  ni allowlist. `chaman-lora` conservaba `LORAWAN_MQTT_ENABLED=true` y no fue
  desplegado ni reiniciado por esta prueba.
- Las 21 siembras productivas no existen en la base de Testing. Por lo tanto,
  esta evidencia valida el comportamiento del codigo y de la infraestructura,
  pero no afirma que las 21 ya hayan sido reprocesadas. Esa aceptacion requiere
  un piloto productivo individual y reversible antes de ampliar por tandas.

Siembras candidatas observadas para mapear primero a lotes elegibles
(manifiesto humano, **no configuracion activa**):

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

Lotes correspondientes para ampliar `CHAMAN_METEO_AGROMET_LOT_ALLOWLIST` por
tandas (**no copiar los 21 de una vez**):

```text
6a7de00c1447da860d810518
6a7efa20975346ea77478747
6a7f0103975346ea774792d8
6a8064c0963c5f88fa62d42a
6a8065b8963c5f88fa62db54
6a806781963c5f88fa62eeae
6a80679c963c5f88fa62efb6
6a8067c2963c5f88fa62f1e4
6a8067d0963c5f88fa62f2bb
6a85f4b5f9b27f4600038c67
6a8896cd3b0e91ed177f8b34
6a8896e33b0e91ed177f8bb3
6a8896fb3b0e91ed177f8c32
6a889a7c3b0e91ed177f9c74
6a889ab53b0e91ed177f9ca8
6a8c3d8d3b0e91ed17830a10
6a8c62393b0e91ed178346ee
6a8c63f73b0e91ed17834c52
6a8c65043b0e91ed17834d91
6a8c66153b0e91ed17835208
6a8eff5b3b0e91ed17864e8a
```

## Condiciones previas a cualquier piloto productivo

1. Desplegar y validar primero en Testing.
2. Crear/auditar el binding exacto y la cobertura ERA5-Land desde la siembra
   para un unico piloto.
3. Exportar un snapshot recuperable, por siembra, de observaciones,
   indicadores/generacion activa y predicciones antes del reproceso. La falta
   de PITR vuelve este paso obligatorio.
4. Elegir un lote que tenga una unica siembra activa, habilitar solamente ese
   lote y ejecutar un reproceso manual controlado.
5. Confirmar continuidad diaria, temperaturas finitas, GDD completo, fuente
   por variable y ausencia de reemplazos de sensor/FieldClimate/Open-Meteo.
6. Repetir por lotes pequenos; ampliar la allowlist por tandas y conservar la
   fecha de activacion de siembras futuras.
7. Ante cualquier desvio, apagar el flag. Las observaciones y generaciones
   ERA5 dejan de influir de inmediato; no borrar RAW ni diarios ERA5.

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

- El aprovisionamiento automatico permanece apagado por defecto y debe pasar
  por Testing antes de definir la allowlist productiva y la fecha de corte.
- No se incluye un comando de reproceso masivo ni se activa la allowlist viva.
- La exportacion/restauracion por siembra existe como herramienta manual y
  fail-closed para Testing (`scripts/era5-pilot-snapshot.js`); no se ejecuta
  automaticamente ni habilita un reproceso.
- El puente inicial aporta diarios; el historico horario ERA5 queda fuera hasta
  validar comparaciones contra estaciones y sensores.
- Publicar esta rama para CI no activa el puente: no hay merge ni despliegue y
  los flags siguen apagados hasta el piloto autorizado.
