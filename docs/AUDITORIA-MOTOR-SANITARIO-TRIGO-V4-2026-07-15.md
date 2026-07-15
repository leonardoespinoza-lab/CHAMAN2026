# Auditoría del motor sanitario de trigo v4

Fecha: 15 de julio de 2026

Alcance: motor productivo, simulador administrativo, tarjeta del lote, alertas y bases Excel.

Contrato funcional: fórmulas de la captura aprobada por el equipo de Chaman.

## Resultado ejecutivo

La versión v4 separa tres conceptos que antes se mezclaban:

1. predicción meteorológica de severidad o incidencia;
2. enfermedad sospechada por monitoreo;
3. enfermedad confirmada a campo o por diagnóstico.

Una ecuación climática no confirma la presencia del patógeno. Las alertas automáticas sólo pueden salir de un modelo operativo validado, con resistencia varietal conocida, ventana fenológica/térmica válida y calidad suficiente. En v4, todos los modelos de trigo permanecen provisionales o experimentales: sus resultados pueden verse para calibración, pero no generan alertas, notificaciones ni prescripciones automáticas.

## Identidad y estado de los modelos

| ID estable | Nombre agronómico | Patógeno | Estado v4 |
|---|---|---|---|
| `trigo.mancha_amarilla` | Mancha amarilla | *Pyrenophora tritici-repentis* / denominación histórica *Drechslera tritici* | Operativo provisional |
| `trigo.mancha_hoja` | Mancha de la hoja / septoriosis | *Zymoseptoria tritici* / denominación histórica *Septoria tritici* | Operativo provisional |
| `trigo.roya_hoja` | Roya de la hoja, parda o anaranjada | *Puccinia triticina* | Operativo provisional |
| `trigo.roya_anaranjada` | ID legado; la interfaz muestra roya amarilla/estriada | *Puccinia striiformis* f. sp. *tritici* | Contrato en sombra + cribado científico provisional; sin alertas automáticas |
| `trigo.fusarium_espiga` | Fusariosis de la espiga | complejo *Fusarium* / *Gibberella zeae* | Operativo provisional |

El ID legado `trigo.roya_anaranjada` se conserva para no romper resistencias, predicciones ni lotes existentes. La nomenclatura visible sí se corrige: *P. triticina* es roya de la hoja, parda o anaranjada; *P. striiformis* es roya amarilla o estriada. Ninguna salida se presenta como diagnóstico.

## Contrato matemático v4

La escala varietal recibida es:

- S = 1
- MS = 0,75
- MR = 0,50
- R = 0,05

Aunque la planilla la llama "índice de resistencia", matemáticamente es un **factor de susceptibilidad**: cuanto mayor es, mayor es el resultado. El código v4 utiliza ese nombre para impedir otra inversión.

### Mancha amarilla

`CInf = -2,25 + 1,62·DPrHRT + 1,30·DPr`

`salida ajustada = CInf · factorSusceptibilidad`

- `DPr`: días con precipitación estrictamente mayor a 2 mm.
- `DPrHRT`: días con precipitación estrictamente mayor a 1 mm, HR ≥80 %, Tmax ≤32 °C y Tmin ≥8 °C.

### Mancha de la hoja

`CInf = -6,41 + 0,59·DHR + 2,79·DPr`

`salida ajustada = CInf · factorSusceptibilidad`

- `DPr`: días con precipitación estrictamente mayor a 10 mm.
- `DHR`: días con HR ≥80 %.

### Roya de la hoja

`Sev% = 4,42 + 0,61·GD + 0,57·DHR - 30,01·(1-factorSusceptibilidad)`

- `GD`: con HR >49 %, residual de temperatura media sobre 12 °C y techo 18 °C.
- `DHR`: días con precipitación ≤0,2 mm y HR >70 %.

### Contrato legado en sombra de roya amarilla/estriada

`Sev% = 5,15 + 0,72·GD + 0,48·DHR + 0,35·DL - 35,2·(1-factorSusceptibilidad)`

