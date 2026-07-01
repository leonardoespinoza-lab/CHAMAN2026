# Informe de auditoria de estructura y seguridad - Chaman

Fecha: 2026-07-01  
Alcance: revision tecnica local del repositorio `C:\CHAMAN2026`, estructura de servicios, controles de seguridad, despliegue Railway documentado, motores automaticos y preparacion para clientes corporativos.  
Modo de trabajo: auditoria sin cambios de codigo, sin lectura de secretos reales, sin tocar Railway ni GitHub remoto.

## 1. Resumen ejecutivo

Chaman ya tiene una base de plataforma real: monorepo con servicios separados, app web Angular, APIs NestJS, modelos compartidos, motores de prediccion, clima, sensores, LoRaWAN, NDVI satelital, alertas y despliegue Railway documentado por servicio. La arquitectura va en la direccion correcta para una plataforma agronomica operativa.

La plataforma compila completa con `npm run build`. El escaneo local de secretos configurado tambien pasa. Aun asi, para llevar Chaman a un estandar mas robusto frente a productores grandes, distribuidores y companias, hay brechas que conviene resolver antes de escalar comercialmente:

- Dependencias con vulnerabilidades altas en varios servicios productivos.
- Tokens guardados en `localStorage/sessionStorage` y componentes de debug que pueden imprimir tokens.
- Servicios internos sensibles que deben estar garantizados solo por red privada y, idealmente, con autenticacion servicio-a-servicio.
- Servicio `sdc-api-admin` presente localmente pero ignorado por Git, con CORS abierto, Swagger siempre activo y logs sensibles.
- Defaults de secretos en codigo para OAuth, que deberian fallar en produccion si no estan seteados.
- Falta una auditoria persistida de corridas de motores: version de algoritmo, input, output, estado, errores y responsable.
- Falta madurar backup/restore, observabilidad, CI/CD, hardening de imagenes Docker y separacion formal staging/production.

Recomendacion central: no migrar de Railway a AWS/GCP como primer reflejo. Primero hay que endurecer la aplicacion, ordenar secretos, dependencias, RBAC, observabilidad y datos. Luego si conviene pilotear un entorno cloud administrado. Una migracion cloud sin esos pasos traslada el riesgo; no lo elimina.

## 2. Evidencia local revisada

### 2.1 Comandos ejecutados

- `git status --short --branch`
- `rg --files -g package.json`
- `rg` sobre seguridad, OAuth, RBAC, storage de tokens, crons, alertas, NDVI y clima
- `npm run audit:secrets`
- `npm run build`
- `npm audit --omit=dev --json` en servicios principales
- Revision de `deploy/railway/README.md`, `railway.json`, `nginx.conf`, Dockerfiles y archivos `main.ts`

### 2.2 Estado Git observado

La rama local esta alineada con `origin/main`. Hay archivos no trackeados previos, no generados por esta auditoria:

- `docs/Motor-Enfermedades-Trigo-V2-Chaman.docx`
- `scripts/corteva/`

No se hizo commit ni push.

### 2.3 Build

Resultado: `npm run build` exitoso.

Servicios construidos:

- `sdc-datos`
- `sdc-auth`
- `sdc-api-cliente`
- `sdc-api-predicciones`
- `sdc-api-clima`
- `sdc-api-lora`
- `sdc-app-chaman`

Advertencias: el frontend Angular compila con dependencias CommonJS y bundle inicial cercano a 5 MB raw / 1 MB transferido. No bloquea despliegue, pero debe entrar en deuda tecnica de performance.

### 2.4 Escaneo de secretos

Resultado: `npm run audit:secrets` exitoso.

Observacion importante: el script excluye carpetas como `sdc-api-admin`, `sdc-api-externa`, `sdc-ftp`, `sdc-web-admin`, `sdc-web-cliente` y otras. Esto reduce el alcance real del escaneo. Ademas existen archivos locales de credenciales Railway ignorados por Git; no se leyo su contenido. Deben migrarse a variables/secret manager y rotarse si alguna vez fueron compartidos.

