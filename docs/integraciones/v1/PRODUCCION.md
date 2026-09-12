# Preparación productiva · pendiente de activación

Fecha: 12/09/2026. API desarrollada sobre la web actual `723df7e0`, conservando el alta de asesores independientes y los créditos compactos del mapa. La promoción de ese mapa ya terminó por separado; **este documento no declara la API publicada**.

## Plan inicial aprobado por Leonardo

Una integración dedicada a `appcorteva`, con un máximo inicial de **50 productores, 50 establecimientos y 50 lotes**. La cuenta Asesor productiva está activa y su cartera fue observada vacía; conserva su Plan Individual. No se modificaron licencias, no se emitió clave live ni se crearon datos productivos mediante API.

La configuración del cliente, no su código, contiene los cupos y permisos:

```json
{
  "environment": "production",
  "limits": { "productores": 50, "establecimientos": 50, "lotes": 50 },
  "scopes": ["estructura:leer", "estructura:crear", "catalogos:leer", "fenologia:leer"],
  "requestsPerMinute": 60,
  "maxSowingAgeDays": 366
}
```

Fragmento de plan, no registro activable: faltan identidad técnica, operador verificado, vencimiento y hashes de claves. El cupo 50/50/50 fue confirmado por el usuario. Los 60 requests/min y hasta 366 días de histórico son parámetros técnicos propuestos para el arranque, no tarifas ni SLA; validar antes de habilitar. La UI no incorpora un editor de planes API en este cambio. El operador administra el registro protegido del servicio; el cliente no puede enviarse permisos o cupos por HTTP.

### Qué se puede modificar sin crear otra integración

- `limits`: aumentar/reducir cada cupo de recursos (entero 0–100000). Cero bloquea altas de ese tipo, no las lecturas. Reducir un cupo nunca elimina datos.
- `scopes`: conceder/revocar servicios **ya implementados**; operaciones no reconocidas se rechazan. Otros algoritmos deberán tener endpoint, contrato, controles y pruebas antes de poder habilitarlos.
- `requestsPerMinute`: cupo compartido por las claves, entre 1 y 600.
- `expiresAt`, `enabled`: vigencia/suspensión; el vencimiento se controla en cada solicitud, las ediciones del registro requieren recargar API.
- `maxSowingAgeDays`: antigüedad máxima de nuevas siembras (1–366 días) para limitar backfills. La lectura y confirmación de una siembra existente no se bloquean al envejecer.

Preservar `id`, `advisorUserId`, `permissionIndex` y hashes de claves al ampliar un plan. No alterar productores o licencias de la app. Cambiar identidad/operador no es ampliar un plan ni rotar una clave.

El conteo incluye recursos no archivados del Asesor dedicado, también los cargados manualmente. Cada alta API consulta el total persistido dentro de su reserva de escritura; si no puede medirlo devuelve 503, no supone cero. Alcanzar cupo devuelve 403 antes de crear. Una repetición exacta de un alta confirmada no consume otro cupo. No hay un límite transaccional común entre escrituras manuales y API: durante el piloto evitar altas simultáneas por ambos canales; la API respeta el conteo visible al validar.

## Seguridad entre entornos

Producción exige `ENV=production`, las dos banderas de activación y clientes explícitamente productivos con límites válidos. Testing conserva compatibilidad con el registro actual; copiar ese registro a Producción falla. Claves test/live incompatibles; sólo el hash permanece en el registro. Redis productivo tiene espacio de nombres separado. El generador offline no activa ni despliega. El ejemplo de consulta sólo admite las dos URLs acordadas, valida el prefijo y no sigue redirecciones con credenciales.

## Pendientes antes de entregar acceso al cliente

1. **Paridad fenológica:** el piloto toma la última fila histórica (`isForecast=false`, día UTC). La tarjeta web puede priorizar la fila de hoy aunque sea estimada y puede aplicar registros de campo/manuales o referencia de calendario. No prometer equivalencia hasta fijar la misma fecha/criterio y probar cambio de etapa, fecha local, registro de campo, siembra futura, falta de datos y siembra cerrada. No ocultar la procedencia de calendario ni presentar toda etapa como medición real.
2. Probar los nuevos límites/entornos contra servicios reales internos y dos carteras aisladas, no sólo dobles de prueba. Revalidar el perfil/plan efectivo del operador; no usar permisos globales.
3. Confirmar parámetros técnicos y vigencia del primer acceso. Emitir clave live por canal seguro, nunca en Git ni en frontend.
4. Registrar respaldos y estado/configuración de servicios, revisar diff contra API productiva, controles CI y autorizar exclusivamente el servicio API y sus variables. Mantener web, datos y motores sin cambios salvo una necesidad concreta revisada por separado.
5. Ejecutar un ejemplo aislado autorizado en Producción y comprobarlo desde la cuenta Asesor y desde la API, incluido refresco real del motor. Revocar el acceso si no supera las comprobaciones; no borrar carteras ajenas.

No hay cobros por request ni facturación automática. La configuración de cupos no sustituye la definición comercial ni la validación agronómica de cultivos/variedades.
