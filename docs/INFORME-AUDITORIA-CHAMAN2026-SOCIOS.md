# Informe de auditoria CHAMAN2026 para socios

Fecha: 17 de junio de 2026  
Alcance: plataforma CHAMAN2026, APIs, frontend, IoT LoRaWAN/MQTT, clima, motores agronomicos, modulos satelitales, usuarios y despliegue Railway.

## Resumen ejecutivo

CHAMAN2026 ya tiene una base funcional potente: usuarios multirol, establecimientos, lotes, siembras/plantaciones, servicios agronomicos, clima, sensores LoRaWAN, satelite, frio acumulado y algoritmos productivos. El producto esta saliendo del modo demo y entrando en una etapa de plataforma operativa real.

En esta revision se priorizo seguridad, gobernanza y despliegue profesional. Se aplicaron controles concretos sobre las APIs: Swagger deja de exponerse por defecto en produccion, CORS queda limitado por dominios autorizados, se agregan headers de seguridad, HSTS, rate limit basico y reglas RBAC mas explicitas. Tambien se saco del versionado un artefacto sensible de firma mobile y se reforzo la documentacion de despliegue.

El estado general es bueno para seguir evolucionando, pero todavia no es certificable. Para llegar a una postura empresarial se necesita completar matriz de permisos, auditoria de eventos, gobierno de algoritmos, backups/restores probados, politicas formales de seguridad y una prueba externa de penetracion antes de una salida comercial amplia.

## Correcciones aplicadas en este ciclo

- Se agrego hardening comun en servicios NestJS: headers de seguridad, CORS por allowlist, HSTS en produccion, deshabilitacion de `X-Powered-By`, rate limit basico y Swagger condicionado por ambiente.
- Se documento el uso de `SWAGGER_ENABLED`, `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` y `RBAC_DENY_UNDECORATED`.
- Se corrigio el riesgo de rutas con `@Permisos()` vacio: ahora un decorador vacio no abre acceso por accidente.
- Se crearon permisos explicitos para rutas que estaban ambiguas, especialmente catalogos, clima, fotos, semillas, agroquimicos, malezas, departamentos y endpoints de usuario.
- Se creo un set reutilizable de permisos autenticados para rutas consultivas que deben estar disponibles a usuarios logueados segun su nivel.
- Se saco del tracking de Git el archivo `sdc-app-chaman/keystore-chaman.key` y se agregaron reglas para evitar subir `*.keystore` y `*.jks`.
- Se reforzo `SECURITY.md`, `docs/SECURITY_BASELINE.md` y los ejemplos de variables Railway.

## Evaluacion por eje

### Producto y diseno

La aplicacion tiene una propuesta clara para productores, distribuidores, quimicas y administradores. El mapa como pantalla de entrada es correcto para el usuario de campo, y el orden de servicios dentro del lote es consistente con el flujo agronomico: detalle del lote, fenologia, enfermedades, satelite, aplicaciones, riego, huella hidrica, clima y sensores.

Riesgo actual: hay pantallas con densidad alta y texto chico. Para uso rural conviene sostener una guia visual propia: tipografia mas grande, tarjetas menos saturadas, graficos consistentes, estados vacios claros y responsive probado en celular real.

### Arquitectura

La separacion por servicios es adecuada para crecer: datos, autenticacion, cliente, clima, predicciones, LoRaWAN, workers y frontend. Este enfoque escala bien en Railway o en un proveedor cloud posterior.

Riesgo actual: al tener varios servicios, cualquier regla repetida debe convertirse en libreria compartida o patron documentado. El hardening comun hoy esta replicado por servicio; a mediano plazo conviene centralizarlo como paquete interno para evitar drift.

### Datos y algoritmos

CHAMAN2026 maneja datos climaticos, satelitales, fenologicos, sensores, agroquimicos, fertilizantes, suelos, enfermedades, malezas, frio acumulado y huella hidrica. Esta amplitud es una ventaja competitiva si se gobierna bien.

Riesgo actual: los algoritmos deben tener version, inputs, outputs, responsable tecnico, fecha de vigencia y evidencia de calibracion. El modulo "Algoritmos" debe evolucionar hacia un panel de auditoria y trazabilidad, no solo una pantalla de prueba.

