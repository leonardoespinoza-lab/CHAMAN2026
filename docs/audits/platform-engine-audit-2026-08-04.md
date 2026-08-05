# Auditoría integral de motores y experiencia CHAMAN2026

**Fecha de corte:** 4 de agosto de 2026  
**Rama de trabajo:** `codex/platform-engine-ux-audit`  
**Base de producción auditada:** `da9c63b`  
**Alcance:** lectura de producción, revisión de código, pruebas automatizadas y candidato de testing. Producción no fue modificada.

## Conclusión ejecutiva

CHAMAN2026 tiene una base operativa consistente para clima, jerarquía de fuentes, frío, acumulación térmica y trazabilidad. La principal falla transversal estaba en la **semántica y agregación sanitaria**: un valor saturado de un modelo provisional podía verse como “100%” y ser interpretado como probabilidad o enfermedad confirmada, aunque el propio registro indicara que no era alertable. La corrección se hizo en el evaluador canónico compartido, no lote por lote:

- **Rojo**: únicamente una salida vigente, operativa y que cumple el contrato completo de alerta.
- **Amarillo**: seguimiento agronómico o presión ambiental que merece recorrida, pero no confirma enfermedad.
- **Verde**: sin alerta operativa vigente.
- Los modelos no validados se expresan como **índice `/100`**, no como probabilidad.
- Los porcentajes se reservan para magnitudes cuyo modelo los define de ese modo, por ejemplo severidad/incidencia de una fórmula validada o cobertura de horas favorables claramente rotulada.

La revisión detectó que la mayor oportunidad no es “inventar” más fórmulas, sino cerrar con evidencia regional los cultivos que hoy tienen screening o carecen de modelo. Mostrar una salida provisional es útil; convertirla en diagnóstico o alerta automática no es científicamente defendible.

## Evidencia del estado de producción

La auditoría de solo lectura encontró:

| Evidencia | Resultado |
|---|---:|
| Lotes activos | 58 |
| Siembras activas | 58 |
| Series agrometeorológicas vigentes | 58/58 |
| Versión agrometeorológica vigente | `agromet-1.5.0` |
| Dispositivos asignados | 5 |
| Claves duplicadas de predicción | 0 |
| Salidas sanitarias que cumplen el contrato canónico completo de alerta | 0 |
| Cebadas con Mancha en Red v3 saturada | 3 |

Las tres lecturas saturadas de Mancha en Red estaban entre 99,86 y 100, eran **v3, provisionales y no alertables**. El problema visible era su presentación/agregación, no evidencia de enfermedad confirmada.

## Jerarquía de datos meteorológicos

La regla implementada y probada es por variable y por intervalo:

1. sensor de campo asignado;
2. central meteorológica asociada;
3. Open-Meteo como respaldo.

No se reemplaza una serie diaria completa por una lectura aislada. Tampoco se descarta el sensor porque otras variables del mismo día provengan de Open-Meteo. En los cuatro lotes Kleppe auditados, temperatura mínima/media/máxima y VPD aparecen como fuente `mixed`, con **100% de cobertura de temperatura de campo**; humedad, lluvia, viento, radiación y ET0 se completan con Open-Meteo. Por eso el rótulo general del agregado puede indicar Open-Meteo aunque la temperatura sí incorpore LoRa.

## Matriz de motores sanitarios

| Cultivo | Estado actual | Decisión segura |
|---|---|---|
| Trigo | 4 modelos operativos, 1 experimental y 1 patología sin modelo | Las fórmulas aprobadas conservan salida científica; el experimental nunca alerta |
| Cebada | Mancha en Red v4 con evidencia; 3 modelos heredados sin validación regional suficiente | Solo v4 puede llegar a alerta; los heredados quedan como screening `/100` |
| Soja | 1 fórmula heredada, 4 patologías sin modelo | Fórmula visible pero provisional; sin alertas automáticas |
| Maíz | 1 fórmula heredada y 1 patología sin modelo | La roya heredaba una ecuación de trigo: queda provisional hasta validación específica de maíz |
| Arveja | 3 screenings experimentales | Seguimiento ambiental y recorrida; no diagnóstico ni alerta |
| Vid | 3 patologías catalogadas sin motor | No calcular un número artificial |
| Papa | 3 patologías catalogadas sin motor | No calcular un número artificial |
| Manzano | 3 patologías catalogadas sin motor | No calcular un número artificial |
| Peral | 2 patologías catalogadas sin motor | No calcular un número artificial |
| Pecán | 2 patologías catalogadas sin motor | No calcular un número artificial |

