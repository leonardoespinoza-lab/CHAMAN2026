# Panel de Integraciones API

Estado: implementación local del 12/09/2026. No habilita por sí sola Testing ni Producción. No genera cobros.

## Qué permite

Una tarjeta **Integraciones API** en el dashboard del administrador general abre `/integraciones-api`.

- Registrar una integración para un **Asesor existente y activo**: verificar su usuario y seleccionar su permiso. No crea ni reutiliza contraseñas humanas.
- Elegir los servicios implementados: lectura de estructura, creación de estructura/siembras, catálogo y fenología. No ofrece motores todavía no expuestos por la API.
- Editar cupos de productores, establecimientos y lotes; frecuencia de consultas; antigüedad máxima de nuevas siembras; vencimiento; habilitación/suspensión.
- Cupos sugeridos en el formulario: 50/50/50. La fecha de vencimiento debe elegirla el administrador. Registrar no habilita automáticamente.
- Generar claves de uso servidor-a-servidor, con prefijo del entorno y vencimiento no posterior al del cliente. Se muestran **una sola vez**. Hasta tres claves permiten solapamiento durante un recambio; revocación explícita por clave.
- Consultar solicitudes por operación/día UTC, respuestas satisfactorias, errores, rechazos de frecuencia, cálculos pendientes y solicitudes sin cierre confirmado; períodos móviles de 7, 30 y 90 días.
- Preparar instrucciones por cliente con URL, encabezados, servicios, cupos, vencimiento, ejemplos de altas, consulta de fenología, ETag, códigos de respuesta y soporte. Imprimir o guardar como PDF. **Nunca incluye claves ni hashes.**
- Ver los últimos 100 cambios de configuración, con actor, fecha, acción y revisión.

El identificador de integración, usuario operador y permiso quedan inmutables después del alta: los IDs de recursos dependen de esa vinculación. Cambiar cupos o renovar no cambia propietarios. Para cambiar la cuenta operadora se requiere un procedimiento específico, no editar el ID a mano.

Reducir cupos no borra campos: bloquea nuevas altas si el consumo existente alcanza el nuevo límite. Los recursos activos de esa cartera creados desde la interfaz también cuentan. El panel no modifica licencias, precios, facturas, módulos de usuarios ni algoritmos.

## Consumo no equivale a facturación

Se cuenta cada solicitud que se autentica y consigue registrar su inicio, incluyendo reintentos, 202, 304, 403 y 429. No se cuentan claves desconocidas, revocadas o vencidas, ni consultas de administración. **Una consulta no equivale a un cálculo agronómico nuevo.**

El inicio se persiste antes de atender la operación. Si el almacenamiento no está disponible, la operación no continúa; ese rechazo no puede aparecer en un almacenamiento caído. El cierre se registra al terminar la respuesta. Si falla ese cierre o se interrumpe el proceso, queda explícitamente como **sin cierre confirmado**, no se inventa un éxito ni un cero.

Los registros conservan sólo integración, entorno, UUID interno de solicitud, plantilla de operación, hora, estado HTTP y duración. No contienen cuerpos, IDs de campos, coordenadas, IP, cabeceras, claves ni fórmulas. TTL de 90 días, con la demora normal del borrado TTL de Mongo. Reporte operativo para dimensionar clientes; no constituye un libro contable ni una garantía de entrega. No reconstruye consumo anterior.

Pendiente comercial separado: definir paquetes mensuales, qué llamadas serían facturables, excedentes, precios y conservación contable antes de automatizar cualquier cobro. Los límites de recursos y frecuencia sí se aplican actualmente; no hay límite mensual monetario ni de consultas.

## Componentes y seguridad

1. Web: ruta protegida por `nivel Admin + rol Admin`, componentes y estilos locales. No toca estilos globales ni mapas.
2. API: `/admin/integraciones`, autenticación personal existente y doble verificación de administrador general. API keys no autentican estas rutas. Respuestas `Cache-Control: no-store`.
3. Datos: `/internal/integration-control/command`, módulo deshabilitado por defecto; exige siempre token interno dedicado. Nunca acepta `x-api-key` de cliente como credencial interna.
4. Mongo: colecciones nuevas `integrationclients` e `integrationusage`; índices únicos por entorno/cliente, entorno/asesor y entorno/clave. Escrituras de configuración con comparación atómica de revisión: un conflicto devuelve 409, no sobrescribe.
5. Registro de credenciales: consulta vigente por solicitud, sin caché que reviva permisos, suspensiones o claves revocadas. Sólo se persiste SHA-256 de claves aleatorias de 256 bits.

No hay migración automática del registro antiguo de variables de entorno. No existe ruta de eliminación de integraciones ni de datos de clientes en el panel.

## Activación controlada (requiere autorización de entorno)

**No ejecutar estos cambios como parte de una simple visita a la pantalla.**

