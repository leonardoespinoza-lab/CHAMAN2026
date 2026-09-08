# Candidata acotada de privacidad para Testing

## Estado y procedencia

Preparada y verificada localmente el 08/09/2026, sin push ni despliegue. Rama `codex/store-release-testing-2026-09-08`, base `d0a63a42be6b7b8fb2a61138a9f777c7faf2cb92` (Datos operativo de Producción).

**No desplegar la rama móvil `e839a40` como backend:** su base de compilación 4 no contiene las reparaciones posteriores del perfil de suelo. Esta candidata toma solamente privacidad y créditos de ese trabajo, sobre la base operativa más reciente. No incluye manifiesto iOS, cambios de número de compilación, workflow móvil ni runtime nativo.

Comparaciones verificadas antes de preparar esta candidata:

- El árbol web de `d0a63a4` coincide con el web de Producción `b9593a1`.
- El árbol API de `d0a63a4` coincide con el API de Producción `9529dcc`.
- Suelo-inteligencia, lotes, siembras, modelos compartidos, entornos web y gráficos de enfermedades se conservaron sin cambios respecto de `d0a63a4`.
- No se tomaron cambios del diagnóstico Sentek del directorio raíz.

## Cambios nuevos

1. Página autenticada Cuenta y privacidad: iniciar/consultar solicitud de eliminación de la cuenta completa con confirmación explícita; también disponible para roles de lectura.
2. Bandeja de solicitudes sólo para Administración central. No hay endpoint de borrado ni worker destructivo.
3. API usa únicamente la identidad autenticada; rechaza IDs y campos adicionales enviados por el cliente.
4. Datos persiste un comprobante por cuenta en la colección nueva `privacy_requests`, con inserción atómica y fecha original conservada ante reintentos.
5. Canal API-Datos con secreto específico `PRIVACY_REQUESTS_INTERNAL_TOKEN`, mínimo 32 caracteres. Sin configuración válida falla cerrado.
6. Créditos de las imágenes/cartografía visibles en los mapas existentes. No cambia proveedores, URL de teselas, geometrías, índices, recomendaciones ni diseño general.

## Evidencia local sobre esta candidata

| Comprobación | Resultado |
| --- | --- |
| Compilación Angular Production | Correcta; avisos CommonJS de dependencias existentes |
| Pruebas Angular/ChromeHeadless | 486 correctas |
| Compilación TypeScript modelos, API y Datos | Correcta |
| API de privacidad | 11 correctas |
| Datos: privacidad, suelo-inteligencia y populated-redaction de siembra | 199 correctas, 17 suites |
| Integración HTTP API → Datos → Mongo aislado | 5 subpruebas correctas; Node informa 6 incluyendo contenedor |
| Diff de áreas operativas preservadas y whitespace | Correcto |

La integración ejecutable está en `scripts/tests/privacy-local-integration.js`. Inicia un mongod nuevo, vacío, limitado a loopback; comprueba su PID antes de escribir. Usa cuentas, sesiones, contenido y destinatarios ficticios. Verifica 12 solicitudes simultáneas sin duplicación, rechazo sin autenticación/secreto, aislamiento de usuarios y bandeja Admin. Ensaya un cumplimiento manual sólo sobre colecciones ficticias y conserva la cuenta vecina.

**Límites:** no prueba el login OAuth real, borrado integral de colecciones de clientes/archivos, restauración de respaldos ni envío de correo. La confirmación es una bandeja de salida simulada. No es un script para borrar usuarios reales. La base ficticia queda en una carpeta temporal para inspección; el proceso mongod del ensayo se detiene al finalizar.

Comandos reproducibles, desde cada directorio indicado:

```text
sdc-modelos: node ../sdc-api-cliente/node_modules/typescript/bin/tsc -p tsconfig.json
sdc-api-cliente y sdc-datos: node node_modules/typescript/bin/tsc -p tsconfig.build.json --incremental false
sdc-api-cliente: node node_modules/jest/bin/jest.js --runInBand --watch=false privacy.controller.spec.ts
sdc-datos: node node_modules/jest/bin/jest.js --runInBand --watch=false suelo-inteligencia privacy-request populated-redaction
sdc-app-chaman: node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
sdc-app-chaman: node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --progress=false
raíz: node --test scripts/tests/privacy-local-integration.js
```

API/Datos instalaron dependencias desde sus lockfiles con `npm ci --ignore-scripts`; luego se compilaron los modelos locales. La web reutilizó por junction las dependencias instaladas de la candidata iOS del 07/09. El ensayo Mongo requiere el binario local Windows 8.3 especificado en el script, no se ejecuta como parte del arranque Railway.

## Fotografía de Railway consultada, sin modificaciones

