# Validación de preparación productiva · 12/09/2026

Rama aislada: `codex/partner-api-production-ready-2026-09-12`. Base `723df7e0`, misma web que quedó verificada en Producción y Testing. Se incorporó el módulo piloto `ec221115` como `60433b90`, sin sustituir la corrección más reciente de asesores.

## Resultados locales

- API completa: **87 suites, 489 pruebas aprobadas**.
- Integraciones: **64 pruebas aprobadas**, incluidas entorno, autenticación HTTP, aislamiento, cupos, escrituras simultáneas serializadas, reintentos y proyección pública.
- Herramientas/contrato/Postman: **3 pruebas aprobadas**. Sólo secretos ficticios temporales, no una clave real de Producción.
- Compilación Nest: aprobada.
- Auditoría de secretos: sin hallazgos evidentes.
- Auditoría de logs sensibles: sin hallazgos evidentes (`node scripts/audit-sensitive-logs.js`).
- Topología versionada: aprobada, 14 roles. No sustituye comprobación de Railway.
- Diff de web, datos, auth, clima y predicciones frente a `723df7e0`: vacío.
- `git diff --check`: sin errores de espacios.

## Casos añadidos

- Producción exige activación explícita adicional, entorno del cliente, cupos y antigüedad máxima válidos. Configuraciones incompletas se rechazan sin imprimir secretos.
- Claves test/live incompatibles incluso si se copia un hash; namespace Redis productivo separado; IDs persistidos del piloto permanecen estables.
- Descubrimiento informa entorno y operaciones realmente permitidas; no ofrece escritura a un operador Lectura ni Fenología si está deshabilitada en su cuenta.
- 50 altas de cada tipo permitidas; alta 51 bloqueada; repetición exacta disponible; ampliación de cupo efectiva conservando identidad. Reducción a cero no elimina ni bloquea lectura.
- Conteo de cartera propia, incluyendo manuales y excluyendo archivados/otros asesores. Si no puede consultar un total válido, no realiza alta.
- Altas concurrentes API respetan su reserva Redis; no se afirma una transacción común con la UI.
- Nueva siembra demasiado antigua bloqueada, pero reintento de una siembra ya registrada permitido.
- Ejemplo Node rechaza enviar una clave de otro entorno y no sigue redirecciones.

## Límites de esta evidencia

Estas pruebas usan dobles de servicios/Redis o Nest en memoria. El piloto anterior sí se comprobó en Testing con servicios reales; los nuevos cupos y la configuración live todavía no se desplegaron. No se modificaron variables ni se emitieron claves live. No hay prueba de equivalencia completa entre la tarjeta fenológica web y la proyección histórica de la API; es un pendiente explícito en [PRODUCCION.md](PRODUCCION.md), no una validación aprobada por omisión.

La única publicación de esta sesión fue la corrección del mapa del dashboard en el servicio web de Producción, ejecutada y verificada por separado. La API queda preparada localmente, sin push ni despliegue de estos cambios.