- `GD`: suma de temperatura media entre 7 y 14 °C cuando HR >60 %.
- `DHR`: días con HR >75 % y precipitación ≤5 mm.
- `DL`: días con 0,1–2,0 mm de precipitación como proxy de lluvia leve/niebla.
- Estado: cálculo contractual reproducible sólo para auditoría comparativa. No se publica como porcentaje de enfermedad, no alimenta el ranking y no genera alertas, prescripciones ni notificaciones porque no se encontró una fuente primaria trazable para esos coeficientes.

### Cribado horario de roya amarilla/estriada

El modelo visible usa la regla publicada por El Jarroudi et al. (2017), con las adaptaciones de Chaman declaradas de forma explícita:

- hora favorable: temperatura estrictamente mayor a 4 °C y menor a 16 °C, HR estrictamente mayor a 92 % y lluvia menor o igual a 0,1 mm;
- evento favorable: al menos cuatro horas continuas; un dato inválido o faltante corta la secuencia;
- evaluación: frecuencia de horas favorables sobre una ventana móvil de diez días, con al menos 90 % de cobertura horaria;
- 5–<15 %: señal ambiental temprana; 15–<20 %: ventana ambiental fuerte; ≥20 %: evidencia ambiental muy fuerte;
- ventana agronómica principal: Zadoks GS33–85; si falta una observación fenológica, 800–850 GDD base 0 °C sólo actúa como referencia conservadora y reduce la confianza.

El artículo trabajó con décadas calendario y condiciones europeas; usar una ventana móvil y aplicarlo en Argentina es una adaptación Chaman que requiere calibración regional. La salida es **oportunidad ambiental de infección**, nunca presencia, incidencia ni severidad confirmada.

La susceptibilidad S/MS/MR/R se informa por separado como modificador de prioridad de Chaman. El estudio no publicó un término equivalente al ajuste varietal contractual, por lo que el producto entre ambiente y susceptibilidad no se rotula como severidad científica. Si la resistencia es desconocida, antigua o no específica, se muestra la evidencia ambiental pero se bloquea cualquier automatización.

### Fusariosis de la espiga

`incidencia predicha (%) = 20,37 + 8,63·PMoj - 0,49·GDN`

`salida varietal ajustada = incidencia predicha · factorSusceptibilidad`

- `PMoj`: períodos de dos días con precipitación ≥0,2 mm y HR >81 % el día 1, y HR ≥78 % el día 2.
- `GDN`: suma de `Tmax-26` si Tmax >26 °C y `9-Tmin` si Tmin <9 °C.
- Inicio contractual: primeras espigas con anteras, representadas por Antesis o por observación fenológica.
- Fin: 530 GDD base 0 °C desde el inicio.

La ecuación publicada calcula incidencia sobre la ventana epidemiológica completa, no severidad. Su fuente original inicia la evaluación ocho días antes de espigazón/floración, mientras el contrato recibido inicia con las primeras anteras; esta diferencia queda marcada para calibración. Durante una ventana todavía abierta, Chaman sólo presenta un estimador acumulado parcial: no lo rotula como incidencia final, no confirma enfermedad y no habilita alertas. La multiplicación varietal es una adaptación contractual de Chaman y queda declarada como tal.

## Ventanas y calidad

- Manchas y royas comienzan al observar fin de macollaje/espiguilla terminal.
- Sin observación de campo, el inicio conservador es 850 GDD base 0 °C desde siembra.
- Se exige al menos 90 % de cobertura térmica para abrir la ventana por cálculo.
- Una observación fenológica real puede abrirla dentro del rango contractual 800–850 GDD.
- Los GDD negativos valen cero y nunca restan acumulación.
- Cada resultado conserva versión, fuente, alcance, factor varietal, GDD, cobertura y valor crudo anterior al límite visual 0–100.
- Los acumuladores v3 no se continúan en v4.
- El histórico separa las series por versión y no grafica como riesgo cero los estados `fuera_ventana`, `sin_datos` o `insuficiente`.
- Una predicción con clima incompleto, resistencia no trazable, salida cruda fuera del dominio 0–100 o campaña varietal vencida queda degradada y no puede cerrar ni abrir una alerta sanitaria.
- Una aplicación registrada no borra la historia meteorológica; su eficacia pertenece a la capa de manejo/monitoreo.

