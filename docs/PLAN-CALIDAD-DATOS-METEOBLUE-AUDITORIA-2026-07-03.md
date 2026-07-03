# Plan de Calidad de Datos Climaticos y Meteoblue

Fecha: 2026-07-03

## Objetivo

Chamán debe informar de frente la calidad del dato que alimenta cada motor. Una recomendacion agronomica no tiene el mismo peso si nace de una estacion en campo, de una estacion cercana, de Open-Meteo, de Meteoblue o de una combinacion de fuentes.

## Escala operativa propuesta

- `alta` 80-100: sensor de campo propio o fuente profesional contrastada con segunda fuente consistente.
- `media` 60-79: fuente modelada por coordenada con buena cobertura, sin sensor de campo.
- `baja` 30-59: fuente modelada sin contraste, datos incompletos, distancia alta a estacion, o variables proxy.
- `sin_datos` 0-29: sin cobertura suficiente para emitir una lectura responsable.

## Fuentes climaticas

- FieldClimate / sensor de campo: prioridad maxima cuando hay estacion o lanza asignada, reportando en fecha y con variables requeridas.
- Meteoblue: segunda fuente profesional por coordenada. Se integra como opcional con `METEOBLUE_API_KEY`.
- Open-Meteo: fuente abierta de continuidad y fallback. Mantiene operatividad pero debe mostrarse como calidad media si no hay sensor ni segunda fuente.
- MeteoSource: fuente existente en Chamán para pronostico/tiles; debe convivir con la nueva capa de calidad.

## Implementacion tecnica agregada

- Nuevo origen `Meteoblue` en `FuenteClima`.
- Nueva fuente `meteoblue` en `FuenteCalidadDato`.
- Nuevo modulo backend `sdc-api-clima/src/entidades/meteoblue`.
- Endpoints:
  - `GET /clima/meteoblue/estado`
  - `GET /clima/meteoblue/pronostico/:lat/:lng/:dias`
  - `GET /clima/meteoblue/comparar/:lat/:lng/:dias`
- Si `METEOBLUE_API_KEY` no esta configurada, el modulo queda desactivado sin romper produccion.
- La comparacion devuelve Open-Meteo, Meteoblue, diferencias por variable y un `calidadDatos` resumido.

## Variables requeridas para activar Meteoblue

```env
METEOBLUE_API_KEY=<clave>
API_METEOBLUE=https://my.meteoblue.com/packages
METEOBLUE_DAILY_PACKAGE=basic-day
METEOBLUE_HOURLY_PACKAGE=basic-1h
```

## Reglas de lectura para el usuario

- Si solo hay Open-Meteo: "Calidad media: dato modelado por coordenada, sin sensor de campo ni contraste profesional".
- Si hay Open-Meteo + Meteoblue y coinciden: "Calidad alta: fuentes climaticas consistentes".
- Si hay desvios relevantes: "Calidad media/baja: fuentes climaticas difieren; validar en campo antes de alertas criticas".
- Si hay sensor de campo actualizado: "Calidad alta: sensor/estacion asignada al establecimiento".

## Modulos que deben mostrar calidad de datos

- Clima y pronostico.
- Riesgos agroclimaticos: helada, granizo.
- Monitoreo de enfermedades.
- Malezas.
- Riego.
- Huella hidrica.
- Frio y acumulacion termica.
- NDVI/satelital, con calidad propia de escena y QA.
- Napas, con calidad por distancia/cobertura de pozos.

## Fuentes de referencia

- Meteoblue Free Weather API: https://content.meteoblue.com/en/business-solutions/weather-apis/free-weather-api
- Meteoblue Packages API overview: https://docs.meteoblue.com/en/weather-apis/packages-api/overview
- Open-Meteo API: https://open-meteo.com/en/docs
- FAO-56 ET0 como referencia para evapotranspiracion: https://www.fao.org/4/x0490e/x0490e00.htm

## Proximo paso recomendado

1. Cargar `METEOBLUE_API_KEY` en `chaman-clima` de Railway.
2. Probar `/clima/meteoblue/comparar/:lat/:lng/7` en 3 zonas: Pampa Humeda, Patagonia frutal y NOA/NEA.
3. Mostrar el badge de calidad en las tarjetas de clima, enfermedades, riego y agroclima.
4. Persistir el resumen de comparacion por establecimiento para no consumir creditos en cada render.
5. Agregar la calidad de input al informe agronomico ejecutivo.
