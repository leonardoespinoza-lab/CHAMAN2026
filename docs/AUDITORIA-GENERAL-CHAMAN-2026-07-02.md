# Auditoria general Chaman

Fecha: 2026-07-02  
Alcance: revision funcional, agronomica, de datos, UX, seguridad y despliegue sobre el repo `C:\CHAMAN2026`.  
Modo de trabajo: no se tocaron servicios de produccion, no se hizo push y no se modifico Railway.

## Resumen ejecutivo

Chaman ya tiene una base funcional fuerte: los motores principales existen, hay crons diarios, hay separacion por servicios, hay permisos por nivel, hay captura de alertas, hay graficos de sensores y hay integracion real con clima, satelite, sensores y catalogos agronomicos.

El punto critico no es que "falte todo"; el punto critico es que la plataforma crecio rapido y hoy necesita endurecer estandares para que todo lo que se muestra al cliente sea explicable, trazable y comparable entre lotes. En una demo corporativa grande, los riesgos mas importantes son:

1. Seguridad de servicios internos y WebSocket.
2. Calidad y trazabilidad de inputs climaticos/satelitales/sensores.
3. Tenant/permisos en datos historicos sin ids completos.
4. Estandarizacion visual y de modales.
5. Motores con distinto grado de madurez segun cultivo/servicio.
6. Riego sin fallback profesional cuando no hay lanza/sonda.
7. Alertas todavia muy buenas como estructura interna, pero incompletas como sistema integral de notificacion.

## Prioridades

### P0 - Antes de exponer a auditoria externa fuerte

- Cerrar endpoints internos expuestos: `sdc-datos` y `sdc-api-externa/ndvi/crear-reporte` no deben depender solamente de que Railway sea privado.
- Restringir WebSocket: CORS no debe estar en `origin: '*'` y los mensajes no deben emitirse a todos los usuarios autenticados sin filtro por tenant.
- Agregar token/firma interna al flujo NDVI worker -> API Externa.
- Auditar y migrar registros sin `idQuimica`, `idDistribuidor`, `idProductor` o `idEstablecimiento`; luego endurecer `puedeVer`.
- Implementar fallback V13 de riego cuando no hay sonda, con calidad de dato explicita.
- Unificar un estandar de calidad de dato para todos los motores: sensor campo, estacion asignada, estacion cercana, Open-Meteo, MeteoSource, dato incompleto.
- Hacer que distribuidor/compania usen el centro de alertas y no solo `ultimaPrediccion` sanitaria para pintar riesgo.
- Corregir la carga live de semillas/catalogos en `sdc-datos` para Cebada y otros cultivos. El admin de algoritmos depende de esa base.

### P1 - Profesionalizacion operativa

- Normalizar "Quimica" como "Compania" en UI/API sin romper compatibilidad historica.
- Limpiar textos con problemas de encoding (`Ã`, `Â`, etc.).
- Estandarizar modales, drawers, formularios y cards desde una sola capa global.
- Sacar o esconder KMZ/Aplicacion del menu si ya no forman parte del flujo productivo.
- Resolver mapa: no usar ubicacion de la computadora salvo accion explicita; respetar establecimiento/lote activo al volver.
- Filtrar historicos de sensores ambientales por tramo de asignacion igual que la sonda de suelo.
- Mejorar dashboard distribuidor: mapa con distribuidor, productores, lotes coloreados por atencion y resumen ejecutivo exportable.
- Unificar clima `clima` y `clima-v2` o al menos documentar cual alimenta cada modulo.
- Explicar napas como referencia regional, no medicion del lote.
- Ajustar huella hidrica para mostrar de forma fuerte cuando no hay riego registrado y el azul real queda en cero.

### P2 - Calidad, mantenimiento y performance

- Eliminar archivos residuales `.backup`, `.fixed`, `.new`.
- Reducir deuda visual: fonts chicos hardcodeados, bordes fuertes, colores locales y estilos repetidos.
- Revisar CommonJS warnings del build para mejorar bundle.
- Agregar smoke tests por modulo critico.
- Agregar auditoria CI obligatoria antes de deploy: secretos, logs, config productiva, build.
- Staging formal queda recomendado para V1 estable, tal como se definio con el equipo.

