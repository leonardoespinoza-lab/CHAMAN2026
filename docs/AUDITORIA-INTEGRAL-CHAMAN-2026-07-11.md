# Auditoria integral de CHAMAN 2026

Fecha: 11 de julio de 2026
Alcance: aplicacion web, servicios Railway, rutas, 22 tarjetas, seguridad operativa y coherencia agronomica.
Commit desplegado y verificado: `f6fbb15` (`Alinear riesgo de granizo con pronostico convectivo`).

## 1. Resultado ejecutivo

La aplicacion productiva quedo desplegada sin fallos: los 10 servicios de CHAMAN asociados al repositorio estan en estado `SUCCESS` y `RUNNING` sobre el mismo commit. MongoDB y Redis tambien estan operativos. La portada publica, el dominio alternativo de Railway, la API publica y el FTP respondieron HTTP 200.

La correccion de granizo elimina la contradiccion principal observada: el riesgo ya no se infiere de una probabilidad aislada, sino de una combinacion diaria de tormenta, CAPE, chaparrones/precipitacion y rafagas. La alerta identifica la fecha critica y la tarjeta de clima expone las mismas variables. El caso local reproducido con 0 mm iniciales, tormenta al dia 7, 12,6 mm, 38 % de probabilidad, CAPE 1500 J/kg y puntuacion 68 mostro `Tormenta probable`, fecha critica y prioridad operativa 75 sin confundir ambos valores.

Estado general:

- Operacion Railway: **sana**.
- Coherencia granizo/clima: **corregida y desplegada**.
- Seguridad basica de secretos y logs: **los escaneos pasan**, con dos endurecimientos pendientes.
- Cobertura automatizada: **insuficiente fuera de clima/granizo**.
- Deuda principal de frontend: componentes agronomicos muy grandes, doble instancia de fenologia y un error nulo en la navegacion.
- Servicios no activos: WebSocket, cron e IA de malezas deben declararse formalmente como deshabilitados o desplegarse.

## 2. Criterio cientifico para granizo

La hipotesis de campo es parcialmente correcta: el granizo grande se asocia a tormentas convectivas intensas y, sobre todo, a corrientes ascendentes fuertes y persistentes. NOAA/NSSL explica que el granizo se forma dentro de las corrientes ascendentes de una tormenta y que una corriente mas fuerte puede sostener piedras mayores; las supercelulas favorecen granizo grande, aunque tormentas multicelulares tambien pueden producirlo.

No es correcto exigir siempre un gran acumulado de lluvia en superficie. Una corriente ascendente fuerte puede mantener lluvia y granizo suspendidos, y la precipitacion observada puede variar mucho a pocos kilometros. Por eso el algoritmo debe usar la lluvia/chaparrones como evidencia de fase humeda, pero no como unico interruptor.

Señales actuales, en orden conceptual:

1. Tipo de fenomeno: codigo meteorologico de tormenta.
2. Inestabilidad: CAPE maximo horario.
3. Agua disponible: chaparrones y precipitacion diaria.
4. Organizacion/intensidad: rafaga maxima como indicador indirecto.
5. Probabilidad de precipitacion: contexto, no prueba de granizo.

Limitacion: Open-Meteo no sustituye radar, descargas electricas, avisos oficiales ni observaciones de campo. La puntuacion es un **indice de riesgo**, no una probabilidad calibrada de granizo ni una confirmacion de ocurrencia.

Fuentes oficiales consultadas:

- NOAA/NSSL, [Hail Basics](https://nssl.noaa.gov/education/svrwx101/hail/)
- NOAA/NSSL, [Hail Forecasting](https://www.nssl.noaa.gov/education/svrwx101/hail/forecasting/)
- National Weather Service, [Dissecting a Thunderstorm with Radar](https://www.weather.gov/rah/edu1)

## 3. Evidencia de despliegue y pruebas

### Railway

Servicios sobre `f6fbb15`, todos `SUCCESS` y `RUNNING`:

| Servicio Railway | Funcion | Resultado |
|---|---|---|
| CHAMAN2026 | Aplicacion Angular | OK |
| chaman-api | API publica / BFF | OK |
| chaman-auth | OAuth y usuarios | OK |
| chaman-clima | Pronostico e integraciones meteorologicas | OK |
| chaman-datos | Persistencia y catalogos | OK |
| chaman-externa | Integraciones/NDVI | OK |
| chaman-ftp | Ingreso de imagenes de camaras | OK |
| chaman-lora | Uplinks y sensores | OK |
| chaman-ndvi-worker | Procesamiento satelital | OK |
| chaman-predicciones | Motores agronomicos y alertas | OK |

Infraestructura: MongoDB y Redis `SUCCESS/RUNNING`.

Pruebas HTTP:

| URL | Estado |
|---|---:|
| `https://app.chamanagro.ar` | 200 |
| `https://chaman2026-production.up.railway.app` | 200 |
| `https://chaman-api-production.up.railway.app/health` | 200 |
| `https://chaman-ftp-production.up.railway.app/health` | 200 |

Logs posteriores al despliegue:

- Clima: sin `ERROR`, excepciones ni fallos en las ultimas 300 lineas.
- Predicciones: sin errores de aplicacion; solo advertencia npm por la opcion `production` obsoleta.
- API: sin `ERROR`, excepciones ni fallos en las ultimas 300 lineas.
- Frontend: sirve correctamente; solo advertencia npm equivalente durante el arranque.

### Pruebas locales del cambio

- `sdc-api-predicciones`: 4 pruebas focalizadas del evaluador de granizo, aprobadas.
- `sdc-api-clima`: 1 prueba de mapeo convectivo Open-Meteo, aprobada.
- Compilacion: predicciones, clima, API cliente y frontend aprobadas.
- Prueba visual local: caso conflictivo reproducido y resuelto.
- Suite Angular completa: no es una señal confiable hoy porque contiene imports rotos preexistentes en specs no relacionados.

## 4. Auditoria servicio por servicio

| Servicio/carpeta | Responsabilidad observada | Estado | Hallazgos y riesgo |
|---|---|---|---|
| `sdc-app-chaman` | UI Angular, 58 rutas, roles y modulos agronomicos | Activo | Buena amplitud funcional. Solo 1 de las 22 tarjetas tiene spec propio. Hay un error por `truncateString(null)` y componentes excesivamente grandes. |
| `sdc-api-cliente` | Fachada publica, autenticacion, autorizacion multi-tenant y orquestacion | Activo | Es el perimetro correcto. Tiene 199 endpoints/decoradores y referencias a guards, pero ninguna prueba propia. Mantiene fallback de secreto OAuth `'1'` en fuente. |
| `sdc-auth` | OAuth, clientes, tokens y usuarios | Activo | Salud correcta. Sin pruebas. `CLIENT_SECRET_INICIAL || '1'` debe eliminarse aunque produccion tenga variables validas. |
| `sdc-datos` | Persistencia generica de 40 dominios y catalogos | Activo interno | 229 endpoints y solo 1 spec. No usa guards de aplicacion; hoy se mitiga al no tener dominio publico, pero falta autenticacion servicio-a-servicio. |
| `sdc-api-clima` | Open-Meteo, Meteosource, Meteoblue, OpenWeather, estaciones, FieldClimate y tiles | Activo | Correccion convectiva aprobada. Conserva modulos `clima` y `clima-v2`, indicio de solapamiento. Mucho logging DEBUG/VERBOSE en produccion. |
| `sdc-api-predicciones` | Riego, enfermedades, agroclima, cron de alertas y notificaciones | Activo | Granizo centralizado y probado. Solo 1 archivo spec para un servicio de alto impacto; los motores requieren datasets de validacion agronomica. |
| `sdc-api-externa` | Endpoints externos y ciclo NDVI | Activo interno | El token `NDVI_WORKER_TOKEN` ya se exige en produccion y se valida por header. Sin pruebas automatizadas. |
| `sdc-ndvi-worker` | Descarga, recorte, calculo NDVI, almacenamiento y cola Redis | Activo | Compilacion Python y health correctos. No hay suite automatizada ni prueba contractual visible con externa. |
| `sdc-api-lora` | Dispositivos, uplinks y reportes | Activo interno | Pequeño y operativo; sin tests. Debe validarse deduplicacion, unidades y tiempos de sensor con casos reales. |
| `sdc-ftp` | Recepcion/servicio de imagenes de camaras | Activo publico | Health 200. Superficie pequeña, sin tests. El volumen persistente esta montado. |
| `sdc-websocket` | Eventos en tiempo real y filtrado por tenant | No activo | El codigo tiene endurecimiento de origen/tenant, pero no existe como recurso Railway. Produccion entrega `WS:""`; queda deshabilitado. En local genera reconexiones y errores de consola cada segundo si falta el servicio. |
| `sdc-cron` | Tareas programadas separadas | No activo | Hay 2 tareas y 2 endpoints, README generico y ningun recurso Railway. Debe eliminarse o definirse su funcion frente a los cron ya incluidos en predicciones/clima. |
| `sdc-weed-ai` | Inferencia YOLO experimental de malezas | No activo | Figura en el despachador Railway pero no existe como recurso. Debe mostrarse claramente como experimental/no disponible o desplegarse con modelo real. |
| `sdc-api-admin` | Backend administrativo legado | Legado | 180 archivos TS fuera del build y despliegue actual. Riesgo de confusion y mantenimiento doble. |
| `sdc-web-admin` | Angular administrativo legado | Legado | Angular 12, fuera de la aplicacion productiva consolidada. |
| `sdc-web-cliente` | Angular cliente legado | Legado | Angular 12, fuera de la aplicacion productiva consolidada. |
| `sdc-modelos` | Contratos y logica compartida | Compartido | Ubicacion correcta para el evaluador comun de granizo; requiere versionado/contratos mas sistematicos. |

Escala de pruebas observada en servicios activos: API cliente 0 specs, auth 0, datos 1, clima 1, predicciones 1, externa 0, LoRa 0. Esto es el principal riesgo tecnico transversal.

## 5. Auditoria tarjeta por tarjeta

| # | Tarjeta | Fuente/servicio | Evaluacion |
|---:|---|---|---|
| 1 | Detalle de reporte de lanza | Medicion recibida por `@Input` | Simple y adecuada para inspeccion de sensor. Sin test ni validacion de unidades visible. |
| 2 | Camaras del lote | `FotoService`, serial de camara | Maneja lote sin camara y sin imagenes. Sin test; falta prueba de imagen corrupta/timeout. |
| 3 | Carga fitosanitaria | `LoteService`, siembra/lote | Integra aplicaciones, enfermedad y calidad de dato. Buena explicabilidad; sin test del agregado. |
| 4 | Central meteorologica | Datos incluidos en lote/FieldClimate | Completa: variables canonicas, historial y graficos. 483 lineas; requiere separar adaptacion de variables y visualizacion. |
| 5 | Clima y pronostico | Pronostico incluido en lote | Granizo/clima ya coherentes y tiene el unico spec de tarjeta. Defecto: el boton `Actualizar` no tiene handler `(onClick)`, por lo que no actualiza. |
| 6 | Detalles de siembra | Siembra por `@Input` | Lectura basica y estable. Estados vacios simples. |
| 7 | Dispositivos | Dispositivos del lote | Resume perfiles, suelo, ambiente y conectividad. Falta prueba de unidades y de sensores parcialmente configurados. |
| 8 | Enfermedades | `SiembraService` y motores por cultivo | Funcionalidad valiosa y explicable, con confirmacion manual. 880 lineas y sin test: riesgo alto de regresion y calibracion. |
| 9 | Etapa fenologica (legada) | Datos por `@Input` | No aparece en el detalle actual; duplica la tarjeta nueva y conserva texto con encoding roto. Candidata a retirar. |
| 10 | Etapas fenologicas | `SiembraService` | Amplia: linea de tiempo, cultivos perennes y ajustes manuales. Se instancia dos veces (desktop y mobile) y CSS solo oculta una; puede duplicar calculos/llamadas. 773 lineas, sin test. |
| 11 | Frio termico | `ClimaService`, `ReporteService` | Buena estrategia de sensor/clima y soporte de perennes. 637 lineas, sin pruebas de acumulacion y cortes temporales. |
| 12 | Huella hidrica | `SiembraService` | Expone calidad y datos faltantes. Debe validar balance, unidades y reinicio de campaña con dataset patron. |
| 13 | Malezas | `SiembraService` | Cache, compatibilidad por cultivo y calidad visibles. Motor estadistico sin test de regresion ni IA productiva activa. |
| 14 | Mapa | Geometria del lote por `@Input` | Acotada. Debe probar poligonos invalidos, multipoligonos y lotes sin centro. |
| 15 | Napas | `NapasService` | Pozos regionales, mapa y calidad. Es referencia regional, no medicion del lote; la UI debe mantener esa diferencia muy visible. |
| 16 | NDVI | `ReporteNDVIService`, `LoteService`, worker/externa | Funcionalidad madura con capas, escenas y avisos de calidad. 1307 lineas sin test: mayor deuda de mantenibilidad del frontend. |
| 17 | Rendimiento | Cosecha/siembra por `@Input` | Lectura simple post-cosecha. Conserva encoding roto en estado vacio. |
| 18 | Riego | Prediccion incluida en siembra/lote | Presenta recomendacion y abre detalle; el motor V13 ya tiene fallback sin sensor. Debe comprobarse que la UI no muestre `N/A` contradictorio cuando el fallback esta activo. |
| 19 | Riesgos agroclimaticos | `ClimaService` | Cache, recarga forzada y detalle de calidad. Coherente con el nuevo indice; falta spec propio y calibracion con eventos. |
| 20 | Ultima fertilizacion | `ListadosService` | Navegacion y estado vacio correctos. Sin prueba de orden temporal/campaña. |
| 21 | Ultima fumigacion | `ListadosService` | Similar a fertilizacion; debe comprobar periodo de carencia y consistencia con carga fitosanitaria. |
| 22 | Viento del lote | Pronostico incluido en lote | Buena decision para aplicaciones y pronostico. 330 lineas; sin fuente directa ni boton de refresco independiente. |

## 6. Rutas y flujos

Se detectan 58 definiciones de ruta. Los grupos principales estan correctamente separados:

- Publico: autenticacion.
- Productor: mapa, lotes, detalle, siembra, cosecha, fertilizacion, fumigacion, alertas y establecimientos.
- Distribuidor: tablero y productores.
- Compañia: tablero y distribuidores.
- Administrador: usuarios, estructura comercial, camaras, catalogos, licencias, dispositivos, fenologia, algoritmos, IA malezas y FieldClimate.
- Utilidades: aplicacion y KMZ.

Los scopes de distribuidor, compañia y administrador estan declarados en rutas. La seguridad real debe seguir aplicandose tambien en API; ocultar una ruta o tarjeta no reemplaza un guard de backend.

El detalle de lote organiza las tarjetas en cinco grupos utiles: fenologia, riesgos/recomendaciones, observacion, ambiente y trazabilidad. La estructura es clara, pero varias tarjetas reciben snapshots dentro del lote; por eso la recarga y la fecha de origen deben ser uniformes.

## 7. Seguridad y calidad operativa

Comprobaciones aprobadas:

- `npm run audit:secrets`: sin secretos obvios en fuente versionada.
- `npm run audit:logs`: sin logs sensibles obvios.
- NDVI interno: token obligatorio en produccion y header dedicado.
- Servicios internos de Railway: sin dominios publicos, salvo API/FTP/frontend.
- API publica: guards de autenticacion/roles presentes en la fachada.

Pendientes:

1. Eliminar de fuente los fallbacks `AUTH_CLIENT_SECRET || '1'` y `CLIENT_SECRET_INICIAL || '1'`; producir un fallo inmediato si faltan.
2. Agregar autenticacion servicio-a-servicio para `sdc-datos`, clima, predicciones, LoRa y auth; la red privada es una barrera, no una identidad.
3. Integrar `validate-production-config.js` al arranque Railway; hoy existe, pero `railway-start.js` no lo ejecuta.
4. Bajar DEBUG/VERBOSE de clima en produccion para reducir costo y ruido.
5. Retirar archivos residuales `.backup`, `.new` y `.fixed` del arbol de frontend despues de validar que no se usan.

## 8. Hallazgos priorizados

### P0 - antes de considerar la plataforma cientificamente calibrada

- Crear un dataset historico de eventos: lote/ubicacion, fecha/hora, granizo observado, tamaño aproximado, daño, lluvia, rafaga, CAPE, codigo meteorologico y aviso/radar disponible.
- Medir falsos positivos y falsos negativos del indice por region y estacion. No llamar “probabilidad” al score hasta calibrarlo.
- Construir pruebas de regresion para riego, enfermedades, huella hidrica, frio y fenologia con casos aprobados por agronomia.

### P1 - confiabilidad de producto

- Corregir `truncateString` para aceptar nulos: hoy provoca un error real al entrar con un usuario cuyo nombre visible no esta cargado.
- Conectar el boton `Actualizar` de clima a una recarga real y mostrar hora de actualizacion.
- Evitar la doble instancia desktop/mobile de etapas fenologicas.
- Dividir y probar `card-ndvi`, `card-enfermedades`, `card-etapas-fenologicas` y `card-frio-termico`.
- Decidir formalmente WebSocket, cron e IA malezas: desplegados o deshabilitados/documentados, sin estado intermedio.
- Endurecer secretos y llamadas internas como se detalla arriba.

### P2 - limpieza y mantenibilidad

- Retirar frontend/backend legados y archivos backup una vez archivados fuera del arbol productivo.
- Unificar `clima` y `clima-v2` o documentar su contrato y fecha de retiro.
- Corregir textos con encoding roto y homogeneizar `Quimica`/compañia en el dominio.
- Añadir pruebas E2E por rol para las 58 rutas y estados vacio/error/carga de cada tarjeta.

## 9. Conclusión

El cambio de granizo esta desplegado y operativo, y la representacion ahora es internamente coherente con el pronostico convectivo. La aplicacion posee una base funcional amplia y varias protecciones de calidad visibles, pero su riesgo dominante ya no es el despliegue: es la falta de validacion automatizada y agronomica sistematica en los motores y tarjetas mas complejos.

La siguiente fase recomendada es pequeña y controlada: corregir los tres defectos P1 de interfaz sin tocar los motores, crear la matriz de casos agronomicos y recien entonces recalibrar el indice de granizo con observaciones reales.
