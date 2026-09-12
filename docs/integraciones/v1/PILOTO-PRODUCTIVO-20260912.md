# Piloto productivo autorizado — preparación

Leonardo autorizó habilitar Producción y usar ejemplos ficticios, sin esperar geometrías de Corteva. Se prepara una integración `appcorteva` vinculada exclusivamente al Asesor productivo del mismo nombre, sin copiar usuarios ni claves de Testing.

## Alcance

- Promover por Git los cambios de integraciones, control administrativo y cartera propia en API, Datos y Web. Base productiva API/Datos `e927411d`, Web `723df7e0`, revisadas contra la candidata. No cambiar estilos globales, atribuciones, auth, motores agronómicos ni otros servicios.
- Respaldo privado verificado de configuración, establecimientos e inventario del registro productivo. Estado previo: 51 establecimientos (47 activos, todos con productor ObjectId), ninguna colección/entrada de integraciones, cartera appcorteva vacía.
- Crear/verificar índices de `integrationclients` y `integrationusage`; retención del registro técnico: 90 días. Preparar ambos índices v3 de establecimientos antes de retirar exactamente v2. No editar establecimientos previos ni ejecutar `syncIndexes`.
- Activar únicamente el canal interno entre API y Datos, el registro administrativo y las banderas explícitas de integraciones productivas. Mantener los secretos fuera de Git/evidencia pública.
- Piloto técnico: 50 productores, 50 establecimientos, 50 lotes; 60 solicitudes/minuto; máximo 366 días de antigüedad para nuevas siembras. Registro inicial con vigencia temporal de 30 días, editable, sin modificar licencias ni cobros. Clave de prueba de corta duración, no enviada al cliente automáticamente.
- Pruebas: 1 productor ficticio, 2 establecimientos (uno propio), 2 lotes y 2 siembras. IDs/nombres `demo-api-20260912` / `DEMO API`; puntos ficticios y 1 ha declarada, sin polígono. Verificar reintentos y lectura en la cuenta appcorteva.

## No confundir con entrega definitiva

La API devuelve resultados canónicos históricos; todavía se debe comprobar etapa, origen y fecha contra la tarjeta web. Una respuesta de calendario no se presenta como medición a campo. Los polígonos, webhooks y otros servicios del catálogo no están habilitados por esta promoción.

El paquete `servidor/` contiene código ejecutable que puede recibir su responsable técnico. No se enviaron correos, claves ni archivos a terceros desde este trabajo. Corteva debe adaptar la persistencia/outbox y la integración con sus eventos; no se ha accedido ni modificado su servidor.

## Evidencia de ejecución

Este archivo describe la candidata y su alcance, no demuestra un despliegue. La evidencia de entorno, respaldo, CI, intentos de despliegue, verificación de versiones y pruebas se registra por separado en `output/api-production-pilot-2026-09-12/`. No declarar éxito de los pasos pendientes ni entregar acceso definitivo si la prueba API ↔ Chamán difiere.