## Estado por servicio

### Frontend `sdc-app-chaman`

Estado: funcional, pero con deuda visual distribuida.

Hallazgos:

- Existe una capa nueva `organic-intelligence.scss`, pero convive con `primeng.scss` y muchos SCSS locales.
- Hay muchos `font-size: 10px`, `11px`, `12px` hardcodeados en componentes de mapa, clima, riego, admin algoritmos y reportes PDF.
- El modo oscuro fue desactivado en helper (`darkTheme` devuelve `false`), pero quedan clases `dark:` y estilos de dark mode en templates/SCSS.
- Existen archivos residuales:
  - `drawer-riego.component.html.backup`
  - `drawer-riego.component.html.fixed`
  - `drawer-riego.component.html.new`
  - `drawer-clima.component.ts.backup`
- El menu todavia conserva rutas/entradas historicas como KMZ/Aplicacion.
- Los modales no estan completamente estandarizados: algunos salen centrados y otros como drawer lateral.

Riesgo:

- No rompe datos, pero si afecta percepcion profesional.
- En campo las letras chicas son un problema real de uso.
- Un cambio visual modulo por modulo puede seguir generando inconsistencias.

Recomendacion:

- Crear un sistema global de clases:
  - `.chaman-page`
  - `.chaman-panel`
  - `.chaman-card`
  - `.chaman-kpi`
  - `.chaman-modal`
  - `.chaman-form`
  - `.chaman-action-card`
- Subir minimo de texto operativo a 14px/15px, labels a 12px/13px solo si son secundarios.
- Evitar bordes laterales gruesos; usar borde 1px, sombra suave, estado por badge/progress.
- Mantener materiales translucidos, pero con contraste suficiente.

### API Cliente `sdc-api-cliente`

Estado: gateway principal correcto, con permisos por modulo y nivel.

Hallazgos:

- Los permisos de cliente estan bastante completos.
- El concepto "Compania" en UI sigue siendo "Quimica" en backend.
- Muchas entidades permiten acceso si el dato historico no tiene id de tenant (`!data.idQuimica`, etc.). Esto es practico para legado, pero riesgoso.
- La autenticacion hacia Auth usa `AUTH_CLIENT_SECRET || '1'` si falta env.

Riesgo:

- Si existen registros viejos sin tenant, un usuario podria ver datos que no deberia.
- Si un deploy productivo queda sin variables, podria usar secretos placeholder.

Recomendacion:

- Crear migracion/auditoria de tenant:
  - contar registros sin ids en lotes, siembras, predicciones, fertilizaciones, fumigaciones, reportes NDVI, distribuidores, establecimientos.
  - completar ids por relacion.
  - luego cambiar `puedeVer` para no aceptar registros sin tenant salvo Admin.

### Auth `sdc-auth`

Estado: login tradicional funcional; Google/Apple deshabilitado por flag.

Hallazgos:

- Google/Apple estan bloqueados salvo `GOOGLE_LOGIN_ENABLED=true`.
- El servicio OAuth aun contiene logica Google/Apple con ids hardcodeados de distribuidor/compania.
- El login normal configura TTL dinamico:
  - 24 h access token / 7 dias refresh.
  - 30 dias access / 60 dias refresh con recordar sesion.
- El constructor de OAuth conserva `accessTokenLifetime` de 10 anios como default y `allowBearerTokensInQueryString: true`.
- `CLIENT_SECRET_INICIAL || '1'` existe como fallback.

Riesgo:

- Google/Apple deshabilitado reduce riesgo actual, pero el codigo debe limpiarse antes de reactivarlo.
- `allowBearerTokensInQueryString` no es recomendable.
- Fallbacks de secretos deben fallar en produccion, no degradar a `'1'`.

Recomendacion:

- Mantener Google/Apple apagado.
- Eliminar hardcodes o moverlos a config segura antes de cualquier reactivacion.
- Deshabilitar bearer token por query string.
- Hacer que Auth falle al iniciar si faltan secretos productivos.

### Datos `sdc-datos`

Estado: servicio central de persistencia. Funcional, pero debe tratarse como interno sensible.

