# Preparación local para App Store 1.6.0

## Alcance y estado

Rama: `codex/ios-store-compliance-2026-09-07`, basada en `e13a497` (preparación de la compilación 4). No incluye cambios de la rama raíz de diagnóstico Sentek.

Preparado localmente, **sin push, sin despliegue, sin nueva compilación subida, sin envío a revisión y sin borrar datos reales**.

- Créditos visibles en los mapas de OpenLayers con Esri World Imagery y World Boundaries and Places. No se cambiaron proveedores, URL de teselas, geometrías, índices ni lógica agronómica.
- Manifiesto iOS: agrega dirección física; nueve tipos de datos funcionales, vinculados a identidad, sin tracking. Coincide con la declaración que se guardó en App Store Connect.
- Cuenta y privacidad: iniciar y consultar una solicitud de eliminación de la cuenta completa desde la app, también con rol Lectura.
- Bandeja central de solicitudes, sólo para Admin/Admin.
- El backend guarda la solicitud y el comprobante. **No ejecuta la eliminación** ni llama al archivado existente de usuarios. El cumplimiento requiere atención humana y eliminación efectiva, con confirmación al usuario.
- Política pública y página de eliminación preparadas en otro repositorio, rama `codex/institutional-privacy-2026-09-07`. Las páginas existentes y los 69 archivos recuperados quedan intactos en disco; el servidor sustituye sólo la política y añade navegación directa a ella para evitar que el bundle institucional antiguo muestre su texto de 2025.

## Confirmaciones del responsable

El usuario confirmó `info@chamanagro.ar` como correo atendido y la capacidad de completar solicitudes verificadas en hasta 30 días. Los plazos legales menores tienen prioridad: 30 días es un máximo operativo, no una interpretación de la ley.

Confirmó uso de datos exclusivamente para servicio y soporte, sin publicidad ni red social/chat entre usuarios. También respondió afirmativamente respecto de las cuentas/licencias comerciales Esri y Open-Meteo. **No se inspeccionaron contratos ni sus alcances.** OpenLayers es BSD; eso no licencia las imágenes de Esri. Conservar evidencia de los derechos de uso antes del envío.

## Seguridad y persistencia

- `GET/POST /cuenta/privacidad/eliminacion`: identidad tomada del token ya validado. No se admite ID de otra cuenta, estado, fechas ni campos arbitrarios en POST.
- Confirmación explícita `ELIMINAR MI CUENTA`; se valida también en servidor.
- `GET /cuenta/privacidad/solicitudes?page=N`: restringido a Administración central, páginas de 50.
- Servicio interno `/privacy-requests`: un token dedicado compartido **sólo entre chaman-api y chaman-datos**, nunca en frontend, git ni logs. Nombre: `PRIVACY_REQUESTS_INTERNAL_TOKEN`, mínimo 32 caracteres, generar aleatoriamente en el gestor de secretos.
- Sin ese token ambos extremos fallan cerrados. No configurar ni desplegar durante esta preparación.
- Colección nueva `privacy_requests`: clave primaria determinística por cuenta, inserción atómica con `$setOnInsert`. Los reintentos no cambian la fecha original ni duplican la solicitud. No hay TTL ni purga automática.
- La API pública conserva su AuthenticationMiddleware, permisos y protecciones HTTP existentes. El servicio interno rechaza llamadas sin el secreto dedicado.
- No se modificaron licencias, permisos existentes, Mongo real, DNS, Railway ni servicios agronómicos.

## Procedimiento humano indispensable antes de habilitar

