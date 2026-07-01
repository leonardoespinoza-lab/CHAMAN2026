# Protocolo seguro de trabajo - Codex, Git y Railway

Fecha: 2026-07-01  
Objetivo: mantener velocidad de desarrollo con Codex sin aumentar el riesgo operativo de Chaman, que ya tiene clientes reales.

## 1. Principios

1. Produccion no se toca a ciegas.
2. Codex puede editar codigo, docs y scripts, pero no debe leer ni publicar secretos.
3. Todo cambio que pueda afectar login, permisos, datos, alertas, motores o Railway debe validarse antes de push.
4. Los archivos locales de credenciales no se copian al chat, no se pegan en commits y se migran gradualmente a variables/secret manager.
5. Los cambios de infraestructura se documentan antes de ejecutarse.

## 2. Flujo recomendado antes de cada push

Ejecutar:

```bash
git status --short --branch
npm run audit:secrets
npm run build
```

Cuando el cambio toca solo un servicio, se puede validar con build parcial:

```bash
npm --prefix sdc-app-chaman run build-test
npm --prefix sdc-api-cliente run build
npm --prefix sdc-auth run build
```

Antes de deploy productivo, validar variables del servicio que se va a publicar:

```bash
CHAMAN_SERVICE=sdc-api-cliente ENV=production npm run audit:prod-config
CHAMAN_SERVICE=sdc-auth ENV=production npm run audit:prod-config
CHAMAN_SERVICE=sdc-datos ENV=production npm run audit:prod-config
```

En PowerShell:

```powershell
$env:CHAMAN_SERVICE='sdc-api-cliente'; $env:ENV='production'; npm run audit:prod-config
```

## 3. Reglas para Codex

Codex puede:

- leer codigo fuente;
- crear informes en `docs/`;
- hacer cambios de frontend/backend;
- correr builds, audits y busquedas;
- preparar commits y push si el usuario lo pide.

Codex no debe:

- imprimir secretos en el chat;
- abrir archivos de credenciales salvo instruccion explicita y necesidad real;
- ejecutar comandos destructivos de Git;
- cambiar variables Railway sin confirmar;
- activar `RBAC_DENY_UNDECORATED=true` en produccion sin auditoria de rutas;
- migrar storage, base o cloud sin plan de rollback.

## 4. Secretos y variables

Variables sensibles:

- `AUTH_CLIENT_SECRET`
- `CLIENT_SECRET_INICIAL`
- `MONGO_URI`, `MONGO_URL`, `DATABASE_URL`
- `REDIS_PASSWORD`
- `LORAWAN_MQTT_PASSWORD`
- `TIMELAPSE_ADMIN_TOKEN`
- credenciales FieldClimate/FTP/MQTT

Reglas:

- No usar defaults como `1`, `change-me` o vacio en produccion.
- Rotar cualquier secreto que haya estado en un archivo local compartido.
- Mantener `.railway-*.txt` solo como transitorio local y reemplazar por variables Railway.
- Si un secreto aparece en Git, se debe rotar; no alcanza con borrarlo del archivo.

## 5. Railway

Arquitectura esperada:

- Publicos: `chaman-web` y `chaman-api`.
- Privados: `chaman-datos`, `chaman-auth`, `chaman-clima`, `chaman-predicciones`, `chaman-externa`, `chaman-lora`, Redis, MongoDB, `chaman-ndvi-worker`.

Checklist Railway:

- Servicio interno sin dominio publico.
- URLs internas usando `RAILWAY_PRIVATE_DOMAIN`.
- `SWAGGER_ENABLED=false`.
- `CORS_ORIGINS` con dominios Chaman, sin comodines.
- `GOOGLE_LOGIN_ENABLED=false`.
- Healthcheck `/health` activo.
- Variables por servicio, no compartidas innecesariamente.

## 6. Git

Antes de commit:

- revisar `git diff --stat`;
- revisar `git diff --check`;
- confirmar que no se agregan archivos temporales;
- no mezclar fixes de seguridad con cargas masivas o docs no relacionadas;
- no commitear `scripts/corteva/` o documentos sueltos salvo que el usuario lo pida.

## 7. Cambios que requieren especial cuidado

- login y tokens;
- permisos por nivel;
- `sdc-datos` y OAuth;
- motores de alertas;
- NDVI worker;
- carga KMZ/KML/Excel;
- integraciones MQTT/LoRaWAN/FieldClimate;
- cambios en Docker/Railway;
- cambios masivos de dependencias.

## 8. Estado de Google Login

Google Login queda deshabilitado por defecto. Para reactivarlo se requiere:

- revision de flujo web y mobile;
- variables de cliente por entorno;
- no loguear ID tokens;
- control de dominios autorizados;
- pruebas de usuario nuevo/existente;
- aprobacion explicita antes de `GOOGLE_LOGIN_ENABLED=true`.

## 9. Fases pendientes

Fase actual: hardening dentro de produccion actual, sin migracion cloud y sin staging formal.

Fase posterior: entorno staging/testing separado cuando Chaman V1 este funcional y segura.