### 2.5 Auditoria de dependencias productivas

Resultado resumido de `npm audit --omit=dev`:

| Servicio | Moderadas | Altas | Criticas | Total |
| --- | ---: | ---: | ---: | ---: |
| `sdc-app-chaman` | 1 | 5 | 0 | 6 |
| `sdc-auth` | 8 | 14 | 0 | 22 |
| `sdc-api-cliente` | 9 | 12 | 0 | 21 |
| `sdc-datos` | 7 | 11 | 0 | 18 |
| `sdc-api-predicciones` | 5 | 11 | 0 | 16 |
| `sdc-api-clima` | 5 | 10 | 0 | 15 |
| `sdc-api-lora` | 6 | 12 | 0 | 18 |

No aparecen criticas, pero el volumen de vulnerabilidades altas exige un sprint de actualizacion y pruebas.

## 3. Arquitectura actual de Chaman

### 3.1 Servicios principales

| Servicio | Rol actual |
| --- | --- |
| `sdc-app-chaman` | Frontend Angular/Capacitor, runtime config por env, UI de productores, lotes, mapas, admin y companias. |
| `sdc-api-cliente` | Gateway/API principal para frontend; permisos, lotes, siembras, clima consolidado, NDVI queue, informes. |
| `sdc-auth` | OAuth/login, emision y refresh de tokens. |
| `sdc-datos` | Servicio de datos central sobre MongoDB; entidades, OAuth, tokens, usuarios, productores, lotes, alertas. |
| `sdc-api-predicciones` | Motores de enfermedades, malezas, agroclima, alertas y notificaciones. |
| `sdc-api-clima` | Clima, Open-Meteo, FieldClimate, estaciones y series. |
| `sdc-api-lora` | Integracion MQTT/LoRaWAN, uplinks y sensores. |
| `sdc-api-externa` | Callbacks e integraciones externas, incluido NDVI. |
| `sdc-ndvi-worker` | Worker Python para STAC/Planetary Computer, rasterio, Redis y procesamiento satelital. |
| `sdc-ftp` | Integracion FTP/camaras. |
| `sdc-cron` | Servicio cron legacy/auxiliar. |
| `sdc-websocket` | Canal WebSocket. |
| `sdc-modelos` | Tipos/modelos compartidos de dominio. |

### 3.2 Despliegue documentado en Railway

El documento `deploy/railway/README.md` propone servicios separados con `CHAMAN_SERVICE`, MongoDB, Redis y private networking. Esto es positivo. La recomendacion documentada es dejar publicos solo `chaman-api` y `chaman-web`, y mantener internos `datos`, `auth`, `clima`, `predicciones`, `externa`, `lora` y `ndvi-worker`.

El `railway.json` define `npm run railway:build`, `npm run railway:start`, healthcheck `/health` y restart on failure.

### 3.3 Motores automaticos

Base existente:

- Enfermedades: cron diario y generacion de alertas por umbral.
- Malezas: cron configurable por variable.
- Agroclima: helada/granizo y notificaciones.
- Clima: sincronizacion automatica de establecimientos.
- NDVI: sincronizacion automatica y cola Redis para worker.
- Notificaciones: deduplicacion por `eventKey`.

Brecha profesional: falta una entidad persistida de "corrida de motor" que guarde estado, version, input resumido, output, errores, duracion y servicio ejecutor. Esto es clave para explicar decisiones agronomicas ante clientes.

## 4. Fortalezas actuales