### Contrato sanitario canónico

Una predicción solo puede elevar una alerta si, simultáneamente:

- está vigente y corresponde a la última salida cronológica;
- se encuentra dentro de la ventana fenológica/temporal aplicable;
- tiene calidad meteorológica suficiente;
- cuenta con resistencia varietal utilizable cuando la fórmula la requiere;
- identifica versión y validación del modelo;
- supera el umbral específico;
- satisface la evidencia ambiental mínima de esa patología.

Un resultado de `100/100` provisional **no** se vuelve rojo por saturación matemática. Esta regla ahora alimenta mapa, listado de lotes, detalle, dashboards de asesor/distribuidor/compañía, informes y alertas.

## Granizo

El motor usa un índice preventivo de vigilancia convectiva, no una probabilidad calibrada. Agrupa señales correlacionadas para no contar varias veces el mismo evento: código meteorológico, CAPE, precipitación/chaparrones, probabilidad de precipitación y ráfagas.

Correcciones de seguridad:

- CAPE alto sin lluvia o chaparrones queda limitado a un valor bajo.
- Un código de tormenta aislado sin volumen previsto no genera alerta.
- Los códigos WMO/Open-Meteo 96 y 99 son los únicos que explicitan granizo.
- El código 95, aun con convergencia severa, queda como **vigilancia amarilla máximo 69/100**; no crea una alarma roja automática sin granizo explícito.
- La ventana de alerta se limita a las próximas 72 horas y exige calidad media.
- El texto obliga a confirmar con pronóstico oficial, radar disponible u observación local antes de movilizar recursos.