## Política de alertas y notificaciones

- `operativo`: única categoría que puede habilitar una alerta automática, si además supera todos los controles de calidad.
- `operativo_provisional`: cálculo visible para calibración; sin alerta, notificación ni prescripción automática.
- `experimental`: salida aislada para investigación; sin ranking de riesgo ni acción automática.
- Se evalúa sólo la predicción vigente más reciente, con una antigüedad máxima de 72 horas.
- Las notificaciones se deduplican por usuario, lote, enfermedad y evento; aplican enfriamiento, escalamiento de banda y recordatorio controlado para evitar alarmismo.
- Una entrada incierta nunca se interpreta como “riesgo cero” y no cierra una alerta activa confiable.

## Hallazgos en los Excel

- `Enfermedades en TRIGO -V1.xlsx` contiene la ecuación vieja de roya amarilla/anaranjada basada en Tmin, Tmax, viento y HR.
- `Enfermedades en TRIGO -V2.xlsx` mezcla la ecuación nueva con una hoja que conserva la vieja.
- V2 aplica `-coeficiente·IR` en las dos royas; la captura aprobada exige `-coeficiente·(1-IR)` con la escala S/MS/MR/R indicada.
- Los ejemplos Excel tienen fórmulas/semáforos rotos y no deben ejecutarse como fuente productiva.
- La base de campaña 26/27 agrega variedades, pero presenta faltantes de normalización y no incluye resistencia reciente para Mancha de la Hoja. No debe importarse silenciosamente sin resolver esos casos.

## Fuentes científicas verificadas

- Moschini y Fortugno, modelo de incidencia de Fusarium: https://doi.org/10.1007/BF01877959
- UNR, definiciones y validación regional de Fusarium: https://fcagr.unr.edu.ar/Extension/Informes%20tecnicos/fusariosistrigo1.htm
- Moschini y Pérez, modelo de roya de la hoja: https://doi.org/10.1094/PDIS.1999.83.4.381
- El Jarroudi et al. (2017), modelo horario de roya amarilla: https://doi.org/10.1094/PDIS-12-16-1766-RE
- Dennis (1987), modelo con mojado foliar real: https://doi.org/10.1016/S0007-1536(87)80194-8
- de Vallavieille-Pope et al. (1995), duración de mojado y temperatura: https://doi.org/10.1094/Phyto-85-409
- El Jarroudi et al. (2020), recalibración regional en Marruecos: https://doi.org/10.3390/agronomy10020280
- SENASA/SINAVIMO, *Puccinia triticina*: https://www.sinavimo.gob.ar/plaga/puccinia-recondita
- SENASA/SINAVIMO, *Puccinia striiformis*: https://www.sinavimo.gob.ar/plaga/puccinia-striiformis
- APS, necesidad de diagnóstico diferencial para mancha amarilla: https://www.apsnet.org/edcenter/pdlessons/Pages/TanSpot.aspx

## Pendientes de calibración

1. mantener la ecuación `5,15/0,72/0,48/0,35/35,2` en sombra hasta recuperar su publicación y dominio originales;
2. documentar las fuentes originales de las dos ecuaciones de manchas;
3. validar las salidas contra observaciones de lotes y registrar falsos positivos/negativos;
4. normalizar la campaña varietal 26/27 antes de migrarla;
5. persistir observaciones de enfermedad sospechada/confirmada con fecha, usuario y evidencia;
6. contrastar cada modelo contra una cohorte de lotes y una matriz de confusión antes de promoverlo de `operativo_provisional` a `operativo`.
7. calibrar el cribado horario de roya amarilla en una campaña argentina multi-sitio y validarlo en una campaña independiente antes de habilitar alertas.
