# Validación local · 12/09/2026

Rama: `codex/partner-phenology-pilot-2026-09-12`. Base: `233b50be31086ab892defefbf2ae447eb8b4eee7`. El código previo de `sdc-api-cliente` coincide con el del API de Testing `e927411d8f7fdfe0fc6eba3ca2d8be2adf174e85`.

Resultados obtenidos antes de preparar el commit:

- Suite completa `sdc-api-cliente`: **86 suites / 471 pruebas aprobadas**.
- Dentro de esa suite: **46 pruebas específicas** de integraciones, contrato, autenticación HTTP, proyección fenológica y controles Redis.
- Scripts/ejemplos/paquete Postman: **3 pruebas aprobadas** (`node --test scripts/integraciones/contract.test.cjs`).
- Compilación Nest de `sdc-api-cliente`: aprobada.
- Auditoría de secretos: sin hallazgos evidentes.
- Auditoría de logs sensibles: sin hallazgos evidentes.
- Validador de topología del repositorio: aprobado. No demuestra que Railway esté alineado; es validación de la configuración versionada.
- `git diff --check`: sin errores de whitespace.

Las pruebas del módulo usan dobles de servicios, repositorios y Redis; la prueba HTTP levanta Nest en memoria. No constituyen una prueba integral contra Mongo, clima y colas de Railway ni una validación científica de cultivos. El generador de credenciales se probó con archivos efímeros ficticios fuera de Git, eliminados por la prueba; **no se emitió una credencial real del cliente**.

Cambios sobre código existente: registro del nuevo módulo, exclusiones exactas de rutas/métodos del middleware habitual, omisión del cuerpo de integración en log HTTP y ejecución del test de herramientas en CI. Los demás archivos son nuevos.

Sin cambios en código de frontend/estilos, datos, autenticación personal, motores ni licencias. No se ejecutó push, despliegue, modificación de variables Railway, migración o carga de datos de cliente. Testing y Producción no fueron modificados por esta preparación.

Pendiente para activar: autorización del SHA/configuración de `testing-api`, comprobar el operador Asesor y su plan, configurar credencial aislada y ejecutar la cadena real de pruebas definida en [OPERACION](OPERACION.md). Producción queda excluida.
