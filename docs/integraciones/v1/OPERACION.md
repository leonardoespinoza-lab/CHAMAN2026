# Operación del piloto de integraciones

## Alcance seguro

Esta versión vive en `sdc-api-cliente`, no modifica el servicio externo antiguo. El piloto ya se comprobó en Testing. La preparación para Producción se detalla en [PRODUCCION.md](PRODUCCION.md) y permanece sin activar. Un despliegue de API no debe incluir web, datos, auth, motores ni migraciones. Conservar la base Git actual de cada servicio.

La exclusión del login habitual cubre exclusivamente los métodos y rutas del módulo. Cada endpoint tiene guardia propia. Las claves no abren rutas de usuarios, administración, dispositivos ni APIs internas. El cuerpo de las solicitudes de integración se omite del log HTTP; no usar datos personales como IDs externos. Los servicios internos conservan sus mecanismos de logging existentes; no es una garantía de ausencia de datos en toda la infraestructura.

## Registro de una integración

1. Verificar identidad contractual, finalidad, responsable técnico y consentimiento para los campos compartidos.
2. Asignar un **Asesor dedicado** en Testing, activo, con permiso Asesor Admin o Escritura para altas. El registro rechaza compartir un mismo Asesor entre integraciones independientes. No modificar permisos de usuarios reales ni usar un Admin global. `appcorteva` es el primer candidato indicado por el usuario; comprobar su ID y licencia, no adivinarlos.
3. Registrar ID técnico inmutable, nombre, ID de usuario Asesor, índice de su permiso, servicios autorizados, vencimiento y cupo por minuto. Los permisos de la credencial son compartidos por sus claves; para separar privilegios crear otra integración/operador.
4. Generar una clave aleatoria con `scripts/integraciones/preparar-cliente.cjs`. El script no conecta a ningún servidor ni despliega; produce dos archivos nuevos fuera del repositorio. No sobrescribe archivos previos. No imprime la clave. Elegir una carpeta privada y revisar sus permisos de acceso: en Windows la protección depende de la ACL de la carpeta, no del modo POSIX del archivo. Los errores del sistema de archivos pueden mostrar rutas, nunca el contenido de la clave.
5. Revisar el JSON de servidor y agregarlo a la lista completa de `CHAMAN_INTEGRATIONS_CLIENTS`; **no reemplazar ni omitir los clientes que ya estaban configurados**. Mantener una copia protegida del registro previo.
6. En Testing, activar `CHAMAN_INTEGRATIONS_ENABLED=true` con `ENV=test`/`testing`/`dev`/`development`/`local`. El registro admite `environment: testing` (o ausencia por compatibilidad). En Producción también exige `CHAMAN_INTEGRATIONS_PRODUCTION_ENABLED=true`, `environment: production` en cada cliente, límites explícitos y clave live. No copiar el registro ni las claves de Testing ni alterar ENV para eludir las barreras. Completar los pendientes y autorizar el despliegue antes de activar.
7. Entregar la clave al backend del integrador mediante un gestor de secretos/canal privado. El archivo de clave no se adjunta al instructivo público.

Ejemplo de configuración de servidor, **no utilizable hasta completar los valores**:

```json
[
  {
    "id": "partner-ejemplo",
    "name": "Partner de pruebas",
    "advisorUserId": "ID_REAL_DEL_ASESOR_TESTING",
    "permissionIndex": 0,
    "scopes": ["estructura:leer", "estructura:crear", "catalogos:leer", "fenologia:leer"],
    "enabled": true,
    "expiresAt": "FECHA_ISO_ACORDADA",
    "requestsPerMinute": 60,
    "keys": [{ "id": "IDENTIFICADOR_GENERADO", "sha256": "HASH_GENERADO", "expiresAt": "FECHA_ISO_ACORDADA" }]
  }
]
```

Registro inválido con la función habilitada hace fallar el arranque: validar el JSON mediante las pruebas/arranque aislado antes de aplicarlo. La revocación se aplica al recargar la configuración (nuevo arranque/despliegue), no al editar un archivo local. Un vencimiento se evalúa en cada solicitud sin reinicio.

## Preparación, despliegue y reversión