- Monorepo coherente con servicios separados.
- Build root reproducible y documentado.
- `applySecurityHardening` aplicado en la mayoria de APIs: CORS por allowlist en produccion, headers basicos, rate limit simple y Swagger deshabilitable.
- `ValidationPipe` con whitelist en servicios importantes.
- Documentos existentes de seguridad: `SECURITY.md`, `docs/SECURITY_BASELINE.md`, `docs/AUDIT_CHECKLIST.md`.
- Railway con estrategia de private networking documentada.
- Motores automaticos con alertas y deduplicacion.
- Permisos jerarquicos por nivel: Admin, Quimica/Compania, Distribuidor, Productor, Establecimiento.
- Modulos visibles por permiso: enfermedades, riego, huella hidrica, NDVI, clima, fenologia, sensores, camaras, malezas, frio, fertilizacion, fumigacion, certificados.
- Politica de password en `sdc-api-cliente`: minimo 8 caracteres, mayuscula, minuscula, numero y sin espacios.
- Logs de request en servicios principales intentan sanitizar passwords, tokens y secretos.
- Integraciones agronomicas reales: FieldClimate, Open-Meteo, LoRaWAN, NDVI, reportes por lote.

## 5. Hallazgos criticos y altos

### H1 - Dependencias con vulnerabilidades altas

Riesgo: alto.  
Evidencia: `npm audit --omit=dev` detecta vulnerabilidades altas en frontend y APIs.  
Impacto: exposicion a CVEs conocidas, especialmente en endpoints publicos, carga de archivos, HTTP clients y dependencias del framework.

Accion recomendada:

1. Crear rama de hardening de dependencias.
2. Actualizar NestJS, Angular y paquetes de soporte con pruebas de regresion.
3. Revisar paquetes sin fix automatico, especialmente planillas/importaciones.
4. Incorporar `npm audit --omit=dev` y/o SCA en CI.

### H2 - Tokens del frontend expuestos a JavaScript y debug logs

Riesgo: alto.  
Evidencia: tokens guardados en `localStorage/sessionStorage`; componente `token-debug` imprime tokens; login imprime Google ID token en consola.  
Impacto: ante XSS, extension maliciosa o computadora compartida, el token puede ser exfiltrado.

Accion recomendada:

1. Eliminar logs de tokens y Google ID token en builds productivos.
2. Deshabilitar componentes de debug en produccion mediante build flag.
3. Migrar refresh token a cookie `HttpOnly`, `Secure`, `SameSite`.
4. Reducir access token a vida corta en memoria cuando sea viable.
5. Agregar CSP en frontend para reducir riesgo XSS.

### H3 - OAuth y servicio de datos demasiado sensibles para estar expuestos

Riesgo: alto/critico si `sdc-datos` queda publico.  
Evidencia: endpoints de OAuth/token en `sdc-datos`, tokens consultados por URL, almacenamiento de tokens en base.  
Impacto: si el servicio queda accesible fuera de private networking, puede comprometer autenticacion completa.

Accion recomendada:

1. Confirmar en Railway que `sdc-datos` no tiene dominio publico.
2. Agregar autenticacion servicio-a-servicio aunque este en red privada.
3. Dejar de pasar tokens por path de URL; usar body/header.
4. Hash de refresh/access tokens en base o al menos refresh tokens.
5. TTL indexes y rotacion/revocacion clara.

### H4 - `sdc-api-admin` esta fuera del ciclo normal del repo

Riesgo: alto.  
Evidencia: `.gitignore` excluye `sdc-api-admin/`; `git check-ignore` confirma que su `main.ts` esta ignorado. El servicio tiene Swagger siempre activo, `app.enableCors()` abierto, sin hardening compartido y logs de refresh token.  
Impacto: codigo administrativo sensible podria quedar sin versionado, sin review, sin auditoria de secretos y con controles distintos a produccion.

Accion recomendada:

1. Decidir si `sdc-api-admin` es legacy, local o productivo.
2. Si es productivo, versionarlo y aplicarle hardening comun.
3. Si es legacy, retirarlo del flujo o aislarlo claramente.
4. Eliminar logs de refresh token.
5. Cerrar CORS y Swagger en produccion.

### H5 - Defaults de secretos en codigo

