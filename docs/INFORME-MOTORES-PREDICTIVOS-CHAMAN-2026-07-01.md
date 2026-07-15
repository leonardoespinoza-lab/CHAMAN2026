# Informe interno de motores predictivos CHAMAN

Fecha: 2026-07-01  
Alcance: formulas, inputs, salidas y calidad de datos de los motores predictivos actualmente revisados en el repositorio `C:\CHAMAN2026`.

> **Documento histórico.** La sección sanitaria de trigo quedó reemplazada por `AUDITORIA-MOTOR-SANITARIO-TRIGO-V4-2026-07-15.md`. No usar las fórmulas de royas ni las ventanas descriptas aquí para validar producción.

Este documento es una auditoria tecnica interna. No esta pensado para mostrar formulas completas al cliente final. La recomendacion de producto es mostrar interpretacion, nivel de confianza, fuente de datos y trazabilidad resumida.

## 1. Criterio transversal de calidad del input

La prediccion agronomica no debe comunicar la misma certeza cuando usa sensor propio, estacion fisica cercana o una fuente publica estimada. CHAMAN deberia estandarizar una calidad de input para todos los motores.

| Nivel | Nombre operativo | Criterio | Uso recomendado |
| --- | --- | --- | --- |
| A | Medido en campo | Sensor/lote propio, estacion asignada o dispositivo con reporte reciente, variables completas y sin duplicados. | Puede generar alerta/recomendacion operativa fuerte. |
| B | Estacion fisica cercana | FieldClimate, Omixom, Horatech o estacion fisica cercana, con distancia, cobertura suficiente y fecha de actualizacion clara. | Puede generar alerta, indicando distancia y fuente. |
| C | Modelo publico verificado | Open-Meteo historico/pronostico completo, sin sensor local. Es dato estimado por coordenada. | Usar como prediccion preventiva, no como confirmacion de campo. |
| D | Proxy o estimado interno | Variables faltantes, humedad estimada, textura por defecto, crono incompleto, datos parciales o forecast-only. | Mostrar como baja confianza; no forzar recomendaciones. |
| E | Insuficiente | No hay variables minimas para correr el motor. | No calcular o mostrar como pendiente. |

Campos sugeridos para persistir y mostrar en todos los motores:

- `calidadInput`: `alta`, `media_alta`, `media`, `baja`, `insuficiente`.
- `scoreInput`: 0 a 100.
- `fuenteClima`: `Sensor propio`, `FieldClimate`, `Omixom`, `Horatech`, `Open-Meteo`, `Proxy CHAMAN`.
- `tipoFuente`: `medida`, `estacion_cercana`, `modelo_publico`, `estimada`.
- `distanciaMetros`: solo si aplica.
- `coberturaDiasPct`: porcentaje de dias con datos utiles.
- `ultimaActualizacion`: fecha/hora del ultimo dato.
- `fallbackUsado`: por ejemplo `FieldClimate -> Open-Meteo`.
- `variablesFaltantes`: lista corta.
- `observacionCalidad`: texto ejecutivo para front/admin.

Regla de producto sugerida:

- Si la calidad es A o B, se puede usar lenguaje de alerta.
- Si la calidad es C, usar lenguaje de probabilidad preventiva.
- Si la calidad es D, usar lenguaje de monitoreo/validacion a campo.
- Si la calidad es E, no mostrar porcentaje como si fuera real.

## 2. Fuente climatica actual

Las predicciones consultan clima historico diario mediante:

- `API_CLIMA /clima/estacion/cerca/{lat}/{lng}/{from}/{to}`.
- Archivo: `sdc-api-predicciones/src/entidades/clima/repository.ts`.
- En `sdc-api-clima`, la ruta intenta primero FieldClimate y, si falla o no devuelve datos, usa Open-Meteo.
- Archivo: `sdc-api-clima/src/entidades/clima/service.ts`.

Esto es clave: una misma formula puede tener calidad distinta segun la fuente real del clima. Hoy ese fallback existe, pero debe quedar mas visible en salida de motor y en front.