### IoT y LoRaWAN

El enfoque correcto es tratar ChirpStack/LoRaWAN y MQTT como fuentes oficiales de datos, guardar cada uplink crudo, normalizar mediciones y luego servir al frontend desde base de datos. Esto evita depender del broker en tiempo real para pintar historicos.

Riesgo actual: falta formalizar contratos de payload por familia de dispositivo, version de decoder, calibracion por sensor, estado del gateway, retencion de datos y alertas de caida.

### Satelite y clima

Open-Meteo como cache operativo cada 15 minutos es una buena decision para clima, con FieldClimate o estaciones propias como prioridad cuando existen. En satelite, el producto necesita mostrarse como analisis semanal/quincenal por escena valida, no como "foto diaria", porque Sentinel/Landsat dependen de pasada, nubosidad y calidad de escena.

Riesgo actual: si la escena esta atrasada hay que explicarlo como "ultima escena valida", mostrar linea de tiempo y evitar fechas que el productor lea como falla. Lo importante es agregar valor agronomico: tendencia NDVI, NDMI/NDWI, NDRE, SAVI/EVI, alertas y comparacion entre lotes.

### Seguridad y acceso

Se corrigieron riesgos visibles en APIs: Swagger expuesto, CORS amplio, headers faltantes, rate limit ausente y permisos ambiguos. Es un avance importante.

Riesgo actual: todavia hay que completar la matriz RBAC de todas las rutas, activar `RBAC_DENY_UNDECORATED=true`, revisar almacenamiento de tokens en frontend, agregar auditoria de acciones criticas y separar ambientes staging/production con datos reales controlados.

### Gobernanza

La app necesita procesos formales porque va a manejar datos productivos, sensores, recomendaciones y decisiones agronomicas. No alcanza con que el codigo funcione: hay que saber quien cambio una regla, por que, con que evidencia y desde cuando aplica.

Riesgo actual: falta un comite minimo de cambios para algoritmos, catalogos de insumos, modelos satelitales y reglas sanitarias.

## Matriz de riesgos priorizados

| Riesgo | Nivel | Impacto | Accion recomendada |
| --- | --- | --- | --- |
| Permisos incompletos o ruta nueva sin decorador | Alto | Acceso indebido a datos o funciones admin | Completar matriz RBAC y activar `RBAC_DENY_UNDECORATED=true` |
| Secretos historicos compartidos o versionados | Alto | Toma de cuentas, despliegues o servicios | Rotar claves, tokens, passwords y keystores expuestos historicamente |
| Falta de auditoria de acciones criticas | Alto | No se puede investigar cambios o incidentes | Crear `audit_events` para login, usuarios, permisos, lotes, cosechas, algoritmos y dispositivos |
| Algoritmos sin version ni evidencia | Alto | Recomendaciones no trazables | Versionar motores y guardar input/output por corrida |
| Frontend sin CSP/HSTS si depende de Apache/static server | Medio | Mayor superficie XSS/clickjacking | Configurar headers en frontend productivo |
| IoT sin contrato formal de payload/calibracion | Medio | Datos erroneos en curvas y recomendaciones | Catalogo de dispositivos, decoder versionado y validaciones por sensor |
| Backups sin prueba de restore | Medio | Perdida o corrupcion de datos | Programar backups y simulacro mensual de restauracion |
| Accesibilidad insuficiente | Medio | Mala adopcion por usuarios de campo | Objetivo WCAG 2.2 AA, tipografia mayor y pruebas mobile |

## Hoja de ruta recomendada

### 0 a 30 dias: estabilizacion operativa

- Completar matriz de permisos por rol: Admin, Quimica, Distribuidor, Productor y Establecimiento.
- Activar Swagger solo en staging o con ventana temporal autorizada.
- Configurar `CORS_ORIGINS` definitivo en Railway.
- Rotar credenciales compartidas historicamente.
- Agregar auditoria de eventos criticos.
- Definir backups automaticos y prueba de restore.
- Crear tablero de salud de servicios: API, MongoDB, Redis, MQTT, workers, clima y satelite.