Hallazgos:

- Catalogos y simuladores alimentan el admin de algoritmos.
- `limit: 0` en helpers significa sin limite, no cero resultados.
- Si no aparecen semillas en admin, lo mas probable es:
  - `sdc-datos` live no corrio bootstrap.
  - `CHAMAN_BOOTSTRAP_CATALOGS=false`.
  - DB equivocada.
  - `API_DATOS` apuntando a otro servicio.
  - seed incompleto o fallo silencioso.
- `alertas` CRUD en `sdc-datos` no tiene guard propio.

Riesgo:

- Si `sdc-datos` queda accesible publicamente, hay riesgo serio.
- Un admin de algoritmos sin catalogos genera falsa sensacion de motor incompleto.

Recomendacion:

- Mantener `sdc-datos` solo en red privada.
- Agregar token interno entre servicios o middleware de servicio.
- Agregar endpoint de health/catalog readiness: Cebada, Trigo, Soja, Maiz, enfermedades, malezas, cronos.

### API Predicciones `sdc-api-predicciones`

Estado: es el nucleo de motores. Tiene crons y logica real.

Crons detectados:

- Enfermedades: diario 05:00.
- Malezas: diario 05:30 si esta habilitado.
- Agroclima: diario 06:00 si esta habilitado.
- Riego: diario 09:30 Argentina.

Hallazgos:

- La estructura esta bien encaminada.
- No todos los motores tienen la misma madurez ni el mismo nivel de trazabilidad.
- Las alertas se generan a partir de eventos sanitarios, agroclimaticos y malezas.
- Email/Telegram estan modelados como canales, pero no hay envio real activo.

Recomendacion:

- Centralizar un `MotorRun` por lote/siembra:
  - fecha ejecucion.
  - motor.
  - input source.
  - calidad dato.
  - version formula.
  - salida.
  - alerta generada/no generada.
- Mostrar al usuario "calidad del input" en cada tarjeta predictiva.

### API Clima `sdc-api-clima`

Estado: funcional, pero con rutas y fuentes superpuestas.

Hallazgos:

- Hay rutas `clima` y `clima-v2`.
- Historico/actual puede usar FieldClimate y fallback Open-Meteo.
- Pronostico usa Open-Meteo y MeteoSource fallback segun ruta.
- Algunos textos tienen encoding viejo.
- Hora/fecha deben normalizarse a zona Argentina o UTC con etiqueta clara.

Riesgo:

- Si un modulo usa estacion real y otro Open-Meteo, el usuario puede ver diferencias sin entender por que.

Recomendacion:

- Cada lectura debe exponer:
  - fuente.
  - distancia a estacion.
  - timestamp local.
  - cobertura.
  - fallback usado o no.
  - calidad: alta/media/baja.

### API Externa / NDVI worker

Estado: buen avance en validacion geoespacial, pero falta seguridad interna.

Hallazgos:

- Worker genera imagenes con version `fixed-index-v3`.
- Metadata incluye loteId, bbox, checksum, QA y estadisticas.
- API Externa valida que el bbox de la imagen solape el lote antes de guardar.
- La ruta `POST /ndvi/crear-reporte` esta excluida de autenticacion.
- No se detecto token/firma compartida worker -> API externa.

Riesgo:

- Si el endpoint queda accesible, podria recibir reportes NDVI falsos.
- La validacion geoespacial reduce el dano, pero no reemplaza autenticacion.

Recomendacion:

- Agregar header `X-Chaman-Worker-Token` o firma HMAC.
- Rechazar reportes sin token en produccion.
- Guardar version de motor, source asset y parametros de escala.

### WebSocket

Estado: funcional para invalidar caches y badge de alertas, pero debe endurecerse.

Hallazgos:

- `origin: '*'`.
- El MQTT subscriber envia por defecto a todos los usuarios autenticados.
- El payload incluye `paths`, `method`, `idUser`, `body`.
- El frontend invalida listados por path, pero no todos los dashboards/cards se actualizan solos.

Riesgo:

- Exceso de difusion de eventos.
- Posible exposicion accidental de datos si el body contiene informacion de otro tenant.
- Explica el comportamiento de tener que refrescar manualmente algunas tarjetas.