Fuentes/proveedores externos usados o referenciados:

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo Historical Weather API: https://open-meteo.com/en/docs/historical-weather-api
- FieldClimate API: https://api.fieldclimate.com/v2/docs/
- Microsoft Planetary Computer STAC: https://planetarycomputer.microsoft.com/docs/quickstarts/reading-stac/
- FAO-56 ET0/Kc: https://www.fao.org/4/x0490e/x0490e00.htm
- Water Footprint Network Manual: https://waterfootprint.org/resources/the-water-footprint-assessment-manual/

## 3. Enfermedades

Ubicacion principal:

- `sdc-api-predicciones/src/entidades/prediccion/enfermedades/`
- `sdc-api-predicciones/src/entidades/prediccion/cultivos/`

Salida comun:

- `enfermedad`: nombre.
- `resultado`: indice/porcentaje de riesgo.
- `variables`: acumuladores usados por el motor.
- En prediccion diaria tambien se guarda `etapa`, `nombreEtapa` y `estacion` con datos climaticos.

### 3.1 Trigo

Ventanas fenologicas actuales:

- Manchas: etapas 1 a 4.
- Royas: etapas 2 a 6.
- Fusarium: etapas 4 a 6.

#### Mancha Amarilla

Archivo: `mancha_amarilla.ts`

Inputs:

- Precipitacion diaria.
- Humedad relativa.
- Temperatura maxima y minima.
- Prediccion anterior: `DPr`, `DPrHRT`.
- Multiplicador varietal desde `semilla.resistencia`.

Acumuladores:

- `DPr += 1` si `precip >= 2`.
- `DPrHRT += 1` si `precip >= 1`, `HR >= 80`, `Tmax <= 32` y `Tmin >= 8`.

Formula:

```text
riesgo = max(0, (-2.25 + 1.62 * DPrHRT + 1.3 * DPr) * multiplicadorVarietal)
```

Salida:

- Porcentaje/indice de riesgo de Mancha Amarilla.

#### Mancha de la Hoja

Archivo: `mancha_de_la_hoja.ts`

Inputs:

- Precipitacion diaria.
- Humedad relativa.
- Prediccion anterior: `DHR`, `DPr`.
- Multiplicador varietal.

Acumuladores:

- `DPr += 1` si `precip >= 10`.
- `DHR += 1` si `HR >= 80`.

Formula:

```text
riesgo = max(0, (-6.41 + 0.59 * DHR + 2.79 * DPr) * multiplicadorVarietal)
```

#### Roya de la Hoja

Archivo: `roya_de_la_hoja.ts`

Inputs:

- Precipitacion diaria.
- Humedad relativa.
- Temperatura promedio.
- Prediccion anterior: `GD`, `DHR`.
- Multiplicador varietal.

Acumuladores:

- Si `HR >= 49`:
  - `TB = 18` cuando `Tavg >= 18`.
  - `TB = Tavg` cuando `12 <= Tavg < 18`.
  - `GD_dia = TB - 12`.
  - `GD += GD_dia`.
- `DHR += 1` si `precip <= 0.2` y `HR >= 70`.

Formula:

```text
riesgo = max(0, 4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * multiplicadorVarietal)
```

Observacion tecnica: esta formula reduce riesgo cuando sube el multiplicador varietal. Conviene confirmar si ese multiplicador representa resistencia/inmunidad y no susceptibilidad.

#### Roya Anaranjada

Archivo: `roya_anaranjada.ts`

Inputs:

- Temperatura minima.
- Temperatura maxima.
- Velocidad de viento.
- Humedad relativa.
- Multiplicador varietal.

Formula:

```text
riesgo = max(0, (-63.11 + 0.96 * Tmin + 1.72 * Tmax + 3.72 * viento + 0.43 * HR) * multiplicadorVarietal)
```

#### Fusarium de la Espiga

Archivo: `fusarium_de_la_espiga.ts`

Inputs:

- Precipitacion actual y anterior.
- Humedad relativa actual y anterior.
- Temperatura promedio, minima y maxima.
- Prediccion anterior: `PMoj`, `GDAcum`, `GDN`.
- Multiplicador varietal.

Acumuladores:

- El motor acumula mientras `GDAcum < 530`.
- `GDAcum += Tavg`.
- `PMoj += 1` si hay dos dias humedos consecutivos: `precipAnterior >= 0.2`, `HRAnterior >= 81`, `precip >= 0.2`, `HR >= 78`.
- `GDN += max(Tmax - 26, 0) + max(9 - Tmin, 0)`.

Formula:

```text
riesgo = max(0, (20.37 + 8.63 * PMoj - 0.49 * GDN) * multiplicadorVarietal)
```

### 3.2 Soja

Ventana actual:

- Solo etapas `R3` o `R5`.

#### Enfermedades de fin de ciclo

Archivo: `fin_ciclo_soja.ts`

Inputs:

- Precipitacion diaria.
- Prediccion anterior: `DPr7`, `PtAc7`, `Lt7`.
- Multiplicador varietal.

Acumuladores:

- Si `precip >= 7`:
  - `DPr7 += 1`.
  - `PtAc7 += precip`.
  - `Lt7 = DPr7 * PtAc7`.

Formula:

```text
riesgo = max(0, ((8 * Lt7) / 600) * multiplicadorVarietal)
```

### 3.3 Maiz

Ventana actual:

- Etapas 1 o 2.

#### Roya del Maiz

Archivo: `roya_del_maiz.ts`

Inputs:

- Precipitacion diaria.
- Humedad relativa.
- Temperatura promedio.
- Prediccion anterior: `GD`, `DHR`.
- Multiplicador varietal.

Acumuladores:

- Si `HR >= 95`:
  - `TB = 17` cuando `Tavg >= 17`.
  - `TB = Tavg` cuando `8 <= Tavg < 17`.
  - `GD_dia = TB - 8`.
  - `GD += GD_dia`.
- `DHR += 1` si `precip <= 0.2` y `HR >= 95`.

Formula en codigo:

```text
riesgo = max(0, 4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * multiplicadorVarietal)
```

Observacion tecnica importante: el comentario del codigo habla de `- 0.57 * DHR`, pero la implementacion usa `+ 0.57 * DHR`. Esto debe revisarse antes de comunicar el modelo como validado.

### 3.4 Cebada

Archivo: `cultivos/cebada.ts`  
Base de datos usada: `scripts/data/cebada/cebada-variedades.json` y `scripts/data/cebada/cebada-buenos-aires-cronos.json`, derivados de `BASE CEBADA v1.xlsx`.

Importante: el motor actual de cebada no es una ecuacion bibliografica cerrada por enfermedad. Es un indice operativo CHAMAN 0-100 construido con ventana fenologica, humedad, temperatura, lluvia y presion base.

Enfermedades:

- Mancha en Red.
- Escaldadura de la Cebada.
- Roya de la Hoja de Cebada.
- Fusariosis de la Espiga de Cebada.

Inputs:

- Etapa fenologica por crono de Cebada.
- Humedad relativa.
- Temperatura promedio.
- Precipitacion actual.
- Precipitacion del dia anterior.
- Prediccion anterior: `diasFavorables`, `lluviaAcumulada`, `indiceAcumulado`.
- Multiplicador varietal.

Scores:

```text
etapaScore = 1 si etapa esta dentro de la ventana sensible; si no, 0
humedadScore = clamp((HR - humedadBase) / (100 - humedadBase), 0, 1)
temperaturaScore = clamp(1 - abs(Tavg - tempOptima) / tempTolerancia, 0, 1)
lluviaScore = clamp((precip + precipAnterior * 0.5) / lluviaCritica, 0, 1)
diaFavorable = etapaScore > 0 y temperaturaScore >= 0.35 y (humedadScore >= 0.55 o lluviaScore >= 0.45)
lluviaAcumulada = lluviaAcumuladaAnterior * 0.7 + precip
indiceDia = 100 * (humedadScore * pesoHumedad + temperaturaScore * pesoTemperatura + lluviaScore * pesoLluvia + etapaScore * pesoEtapa)
indiceAcumulado = clamp(indiceAcumuladoAnterior * 0.62 + indiceDia * 0.38, 0, 100)
riesgo = clamp((indiceAcumulado * 0.72 + diasFavorables * 2 + presionBase) * multiplicadorVarietal, 0, 100)
```