### 30 a 90 dias: gobierno y calidad empresarial

- Formalizar modulo de algoritmos con versionado, inputs, outputs, responsable y evidencia.
- Crear catalogo de dispositivos con decoder versionado y calibracion por sensor.
- Separar ambientes: local, staging y production.
- Implementar pipeline CI con build, lint, test, secret scan y dependency audit.
- Agregar pruebas E2E para login, roles, creacion de usuario, establecimiento, lote, siembra/plantacion y servicios del lote.
- Documentar proceso de cambios agronomicos y aprobacion tecnica.

### 90 a 180 dias: certificabilidad

- Preparar ISO/IEC 27001 readiness.
- Preparar SOC 2 Type I si el foco comercial es SaaS y confianza de clientes.
- Mapear controles IoT contra LoRaWAN Security, ETSI EN 303 645 e IEC 62443.
- Alinear privacidad con Ley 25.326 e ISO/IEC 27701.
- Ejecutar pentest externo y remediacion.
- Medir accesibilidad con objetivo WCAG 2.2 AA.

## Normas y marcos recomendados

- ISO/IEC 27001: sistema de gestion de seguridad de la informacion. Es la certificacion principal para mostrar madurez de seguridad.
- SOC 2: recomendado si CHAMAN se posiciona como SaaS para empresas, distribuidores y quimicas. El foco es seguridad, disponibilidad, confidencialidad, integridad y privacidad.
- OWASP ASVS: guia tecnica para verificar seguridad de aplicacion y APIs. Ideal para transformar esta auditoria en checklist de desarrollo.
- NIST Cybersecurity Framework 2.0: marco de gobierno y gestion de riesgo, util para directorio y socios.
- CIS Controls v8.1: lista priorizada de controles defensivos, practica para ordenar infraestructura, accesos y monitoreo.
- Ley Argentina 25.326 y AAIP: base legal local para datos personales de usuarios, productores, clientes y personal.
- ISO/IEC 27701: sistema de gestion de privacidad, recomendable cuando se escale el tratamiento de datos personales.
- ISO/IEC 27017 e ISO/IEC 27018: controles para nube y proteccion de PII en cloud.
- IEC 62443: referencia para seguridad industrial/OT cuando CHAMAN tome rol mas fuerte como plataforma IoT agricola.
- ETSI EN 303 645 y LoRaWAN Security: referencias para seguridad de dispositivos IoT, gateways y redes LoRaWAN.
- WCAG 2.2 AA: objetivo recomendado de accesibilidad y usabilidad para usuarios de campo.

## Decision sugerida para socios

La recomendacion es aprobar un sprint de endurecimiento y gobierno antes de sumar mas funcionalidad grande. CHAMAN ya tiene suficiente valor funcional para ser probado con clientes, pero necesita cerrar seguridad, trazabilidad y calidad operativa para sostener crecimiento sin deuda peligrosa.

Prioridades inmediatas:

1. Seguridad de acceso y RBAC completo.
2. Trazabilidad de algoritmos y recomendaciones.
3. Gobierno de datos IoT/satelite/clima.
4. Backups, monitoreo y respuesta a incidentes.
5. Mejora visual/mobile con foco en usuarios de campo.

## Fuentes consultadas

- ISO/IEC 27001: https://www.iso.org/standard/27001
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- CIS Controls v8.1: https://www.cisecurity.org/controls/v8-1
- AICPA SOC: https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services
- Ley 25.326 / Infoleg: https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm
- AAIP datos personales: https://www.argentina.gob.ar/aaip/datospersonales
- ISO/IEC 27701: https://www.iso.org/standard/27701
- ISO/IEC 27017: https://www.iso.org/standard/43757.html
- ISO/IEC 27018: https://www.iso.org/standard/27018
- IEC Cyber Security / IEC 62443: https://www.iec.ch/cyber-security
- ISA/IEC 62443: https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards
- ETSI EN 303 645: https://www.etsi.org/deliver/etsi_en/303600_303699/303645/
- LoRa Alliance Security: https://lora-alliance.org/security/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