Riesgo: alto.  
Evidencia: `AUTH_CLIENT_SECRET` y `CLIENT_SECRET_INICIAL` tienen default `'1'`; OAuth base client tambien usa secreto simple y bearer tokens en query.  
Impacto: despliegues incompletos pueden salir con credenciales triviales.

Accion recomendada:

1. En produccion, fallar al iniciar si secretos obligatorios no existen.
2. Rotar secretos actuales si alguna vez se uso default.
3. Desactivar bearer token por query string.
4. Usar variables Railway hoy y Secrets Manager/Secret Manager al migrar cloud.

### H6 - RBAC aun permite rutas sin decorador si no se activa modo estricto

Riesgo: alto.  
Evidencia: `PermisoGuard` permite rutas sin metadata salvo `RBAC_DENY_UNDECORATED=true`.  
Impacto: una ruta nueva sin decorador podria quedar abierta al usuario autenticado.

Accion recomendada:

1. Completar matriz de permisos por controlador.
2. Activar `RBAC_DENY_UNDECORATED=true` primero en staging.
3. Agregar test automatizado que detecte rutas sin `@Permisos`.
4. Mantener superadmin separado del operador agronomico.

### H7 - Falta auditoria persistida de motores agronomicos

Riesgo: alto para confianza y soporte.  
Evidencia: hay crons y notificaciones, pero no un ledger central de corridas de motor.  
Impacto: ante un reclamo de enfermedad, helada, NDVI o riego, cuesta reconstruir que datos usaba el sistema, que version corria y por que alerto.

Accion recomendada:

Crear entidad `MotorRun` o similar:

- `motor`: enfermedades, malezas, helada, granizo, NDVI, riego, huella hidrica.
- `versionAlgoritmo`.
- `idLote`, `idSiembra`, `idProductor`, `idCompania`, `idDistribuidor`.
- `inputHash`, `inputResumen`, `outputResumen`.
- `estado`: pendiente, ok, warning, error.
- `duracionMs`, `fechaInicio`, `fechaFin`.
- `eventKeysGenerados`.
- `fuenteClima`, `fuenteSensor`, `fuenteSatelite`.

### H8 - NDVI con storage inline no escala para operacion grande

Riesgo: medio/alto.  
Evidencia: `NDVI_STORAGE_MODE=inline` recomendado temporalmente para Railway.  
Impacto: imagenes base64 en DB/API aumentan peso, costos y fragilidad.  
Accion: migrar imagenes NDVI a object storage: S3, Google Cloud Storage, Cloudflare R2 o volumen persistente con CDN.

### H9 - Dockerfiles sin hardening suficiente

Riesgo: medio/alto.  
Evidencia: imagenes Node Alpine/Bookworm sin `USER` no-root ni healthchecks internos; `sdc-websocket` usa Node 16.  
Accion: pinnear imagenes, usar usuario no-root, build context minimo, image scanning, SBOM, actualizar Node 16.

### H10 - Headers frontend incompletos

Riesgo: medio/alto.  
Evidencia: `nginx.conf` agrega `X-Frame-Options`, `X-Content-Type-Options` y `X-XSS-Protection`, pero falta CSP, HSTS, Referrer-Policy y Permissions-Policy.  
Accion: agregar headers modernos en nginx/edge. `X-XSS-Protection` es legacy.

## 6. Hallazgos medios

- Body limit de 50/100 MB en APIs: conviene limitar por endpoint, no global.
- Logs agronomicos pueden incluir datos identificables de productores/lotes: definir politica de PII y retencion.
- Password policy no esta centralizada en `sdc-auth`; debe ser unica y consistente.
- No se observo pipeline CI/CD formal con tests, build, audit, lint y deploy controlado.
- Falta entorno staging separado de production con datos anonimizados.
- Falta evidencia local de backups automaticos y prueba periodica de restore.
- Falta WAF/rate limit administrado delante de endpoints publicos.
- Falta matriz de clasificacion de datos: productor, ubicacion, lote, aplicaciones, sensores, imagenes, reportes.
- Falta proceso formal de incident response: responsable, severidad, canal, tiempos, comunicacion.
- Falta versionado visible de modelos agronomicos y formulas internas para soporte sin revelar IP al cliente.

