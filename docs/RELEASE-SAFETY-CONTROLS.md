# Controles de release y recuperación

Estos controles fijan el release por SHA, generan evidencia sin secretos y
verifican un rollback; no ejecutan deploys, no cambian variables de Railway y
no aplican migraciones.

Railway está en plan Pro y se mantienen backups nativos programados. Aun así,
un manifiesto de **producción** falla si no incluye identificadores de un backup
lógico reciente y de una restauración ensayada en un destino aislado: el backup
nativo no reemplaza la prueba independiente de recuperación.

## Estado del contrato `/version`

El contrato compartido vive en `sdc-modelos` y sólo admite cinco valores
construidos por código: `schemaVersion`, `service`, `sha`, `version` y
`builtAt`. Nunca serializa el ambiente completo.

Variables de entrada:

```text
CHAMAN_RELEASE_SHA=<SHA Git completo de 40 caracteres>
CHAMAN_RELEASE_VERSION=<identificador corto, por ejemplo 2026.08.28-rc.1>
CHAMAN_RELEASE_BUILT_AT=<fecha ISO-8601>
```

Si `CHAMAN_RELEASE_SHA` no está definida, el helper acepta
`RAILWAY_GIT_COMMIT_SHA` como fallback. Un valor explícito inválido se publica
como `unknown`, para que el preflight falle sin reflejar el contenido recibido.
Si `CHAMAN_RELEASE_BUILT_AT` no está definida, acepta `SOURCE_DATE_EPOCH` en
segundos y lo normaliza a UTC. Railway no publica una fecha de build entre sus
[variables oficiales](https://docs.railway.com/variables/reference), por lo que
API y Datos deben recibir la fecha ISO del manifiesto o un epoch reproducible
inyectado por el pipeline; el validador productivo bloquea el arranque si faltan
ambos. También exige `CHAMAN_RELEASE_VERSION`. El SHA sí puede provenir de la
variable Git oficial de Railway. Un valor explícito inválido nunca cae al
fallback.

La primera fase expone `GET /version`, sin autenticación y con
`Cache-Control: no-store`, en:

- `sdc-api-cliente`, representante público;
- `sdc-datos`, representante privado.

El rollout transversal debe reutilizar el mismo helper en auth, clima,
predicciones, externa, lora, websocket, web y workers. Hasta entonces, el
manifiesto marca esos roles como `railway-deployment-metadata`: su SHA debe
verificarse en Railway. `--require-full-version-coverage` permite convertir
esa deuda en un bloqueo cuando todos los endpoints estén implementados.

## Gate de Chamán-Meteo

`quality-gates` se ejecuta también en cada push a `main`. El job
`chaman-meteo-worker-build` distingue dos estados seguros:

1. Ningún artefacto Chamán-Meteo está todavía en el ref: informa que el gate
   está preparado y termina correctamente.
2. Existe cualquier artefacto: exige el conjunto completo y ejecuta
   dependencias, todos los tests Python, la prueba de migración de índices v2
   y el build del Dockerfile.

Una entrega parcial falla. El gate no crea el servicio, no lo conecta con
Railway y no toca ChirpStack.

## Crear un manifiesto servicio → SHA

Se genera después de producir el commit final que se probará. No conviene
commitear un manifiesto de ejecución porque el propio commit cambiaría su SHA.
Guardar el JSON como artefacto inmutable del release:

```powershell
$releaseSha = git rev-parse HEAD
$rollbackSha = git rev-parse HEAD^
$builtAt = (Get-Date).ToUniversalTime().ToString('o')
npm run release:manifest -- `
  --sha $releaseSha `
  --previous-sha $rollbackSha `
  --version 2026.08.28-rc.1 `
  --built-at $builtAt `
  --environment testing `
  --deployment-baseline deploy/testing-baseline-2026-08-28.json `
  --migrations deploy/release-migrations.chaman-meteo-v2.example.json `
  --output $env:TEMP/chaman-release.json
```

El generador obtiene todos los servicios de código desde
`deploy/environment-topology.json`. Los servicios `promote` reciben el mismo
`expectedSha` y `rollbackSha`; los servicios `frozen` conservan SHA, deployment
e imagen exactos del baseline y nunca participan del deploy ni del rollback.
La única excepción admitida es `testing-lora`; Producción no admite servicios
congelados. El baseline de Testing del 28/8 está marcado `readOnlyEvidence` y
`doNotDeploy`; sirve para recuperar el estado anterior, no para disparar un
redeploy. MongoDB, Redis y ChirpStack aislados están inventariados como
`mustRemainUntouched`.

Este contrato usa `schemaVersion: 2`. Los manifiestos v1 anteriores se rechazan
de forma deliberada porque no podían expresar ni verificar servicios congelados;
deben regenerarse desde su SHA y baseline originales, no editarse a mano.

El `baselineDeploymentId` es evidencia y no garantiza que Railway todavía
pueda restaurar esa imagen. Aunque el proyecto ya usa plan Pro, antes de
depender del rollback nativo se debe comprobar `canRollback` y la retención
efectiva en cada servicio. El rollback a un deployment arbitrario se opera
desde el Dashboard o la Public API; la CLI sólo puede redeploy/restart del
deployment más reciente.

Para un manifiesto productivo se agregan atestaciones explícitas, después de
verificarlas en GitHub/Railway:

```powershell
npm run release:manifest -- `
  --sha $releaseSha `
  --previous-sha $rollbackSha `
  --version 2026.08.28 `
  --built-at $builtAt `
  --environment production `
  --deployment-baseline <baseline-productivo-capturado-antes-del-cambio.json> `
  --backup-evidence mongo-logical-backup-20260828-1630z `
  --restore-rehearsal-evidence mongo-restore-drill-testing-20260828 `
  --branch-protection-verified `
  --railway-wait-for-ci-verified `
  --production-auto-deploy-paused `
  --output $env:TEMP/chaman-production-release.json
```

Los identificadores son referencias operativas, no credenciales ni contenido
del backup. El preflight rechaza producción si falta cualquiera de ellos.

## Preflight

Validación local de estructura, política aditiva y SHA del checkout:

```powershell
npm run release:preflight -- --manifest $env:TEMP/chaman-release.json --offline
```

Para verificar los endpoints implementados, definir sólo sus URLs públicas o
privadas completas; no son tokens:

```powershell
$env:CHAMAN_VERSION_URL_API='https://<testing-api>/version'
$env:CHAMAN_VERSION_URL_DATOS='http://<testing-datos-private>/version'
```

El comando compara SHA, identidad de servicio, versión y fecha. Sólo imprime
esos campos allowlisted, y versión/fecha deben coincidir exactamente con el
manifiesto. Para los roles todavía sin `/version` se exige un JSON de evidencia
read-only extraído del Dashboard o Public API de Railway. Debe contener sólo:
`schemaVersion`, `environment`, `capturedAt`, `readOnlyEvidence=true` y una
entrada por cada rol pendiente con `role`, `service`, `sha`, `deploymentId`,
`status=SUCCESS` y `source=railway-dashboard|railway-public-api`. Un servicio
`frozen` exige además `imageDigest`, y deben coincidir exactamente SHA,
deployment e imagen protegidos. Faltantes, roles extra, claves extra o cualquier
cambio hacen fallar el preflight. `capturedAt` debe ser posterior al build del
release, no puede estar en el futuro y vence a los 15 minutos.

Para `testing-lora`, Railway no expone `commitHash` en el deployment protegido.
Por eso el SHA completo no se atribuye directamente a Railway: el preflight
consulta Railway en vivo para comprobar deployment, estado, imagen, mensaje CLI
y `LORAWAN_MQTT_ENABLED=false`; luego Git resuelve de forma inequívoca el SHA
corto del mensaje al SHA completo sellado. Si cambia cualquiera de esas piezas,
la validación falla.

```powershell
npm run release:preflight -- `
  --manifest $env:TEMP/chaman-release.json `
  --railway-evidence $env:TEMP/chaman-railway-release-evidence.json `
  --railway-cli C:\ruta\a\railway.exe
```

También puede definirse `CHAMAN_RAILWAY_CLI`; la ruta no es una credencial.

El modo `--offline` sólo valida estructura, política, baseline y HEAD local; su
salida declara explícitamente que los deployments no fueron comprobados. No es
evidencia suficiente para promover.

`--require-full-version-coverage` exige `/version` para todos los servicios
promovidos. Un servicio `frozen` queda excluido de esa deuda porque se verifica
por identidad binaria y estado live, no como parte del nuevo release.

## Migraciones

El manifiesto sólo acepta `additive-collections` o `additive-indexes`, con:

- `startupAllowed=false`;
- plan, apply y rollback como scripts npm versionados;
- rollback limitado a `created-artifacts-only`.

El JSON de Chamán-Meteo v2 es una plantilla para cuando sus scripts ingresen
al mismo ref. `plan` corre primero en Testing. `apply` se ejecuta como job
singleton, después de backup y aprobación; nunca como Start Command ni durante
el arranque de una réplica.

## Rollback verificable

Antes de producción:

```powershell
npm run release:rollback:verify -- --manifest $env:TEMP/chaman-release.json
```

Esto comprueba que los SHA globales de los servicios promovidos existen y que
el rollback es ancestro del release. Los servicios congelados quedan fuera de
ambas acciones y se verifican contra su baseline. No cambia el checkout. El
procedimiento operativo es:

1. antes de promover, conservar `rollback.sha` en una referencia Git protegida
   e inmutable (tag o rama de rollback) y verificar que resuelve exactamente a
   ese SHA; ésta es la vía de recuperación si la imagen superó la retención o
   `canRollback=false`;
2. desactivar primero importadores y demás efectos externos;
3. si `canRollback=true`, restaurar el deployment capturado mediante Dashboard
   o Public API; en caso contrario, desplegar el `rollback.sha` desde su
   referencia inmutable, siempre en orden inverso al rollout;
4. no revertir datos: retirar sólo índices o colecciones creados por la
   migración explícita, si el runbook de esa migración lo autoriza;
5. consultar `/version` y ejecutar smoke tests;
6. con los endpoints ya en el SHA anterior, ejecutar:

```powershell
npm run release:rollback:verify -- `
  --manifest $env:TEMP/chaman-release.json `
  --online `
  --rollback-started-at 2026-08-28T23:10:00.000Z `
  --railway-evidence $env:TEMP/chaman-railway-rollback-evidence.json
```

Mientras existan roles sin endpoint, la confirmación online exige ese archivo:
los promovidos deben estar en `rollback.sha` y los congelados deben conservar su
SHA, deployment e imagen originales. `--rollback-started-at` se registra justo
antes de iniciar la reversión; toda evidencia debe ser posterior a ese instante,
además de tener menos de 15 minutos. Sin evidencia completa el comando falla; la
comprobación offline sólo demuestra existencia y ancestría Git.

Para el snapshot de Testing del 28/8 ya existen tres referencias remotas
inmutables de recuperación, creadas sin deploy:

- `codex/testing-recovery-2026-08-28-ee51d2b`: servicios GitHub previos;
- `codex/testing-recovery-2026-08-28-867eb66`: `testing-api` desplegado por CLI;
- `codex/testing-recovery-2026-08-28-5018f72`: clima, Datos, web y meteo
  desplegados por CLI.

Antes de usarlas se resuelve la referencia y se exige el short SHA incluido en
su nombre. `testing-lora` queda fuera de cualquier acción: se conserva en
`641c71f`, contra el broker de Testing y con MQTT deshabilitado.

## Secuencia GitHub → Testing → Producción

Como paso de bootstrap, pausar el auto-deploy productivo antes de fusionar estos
controles. API y Datos pasarán a exigir metadata de release verificable; sus
variables deben prepararse sin deploy y sólo activarse dentro del release
manual. La ampliación de CI se fusiona y se observa primero en un push real a
`main`; recién después se activan branch protection y Wait for CI.

1. Proteger `main`, exigir PR y todos los checks de `quality-gates`.
   Hacerlo recién después de fusionar la ampliación de CI, para no convertir
   checks incompletos en una aprobación engañosa.
2. En Railway habilitar espera de CI sólo después de confirmar que la rama
   conectada dispara `quality-gates` mediante `on: push`. `main`, `codex/**` y
   `staging/**` están cubiertas; cualquier otra rama conectada debe agregarse al
   workflow antes de activar Wait for CI. Registrar además Root Directory/config
   path por servicio; `sdc-meteo-worker` usa su subdirectorio y `railway.json`
   propio.
3. Pausar auto-deploy productivo antes de crear el SHA final del merge.
4. Generar el manifiesto desde ese SHA final y desplegarlo primero en Testing.
5. Ejecutar preflight, migraciones aditivas y smoke tests en Testing.
   Testing debe conservar MongoDB/Redis propios; una mezcla previa de ramas o
   deploys CLI no cuenta como evidencia hasta que los 11 roles promovidos del
   manifiesto confirmen el mismo SHA. `testing-lora` permanece congelado en
   `641c71f6e2f31b209c20ba831d456f93595ca710`, deployment `6330715f...`, contra
   el broker de Testing y con `LORAWAN_MQTT_ENABLED=false`.
6. Antes de cualquier cambio productivo, crear backup lógico y restaurarlo en
   un destino aislado; registrar ambas evidencias en el manifiesto.
7. Promover exactamente el mismo SHA a todos los servicios coordinadamente.
8. Conservar manifiesto, evidencia `/version`, backup y SHA anterior.
9. Reanudar automatismos sólo después de la validación productiva.

ChirpStack queda fuera de esta cadena: mantiene su recuperación y credenciales
independientes y no se conecta por estos controles.

La eventual carga de las 21 siembras productivas en Testing tiene un contrato
separado en `docs/SELECTIVE-PRODUCTION-TO-TESTING-SNAPSHOT-CONTRACT.md`. No se
implementó todavía porque requiere allowlist, credenciales read-only y ensayo
de restauración; el contrato prohíbe el clonado completo y cualquier escritura
en Producción.
