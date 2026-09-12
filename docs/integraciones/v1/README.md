# Chamán Integraciones · API v1

Estado: candidata de código y documentación para un piloto en Testing. **No habilitada ni desplegada por este paquete.** No es todavía una oferta productiva con SLA. Fecha: 12/09/2026.

## Una base para varios clientes y servicios

Chamán presta resultados agronómicos procesados. La plataforma externa conserva su experiencia de usuario y sincroniza únicamente los datos acordados. No recibe acceso a MongoDB, al código de los motores ni a las fórmulas.

`appcorteva` es el primer operador previsto en Testing, no una condición del código. El mismo contrato admite distintas integraciones con claves, vencimientos, permisos y carteras independientes.

```text
Plataforma A → clave A → integración A → asesor A → productores → campos → lotes → siembras
Plataforma B → clave B → integración B → asesor B → productores → campos → lotes → siembras
                               ↓
                  Servicio común de fenología
                  resultado + fecha + origen + revisión
```

Una cuenta Asesor es el operador que permite revisar la cartera en Chamán. **No es la credencial de la API.** No se comparte su contraseña ni se mantiene una sesión del navegador. La clave se usa únicamente desde el servidor del integrador, nunca embebida en su app móvil o frontend.

### Modalidades

| Situación | Resolución en esta base |
|---|---|
| Plataforma que crea clientes y campos | Una integración y un Asesor dedicado; permisos de alta, consulta, catálogo y fenología. |
| Integración que sólo consulta | Una integración con permisos de lectura. Sus recursos deben estar previamente dados de alta en ese mismo espacio por una clave con escritura. |
| Varios equipos de una plataforma | Claves rotables del mismo cliente comparten cartera y permisos. Si requieren permisos/carteras diferentes, crear integraciones separadas. |
| Cliente que desea consumir otros algoritmos | Agregar servicios versionados y permisos específicos sobre la misma identidad y recursos. No se habilitan automáticamente. |
| Campos que ya existían antes en Chamán | Vinculación auditada pendiente; no se permite adjuntar un ID interno arbitrario ni apropiarse de datos existentes. |

En el piloto cada integración utiliza un Asesor dedicado. Los identificadores de integración y de ese operador se mantienen estables. Cambiarlos crea otro espacio de recursos; no es un mecanismo de rotación de claves.

## Qué incluye realmente esta primera versión

- Clave independiente de alta entropía; en la configuración del servidor sólo se almacena su hash SHA-256. Hasta tres claves simultáneas por integración para rotación.
- Permisos `estructura:leer`, `estructura:crear`, `catalogos:leer`, `fenologia:leer`.
- Consulta del usuario operador y de su licencia efectiva en cada solicitud. No crea licencias nuevas por productor, ni implementa cobros automáticos.
- Alta repetible y consulta de productores, establecimientos, lotes y siembras por IDs del integrador.
- Catálogo de semillas y variedades para evitar nombres ambiguos.
- Lectura de la fenología procesada con fecha, origen y estado de actualización; no incluye fórmulas ni series internas.
- Cupo configurable de solicitudes por minuto, compartido por todas las claves del cliente; reserva Redis para serializar sus escrituras.
- Activación sólo en entornos no productivos. Apagada por defecto.

## Recorrido del integrador

1. Chamán registra la integración, el Asesor operador, servicios habilitados y vencimiento. La clave se entrega por un canal seguro.
2. Su backend consulta `GET /servicios` y `GET /catalogos/semillas`.
3. Al crear un cliente en su plataforma envía `PUT /productores/cliente-001` con su nombre. **Esto crea un productor, no un usuario con contraseña.**
4. Crea su establecimiento con `productorIdExterno: cliente-001`.
5. Crea el lote con `establecimientoIdExterno`, latitud, longitud y superficie real.
6. Crea la siembra con `loteIdExterno`, `idSemilla` obtenido del catálogo y fecha de siembra.
7. Chamán utiliza su circuito de cálculo existente. El alta de una siembra no garantiza un resultado inmediato.
8. Su backend consulta `/siembras/{idExterno}/fenologia` periódicamente, compara `revision` y actualiza su app. No hace falta que el usuario tenga Chamán abierto.

Todos los IDs externos son estables, sensibles a mayúsculas y únicos **por integración y tipo de recurso**. Admiten 1–80 caracteres alfanuméricos, guion, punto o guion bajo; el primero debe ser alfanumérico. Usar IDs técnicos, no correos, CUIT o nombres de personas.

### Reintentos y cambios

`PUT` en el piloto significa **registrar o confirmar el mismo alta**: mismo ID + mismo contenido normalizado devuelve `creado: false`; no duplica el recurso. Otro contenido sobre un ID existente devuelve 409 sin sobrescribirlo. Un timeout puede ocurrir después de guardar: siempre reintentar con el mismo ID y contenido. Nunca crear otro ID para resolver un timeout.