Recomendacion:

- Filtrar emisiones por `idQuimica`, `idDistribuidor`, `idProductor`, `idEstablecimiento`.
- Mandar eventos livianos: tipo, id, path, tenant, no body completo.
- Hacer que los cards criticos escuchen evento y recarguen su propio datasource.

## Modulos agronomicos

### Etapa fenologica

Estado: mejorada para cultivos perennes, con registro manual protegido.

Hallazgos:

- El backend limita registro manual de etapas a cultivos perennes.
- Para pecan joven, la logica evita proyectar cosecha si la planta no entro a etapa productiva.
- Hay una tarjeta vieja de etapa fenologica con deuda de encoding/timeline.

Riesgo:

- Si quedan componentes viejos en uso, puede mostrarse informacion distinta.

Recomendacion:

- Mantener una unica tarjeta de fenologia.
- Separar claramente:
  - cultivo anual: siembra -> etapas -> cosecha.
  - cultivo perenne joven: implantacion/formacion.
  - cultivo perenne productivo: dormancia -> brotacion -> floracion -> llenado -> cosecha.
- Registrar observaciones de campo como verdad local argentina.

### Frio, acumulacion termica y heladas

Estado: avanzado.

Hallazgos:

- Heladas se activan solo en perennes.
- El dano se calcula segun cultivo, variedad, estadio fenologico y umbrales.
- En plantas jovenes el frio se interpreta para dormancia/brotacion vegetativa, no cosecha.
- Pecan usa referencias de horas frio, HFE, chill portions y grados dia.

Riesgo:

- Las bases varietales de frio/dano deben ser validadas agronomicamente por el equipo.
- El usuario puede confundir "frio acumulado" con "cosecha asegurada".

Recomendacion:

- Mostrar siempre:
  - objetivo biologico del frio.
  - aplica/no aplica a cosecha.
  - edad de planta.
  - ventana sanitaria.
  - calidad/fuente climatica.

### Modulo satelital / indice verde

Estado: tecnicamente mejorado, con validacion por lote en backend y front.

Hallazgos:

- El front filtra reportes por `idLote`, metadata y extent.
- API Externa valida solape bbox contra lote.
- El worker genera metadatos ricos.
- Hay riesgo de endpoint interno sin firma.
- Las escenas con baja QA o cobertura parcial pueden verse "raras" aunque el promedio sea plausible.

Riesgo:

- Si una imagen mal recortada pasa, la confianza del usuario cae rapido.
- Si el endpoint interno es publico, puede contaminar base.

Recomendacion:

- Rechazar escenas con QA baja, area ratio anomala o solape bajo.
- Mostrar QA y cobertura como chip visible.
- Usar escala fija por indice y no autoescala visual por escena sin avisar.
- Mantener auditoria de imagen: fecha, satelite, escena, QA, version render, fuente.

### Riesgos agroclimaticos

Estado: funcional.

Hallazgos:

- Granizo aplica a cualquier cultivo.
- Helada aplica a perennes segun estadio.
- Riesgo se genera desde Open-Meteo/forecast y se convierte en alerta si no es bajo.

Riesgo:

- Granizo y helada dependen de forecast, no de sensor local.

Recomendacion:

- Mostrar "probabilidad operativa" y no certeza.
- Incluir fuente, hora de actualizacion, ventana 24/72h y calidad.
- Separar tarjeta compacta y modal explicativo.

### Riego

Estado: motor V12 solido cuando hay lanza/sonda; incompleto cuando no hay sensor.

Formula actual resumida:

- Input:
  - humedad de suelo por profundidad.
  - textura/capacidad de campo/PMP o estimacion por suelo.
  - raices segun cultivo/etapa.
  - ET0/ETc/Kc.
  - lluvia efectiva/pronostico.
  - historico reciente.
- Salida:
  - agua util.
  - deficit.
  - demanda.
  - recomendacion.
  - calidad.

Hallazgo clave:

- Si no hay humedad de suelo, el motor devuelve fallo: "No hay lecturas de lanza/sonda de humedad de suelo."

Riesgo:

- El usuario ve `N/A`, aunque la plataforma tiene lluvia, ET0, NDVI, NDMI y etapa fenologica.

Recomendacion V13:

- Nivel A: sensor suelo + clima + Kc = recomendacion alta confianza.
- Nivel B: estacion cercana + balance ET0/lluvia + suelo + fenologia = estimacion media.
- Nivel C: Open-Meteo + NDVI/NDMI + fenologia + lluvia = estimacion baja.
- La UI debe decir "estimado sin sensor" y no mezclarlo con recomendacion real de lanza.

### Monitoreo de enfermedades

Estado: funcional, pero madurez desigual por cultivo.

Inputs generales:

- Cultivo.
- Variedad/susceptibilidad.
- Etapa fenologica.
- Humedad relativa.
- Horas de mojado/condiciones equivalentes.
- Lluvia.
- Temperatura.
- Fumigaciones recientes.
- Zona/departamento cuando existe.

Trigo:

- Mancha Amarilla:
  - Ventana: etapas tempranas a hoja bandera segun crono.
  - `DPr`: precipitacion >= 2 mm.
  - `DPrHRT`: precipitacion >= 1 mm, HR >= 80, Tmax <= 32, Tmin >= 8.
  - Formula base: `(-2.25 + 1.62 * DPrHRT + 1.3 * DPr) * resistencia`.
- Mancha de la Hoja:
  - `DPr`: precipitacion >= 10 mm.
  - `DHR`: HR >= 80.
  - Formula base: `(-6.41 + 0.59 * DHR + 2.79 * DPr) * resistencia`.
- Fusarium:
  - Acumula GDA y periodos mojados.
  - Penaliza exceso de Tmax > 26 y Tmin < 9.
  - Formula base: `(20.37 + 8.63 * PMoj - 0.49 * GDN) * resistencia`.

Cebada:

- Enfermedades cargadas:
  - Mancha en Red.
  - Escaldadura de la Cebada.
  - Roya de la Hoja de Cebada.
  - Fusariosis de la Espiga de Cebada.
- Formula operativa:
  - `humedadScore = (HR - humedadBase) / (100 - humedadBase)`.
  - `temperaturaScore = 1 - abs(tempMedia - tempOptima) / tolerancia`.
  - `lluviaScore = (lluviaActual + lluviaAnterior * 0.5) / lluviaCritica`.
  - `indiceDia = 100 * suma ponderada`.
  - `indiceAcumulado = anterior * 0.62 + indiceDia * 0.38`.
  - `riesgo = (indiceAcumulado * 0.72 + diasFavorables * 2 + presionBase) * resistencia`.

Soja:

- Motor enfocado en fin de ciclo.
- Ventana principal R3/R5.

Maiz:

- Motor actual limitado, con roya del maiz como foco principal.

Riesgos:

- Si no hay dato varietal, se usa sensibilidad base y eso debe decirse.
- Si la fuente climatica es Open-Meteo, no equivale a sensor en canopeo.
- Un porcentaje de enfermedad no debe leerse como presencia confirmada; es riesgo/probabilidad operativa.

Recomendacion:

- Cada tarjeta debe mostrar:
  - enfermedad.
  - porcentaje.
  - ventana: dentro/fuera.
  - input principal.
  - calidad.
  - "requiere recorrida" si no hay confirmacion.
- Modal debe explicar inputs y version sin revelar formula completa si es propiedad privada.

### Prediccion de malezas

Estado: funcional y persistida, pero requiere ampliacion de base.

Inputs:

- Cultivo objetivo: trigo, soja, maiz.
- Modelo Gompertz por maleza.
- Temperatura historica y forecast.
- Humedad de suelo si hay sensor; si no, proxy hidrico por clima.
- Lote y siembra.

Formula resumida:

- `HTT diario = max(0, temp - base) * factorHidrico * horas`.
- `factorHidrico = 1 / (1 + exp((theta50 - humedad) / escala))`.
- `emergencia = K * exp(-exp(-beta * (HTT acumulado - mu)))`.

Riesgo:

- Actualmente la base local tiene pocos modelos de malezas.
- La calidad depende mucho de si hay sensor de suelo.