Parametros actuales:

| Enfermedad | Etapas | Temp optima | HR base | Lluvia critica | Pesos H/T/L/E | Presion base |
| --- | --- | --- | --- | --- | --- | --- |
| Mancha en Red | 1-5 | 17 C | 82% | 8 mm | 0.35 / 0.25 / 0.25 / 0.15 | 2 |
| Escaldadura de la Cebada | 1-4 | 13 C | 85% | 6 mm | 0.40 / 0.25 / 0.25 / 0.10 | 1 |
| Roya de la Hoja de Cebada | 2-6 | 18 C | 70% | 4 mm | 0.30 / 0.35 / 0.15 / 0.20 | 1 |
| Fusariosis de la Espiga de Cebada | 4-6 | 20 C | 78% | 5 mm | 0.25 / 0.25 / 0.35 / 0.15 | 3 |

Riesgo del motor:

- Si la variedad no tiene dato varietal, hoy aparece "Sin dato varietal".
- Se debe mostrar la calidad del crono y de la fuente climatica.
- Recomendacion: versionar este motor como `cebada-sanidad-v1-interno` hasta completar validacion con el equipo tecnico.

## 4. Recomendacion de riego

Ubicacion:

- `sdc-api-predicciones/src/entidades/riego/service.ts`
- `sdc-api-predicciones/src/entidades/riego/riego-v12.engine.ts`
- `sdc-api-predicciones/src/auxiliares/helper.ts`

Inputs:

- Siembra/cultivo/fecha.
- Crono fenologico.
- Suelo y textura.
- Lanza LoRaWAN si existe.
- Sonda FieldClimate si existe.
- Lluvia cercana.
- Pronostico 7 dias con ET0.
- Parametros del lote: profundidad, capacidad de riego, ancho de bulbo, distancia entre plantas, etc.

Prioridad de humedad de suelo:

1. Lanza LoRaWAN asignada al lote.
2. Sonda FieldClimate.
3. Sin dato suficiente: no deberia recomendar riego como si hubiera medicion.

Formulas principales:

```text
ETc = Kc * ET0
lluviaEfectiva72h = suma de lluvia pronosticada con probabilidad >= 70% en 72 h
demanda3Dias = suma de ETc de los proximos 3 dias
```

Agua util:

```text
PMP = puntoMarchitez manual o capacidadCampo * 0.45
aguaTotalDisponibleMm = mm(max(CC - PMP, 0), profundidad, lote)
aguaUtilActualMm = mm(clamp(humedadActual - PMP, 0, CC - PMP), profundidad, lote)
deficitMm = mm(clamp(CC - humedadActual, 0, CC), profundidad, lote)
aguaUtilPct = aguaUtilActualMm / aguaTotalDisponibleMm * 100
```

Conversion a milimetros:

```text
mm = (porcentaje / 100) * profundidadCm * 10 * factorAreaMojada
factorAreaMojada = clamp((anchoBulbo * metrosLinealesHa) / 10000, 0.05, 1.5)
```

Capacidad de campo:

- Si hay raiz activa y condiciones validas, estima capacidad de campo con percentil 75 de candidatos.
- Si no, usa valor manual del suelo/lote.
- Si no hay manual, usa textura como fallback.

Raices activas:

```text
deltaDiario = (finNoche - inicioDia) / 100
deltaDia = (finDia - inicioDia) / 100
deltaNoche = (finNoche - inicioNoche) / 100
pendienteDia = deltaDia / horasDia
pendienteNoche = deltaNoche / horasNoche
relacionDiaNoche = pendienteDia / pendienteNoche
raizActiva = sin lluvia relevante y condicion aceptada y relacionDiaNoche > 0.1
```

Decision de riego:

```text
saldo = aguaUtilActualMm + lluviaEfectiva72h - demanda3Dias
riegoNecesario = saldo < umbralMm y demanda3Dias > max(capacidadRiego * 0.7, 1)
recomendacionHoyMm = min(deficitMm, capacidadRiego)
```

Salida:

- Estado de calculo de agua util.
- Agua util en mm y porcentaje.
- Deficit.
- Demanda 3 dias.
- Lluvia efectiva 72 h.
- Recomendacion de riego en mm.
- Fuente de capacidad de campo: `auto`, `manual`, `textura`.

Calidad del input recomendada:

- Alta: humedad de suelo propia + pronostico + lluvia cercana.
- Media: sonda FieldClimate cercana + pronostico completo.
- Baja: textura/manual sin sensor o lluvia/proyeccion incompleta.

## 5. Huella hidrica

Ubicacion:

- `sdc-datos/src/entidades/algoritmos/huella-hidrica.engine.ts`
- `sdc-datos/src/entidades/algoritmos/service.ts`

Metodologia declarada en codigo:

- `WFN operativa + FAO-56`.
- ETc con Kc y ET0.
- Agua verde por lluvia efectiva.
- Agua azul por riego registrado.
- Agua gris por carga potencial de fertilizantes y fitosanitarios.

Inputs:

- Siembra: cultivo, fecha de siembra/cosecha, rendimiento seco, manejo, labranza, fertilizacion, fumigacion.
- Lote: textura, pendiente, drenaje, deposito N, contenido P.
- Clima diario: precipitacion y ET0.
- Riego registrado.

Formula de Kc:

```text
Kc = interpolacion lineal por etapa del cultivo
ETc = Kc * ET0
```

Lluvia efectiva:

```text
intensidad = 0.7 si lluvia > 20 mm; 0.8 si > 10 mm; si no 0.9
lluviaEfectiva = lluviaMm * intensidad * (1 - pendiente) * factorTextura * factorCobertura
```

Agua verde y azul:

```text
verdeDia = min(ETc, lluviaEfectiva)
azulDia = max(ETc - lluviaEfectiva, 0)
verdeLitrosKg = (ETverdeMm * 10000) / rendimientoSecoKgHa
azulRealMm = min(ETazulMm, riegoRegistradoMm) si hay riego registrado; si no 0
azulLitrosKg = (azulRealMm * 10000) / rendimientoSecoKgHa
```

Agua gris por fertilizantes:

```text
aporteN = suma(dosisKgHa * N% / 100)
aporteP = suma(dosisKgHa * P% / 100)
extraccionN = coefExtraccionN(cultivo) * rendimientoSecoKgHa / 1000
extraccionP = coefExtraccionP(cultivo) * rendimientoSecoKgHa / 1000
excedenteN = max(0, aporteN - extraccionN) * potencialN / 100
excedenteP = max(0, aporteP - extraccionP) * potencialP / 100
grisFertilizantesLitrosHa = excedenteN * 1000000 / 35 + excedenteP * 1000000 / 4
grisFertilizantesLitrosKg = grisFertilizantesLitrosHa / rendimientoSecoKgHa
```

Agua gris por fitosanitarios:

```text
IA_ha = dosisLtHa * concentracion% / 100
potencialCPP = ponderacion(Koc, persistencia, dosis, textura, drenaje, materia organica, lluvia, manejo)
grisAgroquimicosLitrosHa = suma(IA_ha * potencialCPP) / 0.0005
grisAgroquimicosLitrosKg = grisAgroquimicosLitrosHa / rendimientoSecoKgHa
```

Total:

```text
huellaTotalLitrosKg = verdeLitrosKg + azulLitrosKg + grisLitrosKg
litrosKcal = huellaTotalLitrosKg / kcalPorKg
```

Calidad ya implementada:

- Score arranca en 100.
- Baja si falta clima, rendimiento, riego ante deficit, o datos operativos.
- Alta desde 80, media desde 55, baja debajo de 55.

## 6. Prediccion de malezas

Ubicacion:

- `sdc-datos/src/entidades/algoritmos/service.ts`

Aplica a:

- Trigo.
- Soja.
- Maiz.

Inputs:

- Cultivo.
- Modelos de malezas cargados.
- Fecha de siembra.
- Ubicacion del lote.
- Clima historico Open-Meteo.
- Pronostico Open-Meteo 7 dias.
- Sensor de suelo si existe.

Formula:

```text
factorTermico = max(0, temperatura - temperaturaBase)
factorHidrico = 1 / (1 + exp((theta50 - humedad) / escala))
HTT_dia = factorTermico * factorHidrico * deltaHoras
HTT_acumulado += HTT_dia
emergenciaPct = K * exp(-exp(-beta * (HTT - mu)))
progresoPct = HTT_total / horasTermicasUmbral * 100
avancePct = max(emergenciaProyectada7dPct, progresoE10)
```

Salida:

- Maleza.
- Avance porcentual.
- Emergencia actual y proyectada.
- Horas termicas/hidricas acumuladas.
- Severidad.
- Recomendacion.
- Fuente/calidad.

Calidad ya implementada:

- Alta: sensor de temperatura/humedad de suelo + 14 dias historicos + 3 dias forecast.
- Media: al menos 7 dias historicos + 3 dias forecast.
- Baja: datos parciales o proxy climatico.

## 7. Riesgos agroclimaticos: helada y granizo

Ubicacion:

- `sdc-api-predicciones/src/entidades/agroclima/service.ts`
- `sdc-modelos/src/entidades/crono.ts`

Fuente climatica:

- Open-Meteo forecast 7 dias.
- Variables: temperatura minima/maxima, lluvia, probabilidad de precipitacion, CAPE, showers, codigo de tiempo y rafagas.

### Helada

Aplica solo a cultivos perennes configurados: manzano, peral, vid, pecan y otros incluidos en `esCultivoPerenne`.

Inputs:

- Cultivo.
- Variedad.
- Fecha y etapa fenologica estimada.
- Temperatura minima pronosticada.
- Umbrales fenologicos de dano leve y severo.
- Ajuste varietal si esta cargado en semilla.

Formula:

```text
puntoMedio = (umbralLeveC + umbralSeveroC) / 2
si Tmin <= umbralSeveroC => posibilidad = 95
si Tmin <= puntoMedio => posibilidad = 75
si Tmin <= umbralLeveC => posibilidad = 50
si Tmin <= umbralLeveC + 1 => posibilidad = 25
si Tmin <= umbralLeveC + 2 => posibilidad = 10
si no => posibilidad = 5
```

Niveles:

- Alto: >= 70.
- Medio: >= 35.
- Bajo: menor a 35.

Salida:

- Posibilidad de dano por helada.
- Fecha critica.
- Etapa fenologica.
- Umbral usado.
- Fuente del umbral.
- Evidencia y recomendacion.

### Granizo

Aplica a todos los cultivos.

El modulo no consume una alerta oficial de granizo ni radar meteorologico.
Calcula un **riesgo operativo estimado** a partir de proxies convectivos de
Open-Meteo. La lectura se limita cuando no hay disparador humedo para evitar
falsos positivos en dias sin lluvia/chaparron.

Inputs:

- `weather_code`: codigos de chaparron/tormenta.
- `CAPE`: energia convectiva.
- `precipitation_probability`: probabilidad de precipitacion.
- `precipitation_sum` y `showers_sum`: lluvia/chaparrones previstos.
- `wind_gusts_10m_max`: rafagas maximas.
- `temperature_2m_max`: contexto termico.

Formula de score corregida:

```text
score = 0
weatherCode 96/99 suma 30 como proxy fuerte y exige validacion local/radar
weatherCode 95 suma 22
weatherCode 82 suma 14; 81 suma 10; 80 suma 6
CAPE >= 2000 suma 26; >= 1000 suma 18; >= 500 suma 10; >= 250 suma 4
lluvia >= 20 mm suma 12; >= 10 suma 8; >= 3 suma 4
probabilidadLluvia >= 75 suma 15; >= 50 suma 10; >= 30 suma 5
showers >= 8 suma 15; >= 3 suma 10; >= 0,5 suma 4
rafaga >= 70 suma 8; >= 50 suma 5
temperaturaMax >= 24 suma 3 solo si hay tormenta o CAPE >= 250

Si no hay lluvia/chaparrones/probabilidad >= 30 y no hay tormenta:
  score maximo = 5, o 8 si CAPE >= 500
Si hay tormenta pero falta soporte humedo:
  score maximo = 16, o 24 para codigo 96/99
Si hay codigo de chaparron aislado sin precipitacion asociada:
  score maximo = 6

posibilidad = clamp(round(score), 0, 100)
```