Una repetición de alta de siembra repara su enlace al lote y confirma el envío al circuito durable de cálculo. Si esto falla, devuelve 503 sin borrar la siembra ya registrada. No es una transacción distribuida: los fallos parciales se recuperan mediante reintentos.

Si existe otra siembra activa en el lote, el alta se rechaza. Cosecha, renombrado, correcciones y archivado se gestionan por ahora desde Chamán. No ejecutar simultáneamente una alta manual y otra por API sobre el mismo lote durante el piloto. La reserva Redis coordina solicitudes de esta API, no reemplaza una transacción entre todos los canales de escritura de Chamán.

## Cómo leer la fenología

| Campo / estado | Significado |
|---|---|
| `etapa` | Etapa del resultado canónico de Chamán; null si no hay una etapa actual utilizable. |
| `origen: observada` | Existe una observación de campo como origen del resultado; `confirmadaEnCampo: true`. |
| `estimada_termica` / `estimada_con_observacion` | Estimación del motor, no una medición de campo actual. |
| `referencia_calendario` / `referencia_termica` | Referencia disponible; no presentarla como observación confirmada. |
| `pendiente` (HTTP 202) | No hay una etapa no-pronosticada y posterior a la siembra. No convertirlo en cero. |
| `desactualizada` | La última fecha de dato tiene más de dos días calendario UTC. Mantener visible la fecha y advertir antigüedad. |
| `cosechada` | La siembra dejó de estar activa o tiene cosecha; el resultado puede ser histórico. |
| `revision` / `ETag` | Identificador de la representación. Se puede reenviar como `If-None-Match`; 304 significa sin cambios. |

Propuesta inicial de consulta: cada 30–60 minutos, escalonando lotes para respetar el cupo. Es una pauta de integración, no una garantía de refresco. La frecuencia efectiva depende del motor, clima, colas y configuración del entorno. El código existente tiene una tarea agrometeorológica horaria condicionada a una bandera; su ejecución real debe verificarse al habilitar el piloto.

Si cambia la revisión, reemplazar los datos de su app. Con 503 conservar la última lectura y marcarla como no actualizada. No mostrar un 304 sin tener una lectura anterior guardada por su aplicación.

## Entorno y archivos

- URL prevista de Testing: `https://testing-api-testing.up.railway.app/sdc-quimica-test/integraciones/v1` (confirmar prefijo al activar).
- [Contrato OpenAPI](openapi.json): endpoints y esquemas; importable en herramientas compatibles.
- [Colección Postman](Chaman-Integraciones.postman_collection.json).
- [Entorno Postman sin secretos](Chaman-Testing.postman_environment.json): completar `apiKey` localmente como secreto; no exportar una copia con su valor.
- [Ejemplo Node de consulta](../../../scripts/integraciones/consultar-fenologia.cjs).
- [Operación y activación](OPERACION.md): alta de integraciones, rollback y validación.
- [Resultados de la validación local](VALIDACION.md): pruebas realizadas y límites de la evidencia.

Los ejemplos de nombres, coordenadas y fechas son ficticios para Testing. Sustituirlos por datos autorizados; no importar carteras reales para probar. Importar la colección no crea datos; ejecutar sus solicitudes PUT sí lo hace.

## Límites explícitos y evolución

No incluidos todavía: publicación en Producción, autoservicio de alta de integraciones, creación de usuarios/login, importación de carteras existentes, cambios/archivado/cosecha por API, polígonos, cultivos perennes, webhooks, exportación masiva, medición facturable o servicios de sanidad, malezas, agua, clima y satélite.

El lote del piloto usa un punto WGS84 real y su superficie declarada; **no inventa un polígono**. No es suficiente para comprometer resultados satelitales sobre la superficie completa. La disponibilidad científica de fenología varía por cultivo y variedad: devolver origen y estado, sin prometer validación para todos los cultivos del catálogo.

Próximas extensiones sugeridas, sin habilitarlas por adelantado:

1. Contrato de actualización y cierre de campañas; vinculación auditada de campos existentes; geometrías reales.
2. Webhook de cambios con firma, reintentos, prevención SSRF, deduplicación y registro de entrega.
3. Nuevos servicios, cada uno con su permiso, costo operativo, contrato público y pruebas de aislamiento.
4. Portal de integraciones, métricas de consumo y planes comerciales acordados. La licencia de la app y el cupo comercial de la API son conceptos distintos.

## Referencias de diseño

La autorización se verifica sobre cada recurso y su jerarquía, siguiendo el riesgo descrito por [OWASP: autorización por objeto](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/). El contrato utiliza los mecanismos de consulta condicional y estados HTTP definidos por [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html). Estas referencias no equivalen a una certificación ni a una auditoría externa.