1. Leonardo/Administración debe revisar diariamente **Cuenta y privacidad → Gestión de solicitudes**. La bandeja no envía correo automático ni tiene un worker de borrado.
2. Usar el ID del comprobante para localizar la cuenta. Verificar la autenticación y el correo de contacto sin solicitar contraseña. No exigir otro contacto al usuario para aceptar una solicitud ya autenticada.
3. Inventariar datos de la cuenta: identidad, sesiones/tokens, permisos, dispositivos de notificación, fotos, videos, audios, archivos y contenido aportado, incluyendo contenido compartido. No equivale a archivar al usuario.
4. Separar contenido perteneciente a terceros de datos personales del solicitante. Compartir contenido no basta para justificar retenerlo. Documentar toda obligación legal de conservación, su finalidad y plazo. Revisar contratos/cobros sin borrar establecimientos de otras personas.
5. Preparar y revisar una operación específica, de alcance acotado y verificable. Esta rama no implementa esa operación destructiva ni autoriza ejecutarla.
6. Ejecutar la eliminación efectiva de los datos que correspondan, revocar sesiones y accesos, y verificar que no se reactiven desde respaldos. El procedimiento de restauración debe reaplicar las supresiones pendientes.
7. Enviar confirmación al correo verificado con fecha, alcance y cualquier conservación legal justificada. Registrar evidencia mínima protegida. **No marcar como resuelta sólo porque la solicitud fue recibida.**
8. Retirar de la bandeja el registro ya resuelto mediante un procedimiento auditado; no mantener datos personales indefinidamente en el ticket. Definir con el responsable el plazo de esa evidencia y de los respaldos.

La prueba de recepción no demuestra una eliminación integral. Antes de habilitar públicamente el flujo, ensayar recepción, atención, eliminación y confirmación con una cuenta ficticia en Testing y verificar el procedimiento de retención con asesoramiento legal.

## Verificación local realizada

- Angular: build de Producción correcto; advertencias CommonJS ya presentes en dependencias.
- 486 pruebas Angular correctas (incluyen cinco de la pantalla y dos de créditos).
- 11 pruebas HTTP API: permisos, identidad de sesión, rechazo de campos inyectados, paginación y configuración ausente.
- 17 pruebas de persistencia/guard interno con repositorio simulado: idempotencia, colisión, fechas, errores y autenticación.
- TypeScript sin emisión: API y Datos correctos con dependencias instaladas desde sus lockfiles.
- Validación móvil correcta y ocho pruebas de runtime correctas; sigue sin `server.url`, conserva endpoints de Producción en nativo.
- Sitio institucional: nueve pruebas de integridad, rutas, caché, HEAD, rangos, restricciones y navegación de privacidad correctas. Vista previa local de política inspeccionada en navegador.
- No se ensayó eliminación real, Mongo real ni firmado iOS en esta rama.

## Próximo paso, con autorización separada

1. Revisar diff y aprobar el procedimiento operativo/retención. Identificar commits exactos.
2. GitHub → desplegar primero Datos y API en Testing con el secreto dedicado; luego web. No desplegar el frontend antes de que la API esté lista.
3. Prueba integral con cuenta ficticia: solicitud, reintento, bandeja Admin, accesos rechazados, tratamiento y confirmación final.
4. Promoción selectiva autorizada: sólo los servicios necesarios, preservando el HEAD operativo de Producción. No promover esta rama completa a todos los servicios.
5. Desplegar la política institucional únicamente cuando el flujo real funcione. Revisar también copias/documentos de privacidad que ya existan en otros canales.
6. Preparar nueva compilación iOS (siguiente número disponible; previsiblemente 5). **El workflow actual continúa anclado al código de build 4. No ejecutarlo esperando estas correcciones.** Actualizar número, validador y SHA inmutable del workflow en una preparación posterior autorizada; no reutilizar el número 4.
7. Probar esa nueva candidata en TestFlight, seleccionar esa compilación en el borrador de App Store Connect y revisar capturas/privacidad/credenciales demo.
8. Solicitar autorización explícita para enviar a revisión. No confundir revisión, TestFlight y publicación.

## Fuentes

- [OpenLayers y licencia BSD](https://openlayers.org/)
- [Créditos Esri](https://doc.arcgis.com/en/arcgis-online/reference/display-copyrights.htm)
- [Metadatos World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=json), comprobados el 07/09/2026: Esri, Vantor, Earthstar Geographics y GIS User Community.
- [Metadatos World Boundaries and Places](https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer?f=json).
- [Apple: eliminación de cuentas](https://developer.apple.com/support/offering-account-deletion-in-your-app/): inicio en la app; proceso manual permitido si se completa y se confirma; no basta dirigir a soporte ni desactivar temporalmente.
