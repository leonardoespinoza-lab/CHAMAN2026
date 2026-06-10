# Repository Structure

## Objetivo

Ordenar CHAMAN2026 como monorepo profesional sin romper dependencias historicas durante la migracion inicial.

## Estructura productiva

```text
CHAMAN2026/
  sdc-app-chaman/          Frontend principal Angular/PWA
  sdc-api-cliente/         BFF/API cliente y permisos
  sdc-auth/                OAuth, login, tokens y usuarios
  sdc-datos/               Persistencia MongoDB
  sdc-api-predicciones/    Enfermedades, riego, huella/calculos
  sdc-api-clima/           Open-Meteo, FieldClimate, proveedores climaticos
  sdc-api-lora/            ChirpStack/LoRaWAN/Sentek
  sdc-ndvi-worker/         Worker NDVI
  sdc-cron/                Jobs programados
  sdc-websocket/           Eventos realtime
  sdc-modelos/             Tipos compartidos
  scripts/                 Seeds y automatizacion local
  docs/                    Arquitectura y auditoria
  deploy/railway/          Guia y variables por servicio
```

## Material auxiliar o legado

Estas carpetas pueden mantenerse como referencia local durante la migracion, pero quedan excluidas del primer repositorio productivo por `.gitignore` para evitar ruido de auditoria:

- `sdc-web-admin`
- `sdc-web-cliente`
- `sdc-api-admin`
- `sdc-api-externa`
- `sdc-ftp`
- `sdc-doc`

Estas carpetas no se versionan por defecto porque son generadas o exploratorias:

- `chamanagro-web-dist`
- `demo-repository`
- `Testing`
- `logs`

## Regla de oro

No mover fisicamente servicios en esta primera etapa. Muchos paquetes usan `modelos: file:../sdc-modelos`; mover carpetas sin actualizar package-locks, Dockerfiles y pipelines puede romper builds. La migracion a `apps/`, `services/`, `packages/` debe hacerse como cambio separado.
