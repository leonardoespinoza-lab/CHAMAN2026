# Reconciliacion local de produccion — 2026-08-28

## Estado y limites

- Rama local: `codex/production-reconciliation-2026-08-28`.
- Worktree aislado: `C:\CHAMAN2026\worktrees\production-reconciliation-2026-08-28`.
- Base inmutable: `origin/main` en `4bf3af39643406f91cd74d902a3f71770c7c01fc`.
- Cabeza de codigo reconciliado antes de agregar este manifiesto: `b81adbb7eaf262c067c55dbfea703dc26a8e33c7`.
- Arbol Git de aplicacion: `5f159940fe0091a674842b78cfd0dc53e4be2843`.
- El arbol anterior es byte por byte equivalente al arbol de `8e9d0f2df2fab89f6bd7b7fae5e6b519bffb0be6`.
- No se hizo push, merge, deploy, migracion ni cambio de variables o datos.

## Commits productivos incorporados

Cada commit fue auditado contra su padre antes del cherry-pick. Los siete forman
una cadena lineal directa desde `origin/main`; no fue necesario reconstruir
hunks ni resolver conflictos.

| Original verificado | Commit local | Alcance |
| --- | --- | --- |
| `18aafe7ed83e8fa924f9c7223240319cdba66ec5` | `560cdb68529e13c727db7a9b8ff7dc4d29a219f1` | Graficos ambientales Kleppe |
| `ed14a789f59fded7fd554dcd5b07b939dbb74783` | `242b62eb8122da94aa1e50ddc9067425c0195d7c` | Metricas ambientales legacy |
| `9f9f6e4a181cf5cfecdf88137842f08b9cd80abc` | `46af99b14fd5858857b8e8745825c807917401f5` | Bateria en graficos Kleppe |
| `8d78282b7d58d4f956ef9bf7d631ed470f82fe40` | `0f644b1f1d3993b1cc5ae05ec7d540ec437fb6a8` | Renovacion de acceso FieldClimate sin reasignacion |
| `aed7410a7c22882338a4719380117c05aec99cb4` | `94917fefa53ef7f2f67da6b928fe4da9fb4aee2a` | Confianza e identidad publica web |
| `9dc9c4233b3453764aa6729fe2c739062c4d849f` | `bc64d34697d61c507de8ce85a2398edf5057cf1f` | Importacion plana y segura del catalogo de cultivos |
| `8e9d0f2df2fab89f6bd7b7fae5e6b519bffb0be6` | `b81adbb7eaf262c067c55dbfea703dc26a8e33c7` | Ajuste de regresion del importador Excel |

La equivalencia no depende solo de los mensajes de commit. Cada par tiene el
mismo `git patch-id --stable`, y la cabeza de codigo reconciliada tiene el mismo
Git tree que `8e9d0f2`:

| Original | Local | Patch ID estable | Resultado |
| --- | --- | --- | --- |
| `18aafe7` | `560cdb6` | `ac87d9cc6082380d1ce782cb02a571f4a871595d` | igual |
| `ed14a78` | `242b62e` | `d817f9cdf577f92f725eb51e2f7a2725c52f84fd` | igual |
| `9f9f6e4` | `46af99b` | `b6710a6f4ecd3a0a6fd50aa78500f5b2e17bcc52` | igual |
| `8d78282` | `0f644b1` | `4d01b5c54c74a7e0878d714d071fd3715ea04788` | igual |
| `aed7410` | `94917fe` | `6d334c0b692f9d8cd194601a7ff696ccd999a417` | igual |
| `9dc9c42` | `bc64d34` | `72f2ca891048c9c935ecf256f97ffcbb785ac86a` | igual |
| `8e9d0f2` | `b81adbb` | `5026a76c10c4561fa95ed5ed10d3bb0488adacfc` | igual |

## Archivos de aplicacion incluidos

La comparacion `origin/main...b81adbb` contiene exactamente 57 archivos:

```text
M scripts/serve-static.js
M scripts/tests/serve-static-routing.test.js
A sdc-api-cliente/src/auxiliares/logRequest/logRequest.interceptor.spec.ts
M sdc-api-cliente/src/auxiliares/logRequest/logRequest.interceptor.ts
M sdc-api-cliente/src/entidades/dispositivos/logical-services.spec.ts
M sdc-api-cliente/src/entidades/dispositivos/service.ts
M sdc-api-cliente/src/entidades/fieldclimate-integracion/controller.ts
A sdc-api-cliente/src/entidades/fieldclimate-integracion/credentials-refresh.spec.ts
M sdc-api-cliente/src/entidades/fieldclimate-integracion/service.ts
M sdc-api-cliente/src/entidades/reportes/service.spec.ts
M sdc-api-cliente/src/entidades/semilla/controller.ts
M sdc-api-cliente/src/entidades/semilla/decision-pipeline.spec.ts
A sdc-api-cliente/src/entidades/semilla/repository.spec.ts
M sdc-api-cliente/src/entidades/semilla/repository.ts
M sdc-api-cliente/src/entidades/semilla/service.ts
M sdc-api-cliente/src/main.ts
A sdc-api-clima/src/entidades/fieldClimate/credentials-cache.spec.ts
M sdc-api-clima/src/entidades/fieldClimate/repository.ts
M sdc-app-chaman/ngsw-config.json
A sdc-app-chaman/public/.well-known/security.txt
A sdc-app-chaman/public/about/index.html
M sdc-app-chaman/public/favicon/site.webmanifest
A sdc-app-chaman/public/robots.txt
A sdc-app-chaman/public/sitemap.xml
M sdc-app-chaman/src/app/auxiliares/http/fieldclimate-integracion.service.ts
M sdc-app-chaman/src/app/auxiliares/http/semilla.service.ts
M sdc-app-chaman/src/app/login/login/login.component.html
M sdc-app-chaman/src/app/login/login/login.component.scss
M sdc-app-chaman/src/app/main/modulo-admin/dispositivos/detalles-dispositivo/detalles-dispositivo.component.html
M sdc-app-chaman/src/app/main/modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component.html
M sdc-app-chaman/src/app/main/modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component.scss
A sdc-app-chaman/src/app/main/modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component.spec.ts
M sdc-app-chaman/src/app/main/modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component.ts
M sdc-app-chaman/src/app/main/modulo-admin/excel-import-regression.spec.ts
M sdc-app-chaman/src/app/main/modulo-admin/fieldclimate-integracion/fieldclimate-integracion.component.html
M sdc-app-chaman/src/app/main/modulo-admin/fieldclimate-integracion/fieldclimate-integracion.component.ts
A sdc-app-chaman/src/app/main/modulo-admin/semillas/catalogo-cultivos-excel.spec.ts
A sdc-app-chaman/src/app/main/modulo-admin/semillas/catalogo-cultivos-excel.ts
M sdc-app-chaman/src/app/main/modulo-admin/semillas/listado-semillas/listado-semillas.component.html
M sdc-app-chaman/src/app/main/modulo-admin/semillas/listado-semillas/listado-semillas.component.ts
M sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-dispositivos/card-dispositivos.component.html
M sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-frio-termico/card-frio-termico.component.html
M sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/drawer-dispositivos/drawer-dispositivos.component.html
M sdc-app-chaman/src/index.html
M sdc-datos/src/auxiliares/logRequest/logRequest.interceptor.spec.ts
M sdc-datos/src/auxiliares/logRequest/logRequest.interceptor.ts
M sdc-datos/src/entidades/dispositivos/modelos/schema.spec.ts
M sdc-datos/src/entidades/lote/repository.ts
A sdc-datos/src/entidades/semilla/catalog-import.service.spec.ts
A sdc-datos/src/entidades/semilla/catalog-import.service.ts
M sdc-datos/src/entidades/semilla/controller.ts
M sdc-datos/src/entidades/semilla/module.ts
M sdc-datos/src/entidades/semilla/repository.spec.ts
M sdc-datos/src/entidades/semilla/repository.ts
M sdc-modelos/src/entidades/dispositivo.ts
A sdc-modelos/src/motores/catalogo-cultivos.ts
M sdc-modelos/src/motores/index.ts
```

## Exclusiones deliberadas

- Todos los commits posteriores a `8e9d0f2`, incluidos `df482e1` y la serie
  Chamán-Meteo `867eb66..27aec0f`.
- `sdc-meteo-worker/**`, `docs/chaman-meteo.md`,
  `deploy/railway/CHAMAN-METEO-TESTING.md` y migraciones meteorologicas.
- `deploy/railway/chirpstack/**`, certificados, credenciales, scripts PKI y
  cualquier configuracion desplegable de ChirpStack.
- `sdc-api-lora/**`; la reconciliacion no cambia el consumidor LoRaWAN.
- Todo archivo no versionado o modificado del worktree raiz `C:\CHAMAN2026`,
  incluidos diagnosticos, artefactos, credenciales locales y trabajo Sentek.
- Cambios de Railway, GitHub, bases de datos, Redis, DNS y secretos.

## Inventario operativo de referencia

La lectura de Railway del 2026-08-28 confirma una produccion no atomica:

- web, API Cliente y Datos: cargas CLI etiquetadas `8e9d0f2`;
- Clima: carga CLI etiquetada `8d78282`;
- restantes servicios Chamán: `4bf3af3` desde `main`;
- servicios ChirpStack: despliegue manual separado.

Esta rama reconcilia el codigo de aplicacion, pero no afirma que Railway ya
ejecute un unico artefacto. MongoDB de produccion tampoco dispone hoy de un
backup nativo verificado; eso es un bloqueo para cualquier futura migracion o
promocion que escriba datos.

## Validacion local

- equivalencia de contenido: tree `5f159940fe0091a674842b78cfd0dc53e4be2843`
  igual a `8e9d0f2` antes de agregar este manifiesto;
- API Cliente: 72 suites, 369 pruebas, todas correctas;
- API Clima, regresion FieldClimate: 1 suite, 1 prueba correcta;
- Datos, regresiones afectadas: 4 suites, 34 pruebas correctas;
- frontend, regresiones afectadas: 12 pruebas correctas;
- servidor estatico: 4 pruebas correctas;
- builds correctos: Modelos, API Cliente, API Clima, Datos y frontend de
  produccion;
- auditorias de secretos y logs sensibles: correctas;
- `git diff --check`: correcto.

`npm ci` informo vulnerabilidades ya presentes en los lockfiles (API Cliente:
8 altas; API Clima: 4 altas; Datos: 4 altas; frontend: 3 bajas, 3 moderadas y
11 altas). No se ejecuto `npm audit fix` ni se modificaron dependencias porque
eso estaria fuera del alcance de esta reconciliacion.

## Condicion de promocion

Este manifiesto no convierte la rama en release productivo. Antes de cualquier
push o despliegue se requieren pruebas completas, revision del diff, controles
de CI/deploy por servicio, validacion en Railway Testing y aprobacion explicita.