## 7. Alineacion con estandares

### 7.1 OWASP ASVS y OWASP API Security

OWASP ASVS sirve como base verificable de controles tecnicos para apps web y APIs. OWASP API Security Top 10 destaca especialmente autorizacion por objeto, autenticacion, exceso de exposicion de datos, consumo inseguro de APIs y configuracion incorrecta.

Aplicacion a Chaman:

- Prioridad en BOLA/IDOR: todo acceso por `idLote`, `idProductor`, `idDistribuidor`, `idCompania`, `idSiembra` debe validar pertenencia.
- Evitar rutas internas expuestas.
- Reducir tokens en frontend.
- Validar payloads y archivos KMZ/KML/Excel.
- Rate limit y abuso por usuario/tenant, no solo por IP.

### 7.2 NIST Cybersecurity Framework 2.0

NIST CSF 2.0 organiza el programa en Govern, Identify, Protect, Detect, Respond y Recover.

Aplicacion a Chaman:

- Govern: definir owner de seguridad, riesgos, proveedores, datos y motores.
- Identify: inventario de servicios, datos, secrets, APIs, dispositivos y clientes.
- Protect: RBAC estricto, secrets, hardening, backups, CI.
- Detect: logs, alertas tecnicas, anomalías de login, fallos de motores.
- Respond: playbook de incidente.
- Recover: restore probado, RTO/RPO, comunicacion a clientes.

### 7.3 CIS Controls

CIS Controls son salvaguardas priorizadas. Para Chaman aplican especialmente:

- Inventario de activos y software.
- Gestion continua de vulnerabilidades.
- Control de acceso y cuentas.
- Configuracion segura.
- Audit logs.
- Proteccion de datos.
- Backup y recuperacion.
- Seguridad de aplicaciones.

### 7.4 Proteccion de datos personales en Argentina

Chaman trata datos personales y productivos: usuarios, emails, ubicaciones, productores, establecimientos, georreferencias y posiblemente datos economicos/agronomicos sensibles. Debe alinearse con Ley 25.326 y criterios de AAIP.

Acciones recomendadas:

- Politica de privacidad clara.
- Finalidad de uso de datos.
- Derechos de acceso, rectificacion y supresion.
- Minimizar datos en logs.
- Retencion definida.
- Contratos con proveedores cloud y subprocesadores.
- Control de exportaciones de informes.

Esto no reemplaza asesoramiento legal.

## 8. Evaluacion Railway vs AWS vs Google Cloud

### 8.1 Railway hoy

Railway es razonable para velocidad, iteracion y despliegue temprano, especialmente si se usa private networking y variables por entorno. El documento interno ya apunta correctamente a esa arquitectura.

Condiciones minimas para sostener Railway en produccion:

- Publicos solo web y gateway.
- `sdc-datos`, `auth`, `predicciones`, `clima`, `lora`, `externa`, Redis y Mongo sin dominio publico.
- Variables por entorno, sin `.env` reales en repo.
- Backups automatizados y restore probado.
- Observabilidad externa o centralizada.
- Staging separado.

### 8.2 Cuándo migrar

Conviene pensar migracion si:

- Clientes corporativos exigen controles tipo SOC 2 / ISO 27001 / pentest / DPA.
- Necesitan WAF, SIEM, IAM granular, private VPC, auditoria central, object storage y DR formal.
- El volumen NDVI/imagenes crece.
- Se necesita SLA contractual y control fuerte de costos.

### 8.3 AWS

Patron recomendado:

- ECS Fargate o App Runner para servicios Node.
- ECR para imagenes.
- ALB + AWS WAF.
- Secrets Manager para secretos.
- CloudWatch logs/metrics/alarms.
- S3 + CloudFront para NDVI, informes y camaras.
- EventBridge/SQS para trabajos.
- ElastiCache Redis.
- MongoDB Atlas sobre AWS o DocumentDB si se redisenia compatibilidad.
- AWS Backup / snapshots / IaC con Terraform.

Ventajas:

- Muy fuerte para enterprise, seguridad, auditoria y clientes grandes.
- Ecosistema maduro para WAF, SIEM, IAM y compliance.

Costo/contra:

- Mas complejidad operativa.
- Requiere disciplina DevOps/IaC para no encarecer ni fragilizar.

### 8.4 Google Cloud

Patron recomendado:

- Cloud Run para servicios containerizados.
- Artifact Registry.
- Load Balancer + Cloud Armor.
- Secret Manager.
- Cloud Logging/Monitoring/Error Reporting.
- Cloud Storage + CDN para NDVI/reportes.
- Pub/Sub + Cloud Scheduler para colas y jobs.
- Memorystore Redis.
- MongoDB Atlas sobre GCP.
- Terraform.

Ventajas:

- Cloud Run puede ser mas simple para el equipo si los servicios son stateless.
- Buen equilibrio entre managed platform y control enterprise.
- Muy natural para workloads HTTP y workers por contenedor.

Costo/contra:

- Hay que ordenar red, secretos, observabilidad y jobs igualmente.
- Si se abusa de servicios externos sin presupuesto, puede haber costos sorpresa.

### 8.5 Recomendacion cloud

No haria migracion inmediata. Haría:

1. Hardening en Railway.
2. Staging formal.
3. Object storage para NDVI/reportes.
4. Observabilidad y auditoria de motores.
5. Luego piloto cloud.

Si el criterio es simpleza operativa: Google Cloud Run + MongoDB Atlas + Cloud Storage.  
Si el criterio es venta enterprise y compliance fuerte: AWS con ECS/App Runner + WAF + Secrets Manager + S3 + CloudWatch.

## 9. Roadmap recomendado

### 0 a 15 dias - Contencion de riesgo

- Eliminar logs de tokens y Google ID token.
- Deshabilitar componentes debug en produccion.
- Confirmar private networking real de todos los servicios internos.
- Cerrar o versionar/hardenear `sdc-api-admin`.
- Fallar inicio en produccion si faltan secretos obligatorios.
- Setear `SWAGGER_ENABLED=false` en todos los servicios productivos.
- Revisar `CORS_ORIGINS` productivo.
- Ejecutar sprint de actualizacion de dependencias altas.
- Crear checklist de backup y probar restore de Mongo.

### 15 a 45 dias - Seguridad aplicativa y operativa

- Activar `RBAC_DENY_UNDECORATED=true` en staging.
- Test de rutas sin decorador de permisos.
- CI/CD con build, audit, lint y smoke tests.
- Staging separado con base anonimizacion/snapshot controlado.
- Agregar CSP/HSTS/Referrer-Policy/Permissions-Policy al frontend.
- Docker non-root, actualizar Node 16, image scanning.
- Crear `MotorRun` para trazabilidad de motores.
- Dashboard interno de motores: ultimas corridas, errores, tiempos y alertas emitidas.

### 45 a 90 dias - Plataforma profesional

- Migrar NDVI/reportes a object storage.
- Centralizar logs y metricas.
- Alertas tecnicas por caida de servicio, error rate, latencia y cola Redis.
- Playbook de incidentes.
- Politica de retencion de logs y datos.
- Auditoria de acciones criticas: login, cambio de permisos, cambios de lote, carga KMZ, aplicaciones, recomendaciones, exportaciones.
- Versionado formal de algoritmos agronomicos.

### 90 a 180 dias - Enterprise readiness

- Pentest externo.
- WAF delante del gateway.
- SSO/MFA para admin y companias.
- IaC para staging/production.
- Evaluacion SOC 2 / ISO 27001 readiness.
- Piloto AWS o GCP con un subconjunto de servicios.
- DR formal con RTO/RPO.