Proyecto CHAMAN `36dee457-e9f8-498d-a990-72b9728d63d5`. Todos los despliegues activos consultados estaban en SUCCESS. Releer antes de actuar: esta tabla no constituye autorización ni garantiza que sigan iguales.

| Entorno | Servicio | Commit activo | Deployment ID |
| --- | --- | --- | --- |
| Testing | testing-api | ab8ba49 | a3aaa424-d2f5-4579-9ade-f3f30e77f63d |
| Testing | testing-datos | ab8ba49 | 6c242b44-bf52-4aef-933e-c5b8b64a5201 |
| Testing | testing-web | b9593a1 | ded8f133-515a-47ea-9cf7-33569a594a90 |
| Producción | chaman-api | 9529dcc | 13cda234-6105-406e-bc24-e839e3b555fb |
| Producción | chaman-datos | d0a63a4 | a05ff874-8725-4845-a68a-8b160381cc52 |
| Producción | CHAMAN2026 (web) | b9593a1 | f9859765-5577-49c4-b892-126540e8dd19 |

Testing API/Datos están detrás de Producción. La promoción propuesta también los alinea con las correcciones ya operativas de la base `d0a63a4`; no se deben retirar esas correcciones para igualar la antigua rama móvil.

## Próxima etapa: requiere autorización concreta

1. Revisar el commit final y hacer push de esta rama, sin merge. Confirmar de nuevo ramas, pendientes y commits activos de los tres servicios.
2. Respaldar/verificar la recuperación de Mongo Testing antes de cualquier ensayo que escriba. No copiar clientes de Producción.
3. Generar un secreto aleatorio dedicado y configurarlo únicamente en testing-api/testing-datos, nunca en frontend, git, documentos ni salida de herramientas. No usar un secreto de Producción.
4. Ruta GitHub → Railway: desplegar sólo testing-datos, después testing-api y finalmente testing-web, verificando salud y SHA en cada paso. No aplicar cambios pendientes de otros servicios.
5. Cuenta ficticia nueva: login real, solicitud, reintento, comprobante, bandeja Admin y rechazo entre usuarios. Ensayar el procedimiento humano con datos sintéticos claramente identificados. No borrar ni modificar cuentas de clientes.
6. Si algo falla, detener la secuencia. Conservar la colección de solicitudes; el rollback de aplicación no debe borrar comprobantes recibidos. Usar únicamente los despliegues anteriores de esos servicios y preservar evidencias.

Producción, sitio institucional, DNS, autenticación como servicio independiente, predicciones, meteorología, TestFlight y App Review quedan fuera de esta etapa.

## Operación humana necesaria antes de habilitar públicamente

El responsable confirmó `info@chamanagro.ar` como atendido y hasta 30 días para completar solicitudes verificadas. Cualquier plazo legal menor prevalece; no es una conclusión jurídica. La bandeja requiere revisión diaria por Administración: **no envía notificaciones automáticas**.

1. Aceptar el pedido autenticado sin obligar a repetirlo por correo ni pedir contraseña. Localizar la cuenta mediante el comprobante y verificar el contacto.
2. Inventariar identidad, sesiones, notificaciones, archivos, fotos, audios y contenido aportado. Separar datos personales del solicitante y datos de terceros. Compartir contenido no justifica por sí solo retenerlo.
3. Revisar y documentar conservación legal, contratos y plazos; preparar una operación específica con targets comprobados. Archivar/desactivar el usuario no cumple por sí solo la eliminación solicitada.
4. Eliminar efectivamente lo que corresponda, revocar accesos y verificar aislamiento de otras cuentas. Las restauraciones de respaldos deben reaplicar las supresiones; acordar retención de respaldos/evidencia con el responsable antes de habilitar públicamente.
5. Confirmar al correo verificado fecha, alcance y toda conservación justificada. No declarar completado al recibir la solicitud. Retirar de la bandeja el comprobante resuelto con un procedimiento auditado y retención mínima definida.

## Camino restante hasta App Store

Después de validar Testing, pedir autorización de promoción selectiva a Producción, preservando otra vez los commits operativos. Publicar la política institucional `bdfab39` sólo cuando el flujo real esté disponible. La candidata móvil `e839a40` y su manifiesto siguen separados: debe prepararse una nueva compilación con número no usado y workflow fijado al SHA exacto, probarse en TestFlight y seleccionarse en App Store Connect. La compilación 4 probada no incorpora este flujo. El envío a revisión/publicación requiere autorización posterior.

Los contratos Esri/Open-Meteo fueron confirmados por el responsable, no inspeccionados. OpenLayers de código abierto no convierte las imágenes Esri en contenido libre. Conservar evidencia de derechos de uso y revisar política/retención antes del envío.