Fuente técnica: [Open-Meteo, códigos WMO y variables del pronóstico](https://open-meteo.com/en/docs).

## Frío y acumulación térmica

Las pruebas verifican:

- horas de frío entre 0 y 7,2 °C;
- unidades Utah, incluyendo descuentos por calor;
- porciones de frío mediante Dynamic Model horario;
- separación entre aire y suelo: la temperatura de suelo no sustituye temperatura de aire;
- reinicio estacional y tratamiento explícito de huecos;
- prioridad sensor → central → Open-Meteo;
- GDD de forzado iniciado por biofix/etapa observada cuando el cultivo perenne lo requiere.

HF, Utah, CP y GDD se consideran **registros observacionales acumulados**, no metas varietales inventadas. Los hitos de campo registrados por el usuario permiten aprender cuántas unidades necesitó realmente cada variedad y ambiente.

Fuentes primarias del Dynamic Model: [Fishman et al., Acta Horticulturae 232](https://www.actahort.org/books/232/232_10.htm), DOI `10.17660/ActaHortic.1988.232.10`.

## Fenología

La fenología mantiene dos estados separados:

- **proyectado** por cronograma/modelo térmico;
- **observado** y registrado a campo.

La proyección no debe presentarse como confirmación. Las decisiones sanitarias sensibles priorizan un registro observado y, si solo existe una proyección, reducen confianza o bloquean la alerta según el contrato del modelo.

## Otros motores

| Motor | Estado | Riesgo u oportunidad |
|---|---|---|
| Riego | Jerarquía climática integrada | Separar claramente estimación meteorológica de lectura de lanza |
| Huella hídrica | Trazable y tolerante a faltantes | La cosecha debe quedar `incompleta`, no bloquearse por datos secundarios ausentes |
| Satélite | Escenas y QA disponibles | Ocultar escenas bloqueadas para uso agronómico y conservarlas solo en auditoría |
| Suelo | SoilGrids/INTA con procedencia | Mantener resolución y confianza visibles; no presentar dato regional como medición del lote |
| Frío/GDD | Fórmulas y fuentes cubiertas por pruebas | Completar calibración varietal con observaciones, no con objetivos no documentados |
| Login/roles | Suites de autorización existentes | Mantener matriz productor/asesor/distribuidor/compañía/tenant como prueba obligatoria de release |
| WebSocket | Reintentos y suites existentes | Agregar observabilidad de desconexiones y tasa de entrega en producción |

## Sistema visual Chaman

Se incorporó una capa global `Chaman Product Language` para Chaman y tenants:

- radios, espaciado, foco, estados y sombras como tokens compartidos;
- superficies neutras y suaves en lugar de franjas izquierdas de colores;
- estado representado por señal tonal pequeña, texto y fondo, no por decoración agresiva;
- hover/focus perceptible en superficies y botones interactivos;
- respeto de `prefers-reduced-motion`;
- diálogos y drawers contenidos en móvil;
- tarjetas de lotes reordenadas para lectura y toque en pantallas pequeñas;
- la identidad del tenant continúa aplicándose mediante sus variables de marca, mientras estructura y accesibilidad permanecen consistentes.

No se eliminaron mecánicamente todos los `border-left`: algunos son divisores de layout legítimos. La normalización se aplicó a las clases semánticas de tarjetas y estados para evitar romper tablas, timelines y gráficos.

## Verificación automatizada

El candidato acumuló más de **980 comprobaciones** sin fallos en las suites de modelos, predicciones, clima, cliente/API, autenticación, datos, LoRa, WebSocket, API externa y FTP. Además:

- compilación de modelos: aprobada;
- compilación de predicciones y cliente: aprobada;
- build de frontend: aprobada;
- pruebas focales de semáforo sanitario: aprobadas;
- pruebas focales de cebada heredada, soja y maíz provisional: aprobadas;
- pruebas conservadoras de granizo: aprobadas;
- revisión `git diff --check`: sin errores de whitespace.

La validación visual y por rol en Railway testing sigue siendo una compuerta obligatoria antes de cualquier promoción.

## Priorización

### P0 — resuelto en el candidato

1. Impedir que un índice provisional saturado se interprete como probabilidad/enfermedad.
2. Unificar semáforo sanitario entre mapa, lista, detalle, dashboards e informes.
3. Bloquear alerta de granizo sin código explícito de granizo.
4. Mantener modelos heredados no validados como seguimiento, nunca alerta.

### P1 — siguiente ciclo científico

1. Recalcular Mancha en Red v4 en testing y comparar contra observaciones de campo antes de migrar lecturas v3.
2. Calibrar modelos de cebada restantes por región, variedad y etapa observada.
3. Validar o reemplazar los modelos heredados de soja y maíz con bibliografía específica y dataset local.
4. Diseñar protocolos de campo para falsos positivos/falsos negativos y curvas ROC por modelo.
5. Completar fichas varietales con fuentes primarias y vigencia, separando dato documentado de estimación Chaman.

### P2 — producto y operación

1. Reducir el bundle principal y eliminar dependencias CommonJS que impiden optimización.
2. Añadir pruebas visuales de regresión en desktop, tablet y móvil por rol.
3. Instrumentar métricas de frescura de sensores, fallback climático, latencia, errores de raster y WebSocket.
4. Definir SLO por servicio y un tablero de salud operacional.

## Referencias científicas y técnicas

- [FAO Irrigation and Drainage Paper 56](https://www.fao.org/4/X0490E/X0490E00.htm).
- [Sentinel-2 User Handbook](https://sentinels.copernicus.eu/documents/247904/685211/Sentinel-2_User_Handbook).
- [Sentinel-2 Product Specification](https://sentinels.copernicus.eu/documents/d/sentinel/s2-pdgs-cs-di-psd-v15-0).
- Ryan & Clare, escaldadura de cebada, DOI `10.1016/0048-4059(75)90108-3`.
- [Revisión de modelos meteorológicos de Fusarium de la espiga](https://bsppjournals.onlinelibrary.wiley.com/doi/10.1111/ppa.13839), DOI `10.1111/ppa.13839`.
- Shaw, epidemiología de mancha en red, DOI `10.1111/j.1365-3059.1986.tb02018.x`.
- Petta & Lavilla, mancha en red, DOI `10.15517/am.v34i1.51028`.
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs).

## Criterio de salida a producción

No promover por “se ve bien” ni por un HTTP 200. La versión queda habilitada únicamente si:

1. CI utiliza el mismo SHA que Railway testing;
2. los roles productor, asesor, distribuidor, compañía, tenant y administrador cumplen su matriz de acceso;
3. mapa, listado, detalle, alerta e informe muestran el mismo semáforo para una misma siembra;
4. los lotes de cebada saturados dejan de verse como enfermedad confirmada;
5. los casos de sensor, central y Open-Meteo muestran fuente y frescura correctas;
6. desktop, tablet y móvil no presentan overflow ni controles inaccesibles;
7. existe rollback al SHA productivo anterior sin migraciones destructivas.