Recomendacion:

- Mostrar calidad: sensor / estimado / incompleto.
- Ampliar modelos por zona y cultivo.
- Generar alerta cuando avance/riesgo cruce umbral.

### Napas

Estado: implementado como referencia regional.

Inputs:

- Coordenadas del lote/establecimiento.
- Pozos SIAS/COHIFE u otra fuente.
- Distancia, fecha, nivel estatico/dinamico, caudal si existe.

Hallazgo:

- Es profundidad desde superficie/terreno, no "altura de agua" sobre el lote.
- No es una medicion directa del lote.

Recomendacion:

- Mapa con pozos cercanos.
- Distancia al lote.
- Fuente y fecha.
- Calidad segun cantidad, distancia y actualidad.

### Fertilizacion y fumigacion

Estado: funcional con permisos y tenant.

Hallazgos:

- Creacion completa tenant desde lote/siembra.
- Fumigacion puede marcar alertas activas como tratadas.
- Algunas validaciones historicas aceptan registros sin tenant.

Riesgo:

- Si los registros historicos estan incompletos, puede haber lectura cruzada.

Recomendacion:

- Migrar tenant.
- Mostrar aplicacion como evento operativo con ingrediente activo, dosis, fecha, lote, usuario y motivo.
- Integrar con carga fitosanitaria y huella gris.

### Huella hidrica

Estado: uno de los motores mas maduros.

Inputs:

- Siembra/cosecha.
- Cultivo.
- Rendimiento seco.
- ET0/Kc/ETc.
- Lluvia efectiva.
- Riego registrado.
- Fertilizaciones.
- Fumigaciones.
- Suelo, pendiente, labranza.

Formula resumida:

- Verde: agua efectiva consumida por cultivo.
- Azul real: deficit cubierto por riego registrado.
- Azul potencial: deficit hidrico no cubierto.
- Gris: carga potencial por fertilizantes y fitosanitarios ponderada.
- Total: verde + azul + gris.

Riesgo:

- Si no hay riego registrado, azul real queda 0 aunque exista deficit potencial.
- Sin rendimiento seco, l/ha existe pero l/kg queda pendiente.

Recomendacion:

- La tarjeta debe separar:
  - agua real registrada.
  - deficit potencial.
  - calidad del calculo.
  - datos faltantes.

### Carga fitosanitaria

Estado: existe y es util, pero debe explicarse mejor.

Inputs:

- Presion sanitaria desde predicciones de enfermedades.
- Carga de aplicaciones.
- Recencia operativa.
- Variedad/cultivo.

Formula resumida:

- `presion = max(enfermedades) * 0.65 + promedio(enfermedades) * 0.35`.
- `cargaQuimica = suma ponderada por dosis, concentracion, persistencia, Koc, recencia`.
- `recencia = aplicacionesUltimos30Dias * 25`.
- `score = presion * 0.45 + cargaQuimica * 0.45 + recencia * 0.10`.

Riesgo:

- El usuario puede comparar mal una enfermedad al 7% con presion sanitaria 75/100 si no se explica agregacion.

Recomendacion:

- Cambiar copy:
  - "Presion sanitaria agregada".
  - "Riesgo por enfermedades vigentes".
  - "Carga por aplicaciones".
  - "Recencia operativa".
- Mostrar trazabilidad al hacer click.

### Clima y pronostico

Estado: funcional, pero debe estandarizar fuente y calidad.

Hallazgos:

- Central meteorologica deduplica variables y prioriza canonicas.
- Puede haber fuente FieldClimate, Open-Meteo o MeteoSource segun ruta.
- La hora debe mostrarse siempre con zona y no mezclarse UTC/local.

Recomendacion:

- Unificar `ultimaActualizacion`.
- Mostrar fuente y cobertura.
- Evitar duplicados de temperatura/humedad con nombres tecnicos distintos.

### Sensores de suelo

Estado: buen avance.

Hallazgos:

- La reasignacion de sensores conserva historico por DevEUI.
- El grafico de suelo filtra desde `fechaAsignacionLote`.
- Esto es correcto: no hay que borrar historicos al reasignar.
- La estacion ambiental/grafico ambiente no filtra igual por tramo de asignacion.