Calidad del dato:

- `media`: al menos tres soportes convectivos y cuatro variables disponibles.
- `baja`: soporte parcial o variables incompletas.
- `sin_datos`: no hay variables utiles.

La plataforma muestra la calidad porque el dato proviene de clima de zona y no
de sensor/radar en campo.

Niveles:

- Alto: >= 65.
- Medio: >= 35.
- Bajo: menor a 35.

## 8. Frio y acumulacion termica

Ubicacion:

- `sdc-modelos/src/entidades/crono.ts`
- Front de detalle: `sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-frio-termico/`

Inputs:

- Cultivo y variedad.
- Fecha de plantacion/siembra.
- Etapa fenologica.
- Serie diaria de temperatura minima/maxima/promedio.
- Lluvia.

Indicadores:

- Horas frio.
- Frio efectivo.
- Chill Portions.
- Grados dia.
- Riesgo de dano por helada fenologica.

Configuracion actual Pecan:

```text
horasFrioObjetivo = 500
horasFrioEfectivasObjetivo = 400
porcionesFrioObjetivo = 35
temperaturaBaseGradosDia = 10
gradosDiaBrotacionObjetivo = 120
```

Observacion:

- En planta joven, el frio sirve para dormancia y brotacion vegetativa, pero no debe comunicar floracion, llenado ni cosecha como objetivo productivo si la planta aun no esta en edad productiva.
- El front ya debe diferenciar plantacion joven de plantacion productiva.

## 9. Indice verde / satelite

Ubicacion:

- `sdc-ndvi-worker/calcular_ndvi.py`
- `sdc-ndvi-worker/recorte.py`
- `sdc-app-chaman/src/app/main/modulo-productor/lotes/detalles-lote/card-ndvi/`

Fuente:

- Microsoft Planetary Computer STAC.
- Colecciones: Sentinel-2 L2A y Landsat Collection 2 L2.

Bandas:

- NDVI: NIR y Red.
- SAVI: NIR y Red.
- NDWI: Green y NIR.
- NDMI: NIR y SWIR1.
- NDRE: NIR y Red Edge.
- EVI: NIR, Red y Blue.

Mascara de calidad:

- Sentinel-2 usa SCL y acepta clases 4 vegetacion, 5 suelo desnudo y 6 agua.
- Landsat usa QA_PIXEL y excluye fill, cloud, cirrus, cloud shadow y snow; requiere clear bit.

Formulas:

```text
NDVI = (NIR - RED) / (NIR + RED)
SAVI = 1.5 * (NIR - RED) / (NIR + RED + 0.5)
NDWI = (GREEN - NIR) / (GREEN + NIR)
NDMI = (NIR - SWIR1) / (NIR + SWIR1)
NDRE = (NIR - RED_EDGE) / (NIR + RED_EDGE)
EVI = 2.5 * (NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1)
```

Render:

- El render usa escala fija por indice, no normalizacion por escena.
- Esto es correcto para evitar que dos fechas con valores parecidos se vean con colores extremos por normalizacion local.

Salida:

- Promedios por indice.
- Imagen PNG por indice.
- Mascara y QA: pixeles validos, cobertura valida, checksum, escala de render.

Calidad recomendada:

- Alta: cobertura valida >= 80%, escena limpia, sin fallback visual.
- Media: cobertura 50-80%, advertencia visible.
- Baja: cobertura < 50%, nubes/sombras fuertes o correccion legacy.
- Insuficiente: sin pixeles validos.

## 10. Carga fitosanitaria

Ubicacion revisada:

- Front de lote: tarjeta de carga fitosanitaria.
- Datos base: enfermedades vigentes + fumigaciones registradas + variedad/cultivo.

Inputs:

- Predicciones de enfermedades vigentes.
- Aplicaciones/fumigaciones.
- Recencia operativa.
- Cultivo y variedad.

Formula funcional esperada:

```text
presionSanitaria = max(riesgosEnfermedadVigentes)
cargaAplicaciones = ponderacion de aplicaciones registradas, principio activo, dosis y recencia
recenciaOperativa = score por aplicaciones recientes
cargaTotal = ponderacion(presionSanitaria, cargaAplicaciones, recenciaOperativa)
```

Observacion:

- Se corrigio recientemente que la tarjeta no debe contar cantidad de enfermedades como 75/100 si el riesgo real es 7%.
- El criterio profesional debe separar:
  - riesgo sanitario por enfermedad;
  - carga real por aplicaciones;
  - recencia de manejo;
  - impacto acumulado por cultivo/lote.

## 11. Hallazgos y riesgos actuales

1. Enfermedades no expone aun una calidad de input equivalente a huella/malezas.
2. El fallback FieldClimate -> Open-Meteo puede cambiar la calidad del resultado y debe quedar visible.
3. Cebada esta cargada como motor operativo interno; debe figurar como version validable y no como formula bibliografica cerrada.
4. Maiz tiene una diferencia entre comentario y codigo en Roya del Maiz (`DHR` negativo en comentario, positivo en implementacion).
5. Los multiplicadores varietales deben documentarse como susceptibilidad o resistencia para evitar inversiones de sentido.
6. Toda alerta deberia guardar version de motor, inputs minimos y fuente real.
7. Si no hay sensor propio, el front debe evitar lenguaje de certeza fuerte.

## 12. Propuesta de implementacion siguiente

### Backend

Crear un contrato comun:

```ts
interface ICalidadInputMotor {
  calidadInput: 'alta' | 'media_alta' | 'media' | 'baja' | 'insuficiente';
  scoreInput: number;
  fuentePrincipal: string;
  tipoFuente: 'medida' | 'estacion_cercana' | 'modelo_publico' | 'estimada';
  distanciaMetros?: number;
  coberturaDiasPct?: number;
  ultimaActualizacion?: string;
  fallbackUsado?: string;
  variablesFaltantes?: string[];
  observacion?: string;
}
```

Agregarlo a:

- Predicciones de enfermedades.
- Malezas.
- Riego.
- Huella hidrica.
- Riesgos agroclimaticos.
- NDVI.

### Front

Mostrar en cada tarjeta:

- Badge: `Dato medido`, `Estacion cercana`, `Open-Meteo`, `Estimado`.
- Color: verde/azul/ambar/rojo segun calidad.
- Modal con detalle: fuente, distancia, cobertura, fecha de actualizacion, variables faltantes.

Texto recomendado:

- Alta: "Dato medido en campo o estacion asignada."
- Media alta: "Dato de estacion fisica cercana."
- Media: "Dato climatico publico por coordenada."
- Baja: "Calculo con variables estimadas; validar a campo."
- Insuficiente: "No hay datos suficientes para calcular."

## 13. Archivos revisados

- `sdc-api-predicciones/src/entidades/clima/repository.ts`
- `sdc-api-clima/src/entidades/clima/service.ts`
- `sdc-api-predicciones/src/entidades/prediccion/enfermedades/*.ts`
- `sdc-api-predicciones/src/entidades/prediccion/cultivos/*.ts`
- `sdc-api-predicciones/src/entidades/riego/service.ts`
- `sdc-api-predicciones/src/entidades/riego/riego-v12.engine.ts`
- `sdc-datos/src/entidades/algoritmos/huella-hidrica.engine.ts`
- `sdc-datos/src/entidades/algoritmos/service.ts`
- `sdc-api-predicciones/src/entidades/agroclima/service.ts`
- `sdc-modelos/src/entidades/crono.ts`
- `sdc-ndvi-worker/calcular_ndvi.py`
- `sdc-ndvi-worker/recorte.py`

## 14. Decision recomendada

Antes de tocar mas formulas, el proximo cambio profesional deberia ser implementar la calidad del input como contrato comun. Eso permite que CHAMAN siga calculando todos los motores, pero comunica al usuario si el resultado viene de sensor, estacion cercana, modelo publico o estimacion. Para una plataforma sanitaria/agronomica, esa trazabilidad es tan importante como el porcentaje de riesgo.
