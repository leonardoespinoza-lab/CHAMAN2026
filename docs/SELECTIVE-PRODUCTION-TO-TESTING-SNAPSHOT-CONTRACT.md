# Contrato de snapshot selectivo Producción → Testing

## Estado

Este documento es un contrato de implementación, no una herramienta activa.
Los 21 `idSiembra` exactos ya fueron obtenidos mediante auditoría productiva
read-only y deben entregarse al futuro ejecutable con `--sowing-id-file`; no se
hardcodean ni se copian en este repositorio. No se agregó el importador porque
todavía faltan una cuenta Mongo productiva demostrablemente read-only y una
prueba de restauración en una base descartable. Implementarlo sin esas dos
garantías ampliaría el riesgo productivo.

Testing contiene hoy 51 siembras y no replica las 86 productivas. Para validar
exactamente un conjunto de 21 no se debe clonar la base completa ni modificar
Producción.

## Entradas obligatorias

- Archivo revisado recibido mediante `--sowing-id-file`, con **exactamente 21**
  `idSiembra` canónicos (resueltos contra `_id` de `siembras`); sin queries libres,
  expresiones regulares ni selección por texto. Los IDs ya auditados se
  mantienen fuera del código del importador y nunca se hardcodean.
- URI de origen por variable secreta, usando un usuario Mongo con roles de sólo
  lectura. La herramienta debe inspeccionar privilegios al inicio y abortar si
  encuentra capacidad de insertar, actualizar, borrar, crear índices o ejecutar
  comandos administrativos. Nunca intenta un write-probe en Producción; la
  prueba negativa de escritura se ensaya antes en un clon descartable con el
  mismo rol.
- URI de destino separada y nombre de base exactamente `chaman_testing`.
- Identificador único de operación, por ejemplo
  `selective-snapshot-20260828-21-sowings-v1`.

La herramienta debe abortar si los hosts resueltos de origen y destino son
iguales, si la base destino no es `chaman_testing`, si la allowlist no contiene
21 IDs únicos válidos o si detecta flags de entorno productivo en el destino.

## Cierre referencial permitido

La selección parte únicamente de `siembras._id` y sigue referencias explícitas
del esquema, nunca una colección completa:

- `siembras.idLote` → `lotes`;
- `siembras.idSemilla` → `semillas`;
- `siembras.idEstablecimiento` y `lotes.idEstablecimiento` →
  `establecimientos`;
- `siembras.idProductor`, `lotes.idProductor` y
  `establecimientos.idProductor` → `productores`;
- `siembras.idCrono` → cronograma estrictamente requerido por esas siembras;
- `establecimientos.idEstacionMeteorologica` → estación requerida;
- `lotes.idsDispositivo` → dispositivos requeridos.

Dependencias meteorológicas se incluyen sólo si se demuestra su vínculo con
esos lotes, estaciones o dispositivos y sólo para el intervalo de validación
declarado. Esto puede abarcar observaciones, reportes de sensores y bindings de
Chamán-Meteo, pero sus nombres de colección, claves y ventanas deben salir de
una fase `plan` contra los esquemas del mismo SHA. No se permite copiar por
comodín todas las series horarias ni colecciones de clima completas.

Quedan fuera por defecto usuarios, OAuth, tokens, sesiones, notificaciones,
colas, logs, archivos, credenciales FieldClimate, claves MQTT/CDS y cualquier
colección sin una arista explícita en el manifiesto de cierre.

## Sanitización

Antes de escribir el paquete:

- eliminar campos de token, refresh token, hash de sesión, cookies, API keys,
  secretos OAuth/MQTT/FieldClimate/CDS y URLs con credenciales;
- vaciar colecciones `tokens` y `tokenpushes` si aparecieran por error;
- retirar integraciones o credenciales embebidas en productores,
  establecimientos, estaciones y dispositivos, preservando sólo sus IDs y
  metadatos agronómicos necesarios;
- pseudonimizar datos personales no necesarios para la prueba;
- ejecutar un escáner de secretos sobre el BSON/JSON exportado antes del
  import.

Una coincidencia sensible aborta; nunca se limita a emitir un warning.

## Modos y confirmación

El modo predeterminado es `plan`/dry-run y sólo puede leer Producción. Debe
mostrar IDs resueltos, conteos por colección, conflictos en Testing, tamaño y
hashes, sin imprimir documentos completos.

El import exige una confirmación exacta derivada del manifiesto:

```text
CHAMAN_SELECTIVE_SNAPSHOT_CONFIRM=production-to-chaman_testing:<sha256-manifest>
```

La confirmación no habilita escrituras en origen. El proceso importador recibe
sólo el paquete ya exportado y la URI de Testing; idealmente export e import son
ejecutables separados para que el importador ni siquiera conozca la URI
productiva.

## Manifiesto inmutable

El paquete debe incluir un JSON canónico con:

- versión de esquema, ID de operación, SHA del código y fecha UTC;
- hash SHA-256 de la allowlist de 21 IDs;
- fuente lógica y destino `chaman_testing`, sin URIs ni credenciales;
- ventana meteorológica y reglas de cierre;
- conteo, lista ordenada de `_id` y SHA-256 canónico por colección;
- conteo de campos sanitizados por categoría, nunca sus valores;
- resultado del escáner de secretos;
- estado de conflictos (`abort`, nunca overwrite silencioso);
- hash SHA-256 de cada archivo y del manifiesto completo.

Después del import se genera evidencia separada con conteos y hashes leídos
desde Testing. Deben coincidir exactamente con el manifiesto.

## Conflictos y rollback

El comportamiento inicial es insert-only y `onConflict=abort`. Antes de la
primera escritura se crea un backup lógico selectivo de los IDs homónimos del
destino, aunque el plan espere cero conflictos.

El journal del import registra por colección únicamente los `_id` insertados y
el hash previo/posterior. No agrega marcadores a documentos productivos ni
reescribe documentos existentes. El rollback:

1. valida el hash del journal y el ID de operación;
2. confirma que cada documento destino conserva el hash importado;
3. elimina sólo los `_id` insertados por esa operación;
4. restaura cualquier documento de Testing respaldado explícitamente;
5. recalcula conteos/hashes y deja evidencia final.

Si un documento cambió después del import, el rollback se detiene y requiere
revisión; no borra datos de Testing ajenos a la operación.

## Gates de aceptación antes de implementar

1. Archivo `--sowing-id-file` con los 21 IDs auditados, revisión de integridad y
   resultado esperado documentado.
2. Cuenta productiva read-only verificada con prueba negativa de escritura.
3. Restauración completa del backup lógico ensayada en una base descartable.
4. Tests con Mongo efímero para dry-run, cierre, sanitización, conflicto,
   interrupción, reanudación, hashes y rollback.
5. Revisión del plan con conteos: exactamente 21 siembras y ninguna colección
   fuera del allowlist de cierre.
6. Ejecución primero contra un snapshot no productivo; Producción sólo se lee
   después de aprobación humana explícita.

Este flujo respeta la dirección autorizada `production-to-testing`; nunca
permite promover `chaman_testing` hacia Producción.