Recomendacion:

- Mantener historico tecnico completo por sensor.
- Mostrar tramo operativo actual por lote.
- Agregar selector:
  - tramo actual.
  - historico completo.
  - periodo anterior.
- Aplicar igual a sensores ambientales.

## Seguridad

### Hallazgos fuertes

- `sdc-api-externa` excluye auth en `POST /ndvi/crear-reporte`.
- `sdc-websocket` permite CORS `origin: '*'`.
- MQTT/WebSocket puede emitir mensajes a todos los usuarios autenticados.
- `sdc-datos` tiene controladores internos sin guard en entidades sensibles.
- OAuth permite bearer tokens en query string.
- Existen fallbacks de secretos a `'1'` en servicios.
- Google/Apple estan deshabilitados, pero el codigo OAuth social conserva hardcodes.

### Recomendacion de seguridad

1. Validar variables productivas en arranque, no solo con script.
2. Usar red privada Railway para servicios internos.
3. Agregar tokens internos entre servicios.
4. Restringir WebSocket por origen y tenant.
5. Quitar body completo de eventos broadcast.
6. Migrar registros legacy sin tenant.
7. Mantener Google/Apple off hasta redisenar flujo.
8. Deshabilitar tokens por query string.
9. Mantener secretos fuera del repo. El scan de tracked source paso.

## Despliegue y build

Comandos ejecutados localmente:

- `npm run audit:secrets`: OK.
- `npm run audit:logs`: OK.
- `npm run build`: OK.
- `npm run audit:prod-config`: requiere servicio. Validado por servicio con env local; falla por variables faltantes esperables localmente.

Warnings del build:

- CommonJS/AMD optimization bailout en librerias como Highcharts, JSZip, file-saver, geotiff/xml-utils/lerc.
- No bloquea deploy, pero conviene optimizar luego.

Validacion productiva local:

- Para API/Auth/Datos/Predicciones/Clima/Externa/Web/Worker faltan variables porque se corrio en local.
- El script ya exige:
  - `SWAGGER_ENABLED=false`.
  - `CORS_ORIGINS` explicito.
  - secretos no placeholder.
  - advertencia si APIs internas usan dominios publicos Railway.

Recomendacion:

- Agregar este script como predeploy/CI por servicio.
- Agregar check especifico para token interno NDVI worker.

## Plan de trabajo recomendado

### Sprint 1 - Cierre critico

1. Seguridad interna NDVI/API Externa.
2. WebSocket con tenant filtering y CORS.
3. Migracion/auditoria tenant de registros viejos.
4. Riego V13 fallback estimado.
5. Calidad de dato universal.
6. Fix catalogos `sdc-datos` live y admin algoritmos.

### Sprint 2 - Experiencia ejecutiva

1. Dashboard distribuidor/compania basado en alertas reales.
2. Mapa con lotes coloreados por atencion.
3. Export PDF ejecutivo por distribuidor/compania.
4. Modales/drawers estandarizados.
5. Menu limpio por rol.

### Sprint 3 - Profesionalizacion agronomica

1. Validar bases varietales de frio/heladas.
2. Expandir malezas por zona/cultivo.
3. Completar soja/maiz/enfermedades con el mismo rigor de cebada/trigo.
4. Formalizar formulas por motor con versionado.
5. Registrar observaciones de campo para calibracion.

### Sprint 4 - Calidad continua

1. Tests smoke por servicio.
2. CI con build/audits.
3. Observabilidad de crons.
4. Reporte de health por motor.
5. Staging formal cuando V1 este estable.

## Conclusion

Chaman esta en una etapa muy buena para convertirse en una plataforma profesional de inteligencia agronomica. El producto ya tiene mucha logica real, pero ahora necesita una capa de control: fuente, calidad, trazabilidad, version de formula, tenant y alerta.

La recomendacion principal es no seguir agregando servicios sin antes estandarizar el contrato de cada motor:

`inputs -> calidad de dato -> formula versionada -> salida -> alerta -> trazabilidad -> permiso`

Si se ordena eso, cada modulo puede crecer sin perder confianza.
