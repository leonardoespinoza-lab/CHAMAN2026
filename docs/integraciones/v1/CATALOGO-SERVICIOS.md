# Catálogo completo de servicios de integración

Fecha: 2026-09-12. Estado: implementación local del catálogo administrativo, sin push ni despliegue.

## Qué cambia

El panel incluye 27 servicios, agrupados y buscables. Historial meteorológico y pronóstico son selecciones distintas. Cada cliente conserva su cuenta, cupos, vencimiento y permisos; no se le agregan servicios automáticamente. La selección comercial no cambia licencias ni activa cobros.

Hay dos conceptos separados:

- `scopes`: permisos de rutas externas implementadas (estructura, catálogo y fenología). Continúan siendo los mismos cuatro; las rutas y los algoritmos no se cambian aquí.
- `requestedServices`: solicitudes administrativas opcionales para los otros servicios. Se pueden registrar, consultar, editar y quitar. No son permisos ni servicios consumibles, y no aparecen como disponibles en `GET /servicios` ni en el instructivo del cliente.

El formulario indica **Conectado en esta versión** o **Pendiente de conexión API**. Conectado no significa desplegado ni científicamente validado para cualquier cultivo. La paridad fenológica API/pantalla sigue siendo requisito previo del piloto productivo, según `VALIDACION-PREPRODUCCION.md`.

## Inventario y fuentes internas

| Grupo | Servicios del catálogo | Base existente que debe adaptar la API externa |
| --- | --- | --- |
| Estructura y cultivos | Productores/establecimientos/lotes/siembras; catálogo de cultivos/semillas; fenología | `sdc-api-cliente/src/integraciones/controller.ts`, `service.ts`, `phenology.ts` (rutas externas actuales) |
| Sanidad y manejo | Nacimiento de malezas; enfermedades; viento y ventana de aplicación | `entidades/lote`, `entidades/siembra`, `entidades/prediccion`, `entidades/clima`; modelos `maleza.ts`, `prediccion.ts` |
| Agua y suelo | Riego; evapotranspiración; balance/estrés hídrico; huella hídrica; perfil de suelo y ambiente | Modelos `prediccion-riego.ts`, `agrometeorologia.ts`, `siembra.ts`, `suelo-inteligencia.ts`; servicios de siembra y lote |
| Meteorología | Actual; histórico; pronóstico; temperatura/humedad de suelo; frío/acumulación térmica; riesgos agroclimáticos | `entidades/clima`, `entidades/chaman-meteo`, `entidades/siembra`; series meteorológicas canónicas |
| Satélite y dispositivos | Índices satelitales; sensores/estaciones; napa; cámaras | `entidades/reporte-ndvis`, `entidades/dispositivos`, `entidades/estacion`, `entidades/napas`, `entidades/camara` |
| Registros y seguimiento | Fertilizaciones; fumigaciones/carga fitosanitaria; registros/fotos de campo; visitas; informes; alertas | `entidades/fertilizacion`, `entidades/fumigacion`, `entidades/foto`, `entidades/visita-lote`, `entidades/reportes`, `entidades/lote`, `entidades/alerta` |

Las rutas `entidades/` son módulos internos de `sdc-api-cliente/src`, **no URLs habilitadas para claves de integración**. No se reutilizan como accesos públicos sin adaptador y pruebas. El catálogo no incluye gestión de contraseñas, usuarios administrativos, credenciales de equipos, acceso a Mongo ni descarga de algoritmos.

## Requisitos de cada conexión externa

1. Definir resultado, unidades, fecha, origen, calidad y estado de disponibilidad. Datos faltantes no son cero. No llamar porcentaje de enfermedad observada a un índice ambiental.
2. Aislar por cuenta/cartera e ID externo, verificando propiedad de toda la cadena de recursos. No aceptar IDs internos arbitrarios ni consultas libres de Mongo.
3. Proyectar campos explícitos: nunca devolver documentos completos, fórmulas, coeficientes, umbrales internos, trazas o credenciales. No alterar los motores existentes.
4. Mantener permisos separados por servicio y, cuando corresponda, por lectura/escritura. La configuración del asesor y su plan siguen limitando el acceso.
5. Históricos con rango, resolución y paginación acotados; pronósticos con fecha de emisión y horizonte. Revisar derechos de redistribución de la fuente antes de entregar datos de proveedores.
6. Consultas no deben lanzar cálculos costosos ilimitados. Distinguir consulta, cálculo, registro y notificación. Cámara, sensores y riego no conceden control de hardware.
7. Medir cada operación autenticada, además del cliente, y probar límites, errores y aislamiento. Los contadores operativos actuales no son facturación, bytes transferidos ni número de ejecuciones de algoritmo.
8. Documentar únicamente rutas reales; actualizar contrato/OpenAPI, ejemplos y pruebas. Comparar los resultados con Chamán antes de la habilitación productiva.

La meteorología y malezas deben poder consultarse para lotes sin siembra. Satélite necesita polígonos reales: el alta de lotes v1 actual sólo recibe centro y superficie. Ninguna de esas restricciones se oculta en el panel.

## Compatibilidad y despliegue

`requestedServices` es opcional y tiene una lista cerrada de códigos pendientes, sin duplicados. Las altas anteriores siguen siendo válidas sin este campo. Un envío anterior que lo omite no lo borra; una lista vacía explícita retira las solicitudes. La revisión/CAS y auditoría existentes siguen protegiendo las ediciones.

`GET /admin/integraciones` agrega `serviceCatalog`; no cambia el contrato de autenticación. El cliente web muestra un aviso y no permite solicitar ampliaciones si el servidor aún no publica ese catálogo. Deben promoverse las versiones compatibles de Datos, API y Web por Git después de aprobación y pruebas, sin cambiar otros servicios.

**No se deben convertir automáticamente solicitudes en permisos** al implementar un adaptador futuro. La habilitación efectiva exige revisión y guardado explícito de permisos por administrador. Agregar una fila al catálogo nunca crea una ruta pública.

## Orden de continuación

Primero cerrar paridad del piloto de fenología. Luego conectar malezas, enfermedades, riego y meteorología histórica/pronosticada como prioridades pedidas; continuar con agua/suelo, satélite/sensores y registros. Todos están contemplados, pero 24 necesitan su adaptador externo. Este cambio no afirma que ya puedan consumirse.

## Validación local realizada

- API: 88 suites, 512 pruebas aprobadas. Datos: 74 suites, 588 pruebas aprobadas. Web: 515 pruebas aprobadas.
- Construcciones de modelos, API, Datos, web de producción y vista previa: aprobadas. Advertencias existentes de CommonJS/ts-jest, sin errores de compilación.
- HTTP y Mongo **aislados y temporales**: guardado y recuperación de solicitudes, concurrencia, permisos efectivos sin ampliación, claves, revocación y consumo; 6 pruebas aprobadas. No usa las bases configuradas de Chamán.
- Prueba visual del componente real con datos ficticios: 27 tarjetas; selección y guardado independiente de los cinco servicios pedidos; búsqueda sin perder selecciones; instrucciones sin rutas ficticias; escritorio 1366 px y móvil 390 px sin desbordamiento ni errores JavaScript. Recursos externos bloqueados.
- Contrato/OpenAPI/Postman: 3 pruebas aprobadas. Auditorías de secretos, logs sensibles y topología: aprobadas.
- Sin cambios en motores agronómicos, mapas, atribuciones, estilos globales, rutas de integración, licencias ni datos reales. Sin push, variables de Railway ni despliegue.