## 10. Controles especificos para una plataforma agro-sanitaria

Chaman no es solo una app CRUD. Tiene decisiones agronomicas con impacto economico. Por eso se recomienda:

- Trazabilidad completa de recomendacion: datos usados, fecha, lote, cultivo, variedad, etapa, clima, sensor, satelite.
- No mostrar formulas privadas completas al cliente, pero si explicar criterio y evidencias.
- Versionar algoritmos por cultivo/enfermedad/maleza/helada/huella.
- Diferenciar claramente dato medido, dato estimado y dato inferido.
- Marcar confiabilidad de fuente: sensor online, FieldClimate, Open-Meteo, satelite, input manual.
- Registrar confirmaciones de campo: enfermedad confirmada, etapa fenologica registrada, aplicacion realizada.
- Mantener historial no editable de eventos relevantes.
- Separar entorno demo/testing de productores reales.

## 11. Recomendaciones para informes ejecutivos y clientes corporativos

Para companias como Corteva/FMC/Sumitomo, el sistema deberia poder emitir:

- Hectareas monitoreadas por cultivo.
- Hectareas con alerta sanitaria.
- Distribuidores activos y cobertura geografica.
- Productores activos por distribuidor.
- Lotes por estado fenologico.
- Alertas por severidad.
- Evolucion de NDVI/calidad satelital.
- Huella hidrica agregada.
- Carga fitosanitaria por cultivo/lote.
- Calidad operativa: sensores activos, clima actualizado, motores corridos.

El informe debe incluir metodologia resumida y fecha de corte, sin formulas propietarias completas.

## 12. Matriz de prioridad

| Prioridad | Tema | Motivo |
| --- | --- | --- |
| P0 | Exposicion de tokens/logs y secretos default | Riesgo directo de compromiso. |
| P0 | Confirmar red privada de servicios internos | `sdc-datos` y OAuth no deben ser publicos. |
| P0 | `sdc-api-admin` fuera de Git/hardening | Riesgo de operacion sin control. |
| P1 | Dependencias altas | Riesgo conocido y demostrable. |
| P1 | RBAC estricto | Evita acceso cruzado entre compania/distribuidor/productor/lote. |
| P1 | Auditoria de motores | Necesaria para explicar alertas y recomendaciones. |
| P1 | Backups/restore | Sin recuperacion probada no hay plataforma enterprise. |
| P2 | Object storage NDVI | Escala y costo. |
| P2 | CI/CD | Calidad sostenida. |
| P2 | CSP/WAF/observabilidad | Madurez operativa. |

## 13. Conclusion

Chaman esta en una etapa muy valiosa: ya dejo de ser prototipo y empieza a comportarse como plataforma. La arquitectura tiene buenas bases, pero ahora necesita controles de producto enterprise: seguridad de tokens, dependencias, red privada real, permisos estrictos, auditoria de motores, observabilidad y separacion de ambientes.

Mi recomendacion es trabajar primero una etapa de hardening en Railway y recien despues pilotear AWS o Google Cloud. El criterio profesional no es "salir de Railway" sino construir una operacion verificable: saber que corre, donde corre, con que secretos, con que datos, que version de motor decidio una alerta y como se recupera el sistema si algo falla.

## 14. Fuentes externas consultadas

- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework)
- [CIS Critical Security Controls v8](https://www.cisecurity.org/controls/v8)
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html)
- [Google Cloud Architecture / Well-Architected guidance](https://docs.cloud.google.com/architecture)
- [Railway Private Networking](https://docs.railway.com/networking/private-networking)
- [Railway Variables](https://docs.railway.com/variables)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [Google Cloud Secret Manager](https://docs.cloud.google.com/secret-manager/docs)
- [AAIP Argentina](https://www.argentina.gob.ar/aaip)
- [Ley 25.326 - Proteccion de Datos Personales](https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm)
