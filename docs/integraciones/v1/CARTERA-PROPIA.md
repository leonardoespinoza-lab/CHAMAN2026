# Cartera propia del asesor — cambio local, no desplegado

La API admite en esta candidata dos altas de establecimiento, mutuamente excluyentes:

```json
{ "nombre": "Campo propio", "carteraPropiaAsesor": true }
```

```json
{ "nombre": "Campo del cliente", "productorIdExterno": "cliente-001" }
```

No omitir ambos, combinar ambos, enviar IDs internos o inventar un productor para representar al asesor. El asesor y tenant proceden del acceso autenticado. Los lotes siguen requiriendo un establecimiento y las siembras un lote. Los IDs de los recursos y el contrato anterior de productores se conservan.

El formulario nativo agrega la elección explícita de cartera propia sólo al Asesor con escritura; la propiedad no se cambia desde la edición. El marcador se valida en servidor y se conserva para distinguir un establecimiento propio de un registro al que le falte un productor por un error. Las lecturas de la API verifican el marcador, propietario y tenant antes de recorrer los lotes y siembras. Los cupos de establecimientos y lotes incluyen la cartera propia; no se crea ni consume cupo de productores.

## Transición de índices: bloqueo para el despliegue

El índice actual `uniq_establecimiento_productor_nombre_activo_v2` agrupa todos los establecimientos sin productor con el mismo nombre. No se puede dejar esa restricción como única garantía para múltiples asesores.

Esta candidata declara dos índices nuevos:

- `uniq_establecimiento_titular_nombre_activo_v3`: nombre + productor + asesor, único para documentos con `archivado:false`. Separa las carteras propias sin debilitar la unicidad de registros legados sin propietario.
- `uniq_establecimiento_productor_nombre_activo_v3`: nombre + productor, único para documentos activos cuyo productor es ObjectId. Conserva la unicidad por productor, aunque el asesor propietario difiera.

**No se ejecutó una migración remota. No ejecutar `syncIndexes` ni eliminar índices automáticamente.** Antes de activar el recorrido en Testing o Producción:

1. Identificar y respaldar la base, la colección `establecimientos`, sus índices y configuración. Registrar conteos/huellas de propiedad. Verificar tipos reales de IDs, duplicados y documentos activos sin productor. No inferir que un registro sin productor pertenece al asesor ni rellenar propietarios automáticamente.
2. Con el alta propia aún sin publicar, crear ambos índices v3 y verificar definición y unicidad. Si falla, detenerse sin retirar v2 ni editar registros.
3. Sólo con aprobación de la migración y el respaldo verificado, retirar exactamente v2; no tocar otros índices. Revalidar datos/conteos. La prueba local aislada no sustituye estas comprobaciones en la base de destino.
4. Promover por Git API, Datos y formulario Web desde sus bases productivas revisadas, manteniendo las correcciones actuales de mapas y estilos. Registrar el estado de cada servicio.
5. Ejecutar ambos recorridos API ↔ web con cuenta de prueba autorizada, sin datos de otros clientes. Comprobar visibilidad, detalle, mapa, siembra, fenología y actualización real, además de aislamiento y reintentos.

Reversión: suspender nuevas altas propias y conservar registros. No reinstalar v2 a ciegas: nombres iguales de distintos asesores podrían impedirlo. Revisar compatibilidad del backend anterior y recuperación antes de un rollback. No borrar campos para forzar una reversión.

## Estado de validación

Comprobaciones locales del 12/09/2026 sobre la rama `codex/api-advisor-owned-fields-2026-09-12`, basada en `fab67489730ffaf88e31503da335edb7613cb393`:

- Compilación TypeScript de Modelos y compilación Nest de API y Datos: correctas.
- Suite completa de API: 88 suites, 532 pruebas correctas. Incluye ambos recorridos, reintentos, cupos y rechazo de acceso cruzado. Para los campos propios también se prueba que una relación ausente no dé acceso a productores, distribuidores o compañías ajenos, y que no puedan convertirse en campos de productor mediante edición.
- Suite completa de Datos: 74 suites, 588 pruebas correctas.
- Formulario de establecimientos y panel/instrucciones de integraciones, ChromeHeadless: 19 pruebas correctas. Se usó el tsconfig local de pruebas que resuelve Modelos desde esta misma candidata; no se modificaron dependencias compartidas.
- `node --test scripts/tests/advisor-owned-indexes-local.cjs`: 5 pruebas correctas, exclusivamente sobre un MongoDB local temporal creado por el propio proceso. Se comprobó la transición v2/v3 y la unicidad de nombres para asesores, productores y registros legados. Ninguna conexión a Mongo Testing o Producción.
- `git diff --check`: sin errores. No se modificaron estilos globales, atribuciones del mapa, licencias ni algoritmos agronómicos.

No se realizó push, despliegue, emisión de credenciales ni modificación de datos remotos en este trabajo. Las pruebas usan fixtures: no demuestran la paridad fenológica ni la visibilidad en una sesión real desplegada.

La implementación y pruebas locales no equivalen a validación en la web desplegada. Continúan pendientes la transición revisada de índices, las pruebas reales en Chamán y la paridad/actualización de fenología. El soporte de polígonos está propuesto por separado en [GEOMETRIA-LOTES.md](GEOMETRIA-LOTES.md), no implementado por este cambio.