Variables nuevas, sólo en API y Datos, con secreto distinto por entorno:

| Variable | API | Datos | Función |
|---|---|---|---|
| `CHAMAN_INTEGRATIONS_ADMIN_ENABLED=true` | Sí | Sí | Habilita el almacenamiento/control. En Datos también carga el módulo y sus índices. |
| `CHAMAN_INTEGRATIONS_INTERNAL_TOKEN` | Sí | Sí | Secreto interno compartido dentro del mismo entorno, aleatorio, al menos 32 caracteres. Nunca va a Web. |
| `CHAMAN_INTEGRATIONS_REGISTRY_SOURCE=database` | Sí | No | Selecciona explícitamente el registro persistido para las llamadas de clientes. |

Se mantienen los seguros existentes: `CHAMAN_INTEGRATIONS_ENABLED=true` y, **sólo para Producción**, `CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED=true`. Sin habilitación general no hay llamadas públicas aunque un cliente figure habilitado. El valor por defecto de `REGISTRY_SOURCE` es `environment`, conservando el piloto actual sin cambios.

Secuencia de Testing:

1. Comparar ramas y despliegues con sus bases actuales. No promocionar esta rama completa a ciegas ni mover otros servicios.
2. Respaldar configuración e identificar todos los clientes del registro de entorno actual, IDs externos, claves y propietarios. No sobrescribir el piloto `appcorteva-pilot` con un registro de otro ID: perdería acceso a sus recursos determinísticos.
3. Desplegar Datos y API con panel habilitado, pero **mantener el origen `environment`** para no cortar el piloto. Desplegar Web de la misma candidata. Las nuevas fichas no estarán activas mientras el origen siga siendo `environment`.
4. Para ensayar el origen `database`, preparar/migrar de forma revisada todos los clientes que deben conservar acceso, manteniendo identificadores, cuenta, claves hash, fechas y permisos. Esta entrega no incluye una migración automática: no sustituir el registro sin ese control.
5. Cambiar el origen sólo después de verificar el inventario. Probar registro, permisos, concurrencia, consulta de consumos, vencimiento y revocación con datos propios del ensayo.
6. Producción requiere otra autorización y promoción por Git preservando el arreglo de atribuciones del mapa y asesor independiente. Servicios que necesitarían despliegue: API, Datos y Web; no otros.

Reversión: ante falla, deshabilitar integraciones externas en la API. **No volver automáticamente al registro de entorno**, porque podría reactivar claves revocadas o permisos antiguos. Mantener colecciones para diagnóstico. Volver a un registro anterior sólo con reconciliación explícita de suspensiones, claves y propietarios.

## Pendiente antes del piloto productivo

Continúa pendiente la comprobación de **paridad de la etapa fenológica** entre API e interfaz (fecha local, fuente canónica, perfiles varietales y observaciones de campo), descrita en `PRODUCCION.md`. Este panel no cambia ni resuelve esa lógica. No entregar una clave productiva al cliente hasta cerrar esa validación, elegir vencimiento y completar el recorrido con su cuenta real.

## Validación local

- Suite completa API: 88 suites, 509 pruebas aprobadas.
- Suite completa Web: 512 pruebas aprobadas, incluidas rutas, mapas y nueve pruebas nuevas de panel/ruta.
- Suite completa Datos: 74 suites, 587 pruebas aprobadas; incluye 11 específicas de almacenamiento/guardia.
- Ensayo `node --test scripts/tests/integration-admin-local.cjs`: cinco casos y suite aprobados, Mongo real **nuevo, vacío, loopback y PID verificado**; no utiliza `DB_URL`, clientes ni servicios externos. Prueba dos altas sin clave, índice único, conflicto de edición simultánea, emisión/activación, remoción de servicio, 403/429 contados, aislamiento entre clientes y revocación.
- Modelos, API, Datos y Web compilados; auditorías de secretos, logs y topología aprobadas.
- Vista previa con componente Angular real y proveedor ficticio, sin conexiones a APIs: `src/testing/integration-admin.preview.ts`. No está importada por `main.ts` ni por las rutas. Prueba visual en escritorio y 390 px sin desborde horizontal ni errores de página. Generación de claves desactivada en la vista previa.

Nota local de dependencias: el `node_modules` de Web en este worktree es una junction a la candidata iOS anterior. Para no modificarla ni usar modelos viejos, la validación usó un tsconfig temporal con `paths` al `sdc-modelos/src/index.ts` de **esta** rama y `typeRoots` al directorio instalado. En CI debe instalarse/compilarse el paquete local desde el lockfile de esta candidata. No cambiar la junction compartida ni copiar modelos a otro worktree.

No realizado por esta entrega: push, despliegue, alta de claves reales, cambio en Mongo Testing/Producción, facturación, webhooks, procesamiento agronómico nuevo o cambios de cuenta/contraseña.