1. Registrar SHA/deployment/source de Testing y Producción; comprobar que no haya cambios pendientes en Railway. Guardar hashes de las configuraciones de **todos** los servicios, sin imprimir secretos.
2. Revisar diff frente al SHA de `testing-api`, no sólo frente al último frontend. Debe contener únicamente el módulo, sus exclusiones exactas, redacción del log, pruebas, scripts e instructivo.
3. Ejecutar pruebas API, compilación, auditoría de secretos y controles de topología; conservar resultados y distinguir errores preexistentes de los nuevos.
4. Commit en `codex/*`, push del SHA aprobado, checks de GitHub satisfactorios. No merge a main ni despliegue desde una carpeta local.
5. Con autorización para ese SHA y esas variables, conectar únicamente `testing-api` a la rama candidata en Railway. No usar el botón global para aplicar cambios de otros servicios.
6. Confirmar arranque, `/health`, `/version`, SHA y que claves inválidas no entren. Habilitar el registro validado y repetir controles.
7. Probar alta de una cadena ficticia aislada, repetición sin duplicados, ID conflictivo, recurso ajeno, acceso de sólo lectura, vencimiento, 429 y consulta fenológica. Verificar el cálculo real y fecha del dato; 202 no demuestra que el motor haya calculado bien.
8. Confirmar login web habitual y que los demás servicios/deployments/configuraciones (incluida Producción) no cambiaron.

Rollback de configuración: deshabilitar la función en `testing-api`, restaurar registro/configuración anteriores y recargar. Rollback de código: volver a conectar sólo `testing-api` a la referencia Git anterior verificada. Los ejemplos de prueba persistidos no se borran automáticamente; quedan aislados y se revisan antes de archivarlos. No restaurar toda la base ni tocar datos ajenos para deshacer este piloto.

## Rotación y revocación

- Añadir una clave nueva al mismo cliente conservando temporalmente la anterior; entregar, probar y retirar la anterior del registro. Hasta tres claves por cliente, mismo cupo y permisos.
- No cambiar `client.id` ni `advisorUserId` para rotar: forman parte del espacio de IDs persistidos.
- Para suspender todo un cliente, `enabled=false` y recargar. Suspender la cuenta operadora también bloquea sus consultas por la guardia.
- Expiración de clave o integración: 401. Sin licencia efectiva persistida/usuario habilitado: 403. No otorgar privilegios globales para sortear errores.
- No reutilizar claves de login, Apple, Google Play, Railway, Mongo ni la API externa anterior.
- Para ampliar cupos o servicios ya implementados, editar sólo `limits`, `maxSowingAgeDays`, `requestsPerMinute` o `scopes` del cliente, preservando el resto del registro y sus hashes de claves. Recargar únicamente el servicio API del entorno autorizado. No regenerar claves ni cambiar IDs por una ampliación. No hay todavía editor gráfico de integraciones.

## Reintentos y soporte

| HTTP | Acción |
|---|---|
| 200 | Alta confirmada/lectura disponible; inspeccionar `estado` y `creado`. |
| 202 | Lectura pendiente; esperar y consultar otra vez. |
| 304 | Mantener la representación anterior. Sin cuerpo. |
| 400 | Corregir formato/campos. No reintentar ciegamente. |
| 401 | Verificar clave/vencimiento; no enviar contraseña de usuario. |
| 403 | Revisar servicios habilitados, rol, licencia o cupo de recursos. No reintentar un alta al alcanzar el cupo; solicitar ampliación. |
| 404 | Recurso ajeno/inexistente/archivado o módulo apagado. No revela dueño. |
| 409 | Operación en curso, otro contenido bajo el mismo ID, nombre duplicado o siembra activa. Sólo el conflicto temporal admite reintento automático acotado. |
| 429 | Respetar `Retry-After: 60`; reducir concurrencia. |
| 503 / timeout | Estado incierto: mismo ID y cuerpo para PUT; conservar última lectura para GET; backoff con jitter y máximo de intentos. |

Compartir con soporte `X-Request-Id`, momento, integración y tipo de operación, nunca la clave. No existe aún un libro durable de consumo facturable: los límites Redis y logs diagnósticos no deben usarse como facturación. Persistir una auditoría con política de retención y definir tarifas antes de vender consumo por solicitud.

## Criterios antes de Producción

- Validación integral contra servicios reales, carga esperada y fallos de Redis/colas; aislamiento comprobado con dos integraciones reales de prueba.
- Aprobación del contrato y de la disponibilidad científica de los cultivos que se ofrecerán.
- Definir límites de recursos/cálculos además de requests/minuto, observabilidad, alertas y condiciones comerciales.
- Confirmar renovación real de resultados en background y latencia acordada; definir si basta polling o se requieren webhooks.
- Credenciales de Producción separadas, gestión de secretos, plan de revocación, backup/rollback y revisión de seguridad.
- Las barreras de entorno y doble activación deben permanecer. Este documento no autoriza publicar ni habilitar el acceso productivo.
