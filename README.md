# CHAMAN2026

CHAMAN2026 es la evolucion local de CHAMAN Agro para gestion agronomica multi-tenant, monitoreo de lotes, clima, sensores, NDVI, riego, huella hidrica y prediccion de enfermedades.

Este repositorio es una copia nueva e independiente del codigo original. La carpeta original `C:\APP CHAMAN` no se modifica.

## Estado del repositorio

Esta version conserva los nombres historicos de servicios `sdc-*` para reducir riesgo durante la migracion. La documentacion raiz define que modulos forman parte del producto CHAMAN2026, cuales son auxiliares y como desplegarlos profesionalmente.

## Servicios principales

| Carpeta | Responsabilidad |
| --- | --- |
| `sdc-app-chaman` | Frontend Angular/PWA de CHAMAN Agro. |
| `sdc-api-cliente` | API BFF para frontend, permisos, orquestacion de clima, NDVI, siembras y servicios del lote. |
| `sdc-auth` | Autenticacion OAuth/password y usuarios. |
| `sdc-datos` | API de persistencia MongoDB y modelos de dominio. |
| `sdc-api-predicciones` | Motor de enfermedades, riego y calculos agronomicos. |
| `sdc-api-clima` | Open-Meteo, FieldClimate y proveedores climaticos. |
| `sdc-api-lora` | Integracion LoRaWAN/ChirpStack/Sentek. |
| `sdc-ndvi-worker` | Worker de procesamiento NDVI. |
| `sdc-cron` | Procesos programados. |
| `sdc-websocket` | Canal realtime para alertas/eventos. |
| `sdc-modelos` | Interfaces TypeScript compartidas. |

## Documentacion de auditoria

- [Estructura del repositorio](docs/REPOSITORY_STRUCTURE.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Seguridad base](docs/SECURITY_BASELINE.md)
- [Despliegue en Railway](deploy/railway/README.md)
- [Guia local](README-LOCAL.md)

## Comandos principales

```powershell
npm run start:local
npm run seed:admin
npm run seed:master-data
npm run seed:agro-inputs
npm run seed:demo
npm run build
npm run audit:secrets
```

## Politica de secretos

No se deben commitear `.env`, credenciales de FieldClimate, tokens de ChirpStack, passwords MQTT, connection strings privadas, claves Firebase server-side, credenciales MongoDB ni claves de proveedores climaticos. Usar los ejemplos de `deploy/railway/*.env.example`.
