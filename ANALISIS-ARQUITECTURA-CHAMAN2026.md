# Analisis de arquitectura CHAMAN2026

## Veredicto corto

La seleccion tecnologica actual es aprovechable para una primera version real:

- Frontend: Angular moderno en `sdc-app-chaman`.
- Backend: NestJS por servicios.
- Base operativa: MongoDB con Mongoose.
- Integraciones: FieldClimate, ChirpStack/LoRa, NDVI, clima, riego y predicciones separadas por servicio.
- Dominio: usuarios, permisos, productores, distribuidores, quimicas, establecimientos, lotes, siembras, fertilizacion, fumigacion, enfermedades, riego, dispositivos y reportes.

No conviene tirar todo. Conviene ordenar, asegurar y preparar para nube.

## Que conservar

1. NestJS como backend principal.
   Es correcto para APIs, integraciones, workers y servicios separados.

2. Angular para esta etapa.
   Ya esta migrado a una version moderna en `sdc-app-chaman`, tiene rutas, guards, modulo de usuarios, mapa, detalle de lote y vistas por perfil. Reemplazarlo ahora frenaria el avance. Se puede mejorar responsive y UX sin cambiar de tecnologia.

3. OpenLayers para mapas.
   Es una buena eleccion para lotes, poligonos, capas raster/tile, NDVI y trabajo GIS liviano.

4. MongoDB para datos operativos.
   Sirve para usuarios, permisos, lotes, siembras, estaciones, agroquimicos, semillas, predicciones y documentos flexibles.

5. Servicios separados.
   La separacion entre datos, auth, cliente, clima, predicciones, lora, cron y websocket tiene sentido para escalar por partes.

## Lo que hay que reforzar antes de nube

### Seguridad

- Sacar secretos de archivos `env.ts` y moverlos a variables de entorno reales.
- Cerrar CORS por dominio.
- Deshabilitar Swagger publico o protegerlo.
- No permitir bearer token por query string.
- Reducir TTL de tokens y usar refresh token rotativo.
- Auditar permisos por entidad: Admin, Quimica, Distribuidor, Productor y Establecimiento.
- Proteger webhook LoRa con firma/API key fuerte y rotacion.
- Agregar rate limit en APIs publicas.

### Datos historicos de sensores

MongoDB puede servir para arrancar, pero los reportes LoRa y clima historico van a crecer mucho. Recomendacion:

- Corto plazo: MongoDB con indices fuertes.
  - `reportes`: indice `{ deveui: 1, fecha: -1 }`
  - `reportes`: indice `{ idDispositivo: 1, fecha: -1 }`
  - `reportes`: indice `{ estado: 1, deveui: 1, fecha: -1 }`
  - `estaciones`: indice geoespacial y por origen/idExterno
  - `predicciones`: indice por `idSiembra` y `fechaPrediccion`

- Mediano plazo: separar serie temporal.
  - TimescaleDB/PostgreSQL para series de sensores y clima, o MongoDB time-series collections si se quiere mantener Mongo.
  - Mantener Mongo para dominio operativo.

### Ingestion ChirpStack / LoRa

La logica Sentek 9/12 ya existe y entiende reportes parciales. Para produccion necesita:

- Cola de ingreso para desacoplar HTTP/MQTT de escritura en DB.
- Idempotencia por `uplinkId`, `devEui` y timestamp.
- Guardar payload crudo antes de parsear.
- Dead-letter queue para payloads invalidos.
- Versionado de parsers por tipo de dispositivo.
- Observabilidad: cantidad de uplinks, parseos fallidos, latencia, bateria baja.

### FieldClimate y clima

La integracion esta bien orientada: trae estaciones, calcula cercania y busca datos por fecha. Para nube:

- Cachear datos consultados por estacion/rango.
- Persistir historico climatico normalizado.
- Separar credenciales por proveedor.
- Manejar limites de API con cola/rate limiter distribuido.
- Registrar fuente de cada dato usado en prediccion.

### Predicciones y recomendaciones

El motor de enfermedades ya esta separado por cultivo. Para crecer:

- Convertir cada formula en modulo versionado.
- Guardar inputs usados por cada prediccion, no solo resultado.
- Guardar version del algoritmo.
- Permitir re-ejecutar predicciones historicas.
- Agregar pruebas unitarias por enfermedad/cultivo.
- Separar ejecucion sincrona de ejecucion programada por cola.

## Arquitectura recomendada para nube

```text
Angular App
  |
API Gateway / Reverse Proxy
  |
  +-- sdc-api-cliente      Dominio de negocio y permisos
  +-- sdc-auth             Login, tokens, usuarios
  +-- sdc-api-clima        FieldClimate, proveedores clima, estaciones
  +-- sdc-api-predicciones Enfermedades, riego, huella hidrica
  +-- sdc-api-lora         Webhooks/MQTT ChirpStack
  +-- sdc-cron             Jobs programados
  +-- sdc-websocket        Eventos en tiempo real
  |
Redis / BullMQ
  |
Workers de ingesta, prediccion, clima, NDVI
  |
MongoDB operativo + DB historica de series temporales
```

## Decision sobre Angular

No cambiaria Angular ahora.

Motivos:

- La app ya existe y contiene mucho flujo de negocio.
- Angular 20 es moderno.
- Tiene buen soporte para formularios complejos, permisos, dashboards, mapas y aplicaciones empresariales.
- Cambiar a React/Next ahora agregaria riesgo y retraso.

Lo que si haria:

- Mantener Angular.
- Ordenar componentes grandes, especialmente mapa y detalle de lote.
- Mejorar responsive mobile.
- Crear design system propio de Chaman.
- Separar pantallas por perfil: Admin, Quimica, Distribuidor, Productor.

## Prioridad de trabajo

1. Levantar stack local con MongoDB y admin real.
2. Flujo completo: login admin -> crear productor -> login productor -> establecimiento -> lote real -> siembra.
3. Ejecutar prediccion de enfermedades con datos reales o simulados controlados.
4. Conectar FieldClimate con cache local y estacion mas cercana.
5. Conectar ChirpStack/Sentek con payload crudo, parser e historico.
6. Agregar indices y migraciones de datos.
7. Endurecer seguridad para primer despliegue en nube.
8. Preparar Docker Compose local y manifiestos de despliegue.

## Riesgos principales

- Secretos hardcodeados en codigo.
- Historicos de sensores en Mongo sin estrategia de time-series/retencion.
- Pocos tests reales sobre formulas agronomicas.
- Algunos servicios usan versiones diferentes de NestJS.
- Swagger/CORS/tokens necesitan perfil productivo.
- Ingesta LoRa todavia depende de endpoint directo y no de cola durable.

## Conclusion

CHAMAN tiene una base tecnica valida. La decision correcta no es rehacer desde cero, sino convertir el codigo actual en una plataforma robusta:

- conservar dominio y experiencia ya desarrollada;
- limpiar seguridad;
- separar datos operativos de datos historicos;
- introducir colas y workers;
- versionar algoritmos;
- preparar despliegue con Docker, variables de entorno y observabilidad.
