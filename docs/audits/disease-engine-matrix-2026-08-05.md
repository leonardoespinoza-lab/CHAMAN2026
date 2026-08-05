# Matriz sanitaria completa de CHAMAN2026

**Fecha de corte:** 5 de agosto de 2026  
**Rama revisada:** `codex/platform-engine-ux-audit`  
**Alcance:** los 34 identificadores sanitarios del catálogo canónico, sus implementaciones, compuertas y pruebas. Esta matriz no modifica producción.

## Resultado ejecutivo

CHAMAN2026 cataloga **34 patologías**. El estado real no es homogéneo:

| Estado técnico | Cantidad | Significado |
|---|---:|---|
| Fórmula o motor implementado | 10 | Existe cálculo, pero el cálculo puede seguir siendo provisional |
| Screening experimental | 4 | Sirve para recorrida; nunca diagnostica ni alerta automáticamente |
| Sin modelo | 20 | No se inventa un número; queda pendiente una fuente y validación |
| Capaz de emitir alerta con el contrato vigente | 1 | Mancha en Red v4, únicamente con evidencia horaria, calidad y resistencia suficientes |

La saturación matemática no es evidencia biológica. Un resultado `100/100` provisional, experimental o sin contrato completo **no puede volver rojo un lote ni crear una alarma**. La nueva prueba integral recorre los 34 identificadores y fuerza ese comportamiento.

La lectura de producción detectó además un registro histórico `soja.fin_ciclo` v3 sin el campo de validación explícito. El candidato corrige el contrato compartido: la ausencia de validación ya no se interpreta como compatibilidad; sólo `validacion: operativo` puede entrar al dominio operativo.

## Matriz enfermedad por enfermedad

| Cultivo | Identificador | Patología | Implementación actual | Variables principales | Estado de validación | Alerta automática |
|---|---|---|---|---|---|---|
| Trigo | `trigo.mancha_amarilla` | Mancha Amarilla | v5, contrato Chaman 2026 | DPrHRT, DPr, resistencia, GDD/etapa | Provisional; fórmula reproducida, sin validación regional de desempeño | No |
| Trigo | `trigo.mancha_hoja` | Mancha de la Hoja | v5, contrato Chaman 2026 | DHR, DPr, resistencia, GDD/etapa | Provisional | No |
| Trigo | `trigo.roya_hoja` | Roya de la Hoja | v5, contrato Chaman 2026 | GD, DHR, resistencia, GDD/etapa | Provisional | No |
| Trigo | `trigo.roya_tallo` | Roya del Tallo | Sin fórmula | — | Sin modelo | No |
| Trigo | `trigo.roya_anaranjada` | Roya Amarilla/Estriada | v5, criterio horario de oportunidad ambiental; el ID legado se conserva por compatibilidad | T, HR, lluvia y rachas horarias en 10 días | Experimental; no equivale a la ecuación histórica ni a presencia de *P. striiformis* | No |
| Trigo | `trigo.fusarium_espiga` | Fusarium de la Espiga | v5, contrato Chaman 2026 | PMoj, GDN, ventana desde antesis, resistencia | Provisional; exige antesis y cobertura meteorológica | No |
| Cebada | `cebada.mancha_red` | Mancha en Red | v4, presión de infección en ventana móvil | mojado continuo, temperatura durante mojado, persistencia, variedad | Operativa sólo con cobertura horaria suficiente; si no, provisional y limitada | **Sí, condicional** |
| Cebada | `cebada.escaldadura` | Escaldadura | v3, screening ambiental | temperatura, mojado foliar, precipitación, variedad | Provisional; falta calibración regional | No |
| Cebada | `cebada.roya_hoja` | Roya de la Hoja | v3, acumulativo heredado | GD, DHR, precipitación, HR, variedad | Provisional | No |
| Cebada | `cebada.fusariosis_espiga` | Fusariosis de la Espiga | v3, ventana reproductiva | PMoj, GDN, GDD, lluvia, HR, temperatura, variedad | Provisional; requiere validación local | No |
| Soja | `soja.fin_ciclo` | Enfermedades de Fin de Ciclo | v3, screening pluviométrico acumulativo | precipitación ≥7 mm, DPr7, PtAc7, Lt7, variedad | Provisional; no es incidencia ni diagnóstico | No |
| Soja | `soja.cancro_tallo` | Cancro del Tallo | Sin fórmula | — | Sin modelo | No |
| Soja | `soja.phytophthora` | Podredumbre de Raíz y Tallo | Sin fórmula | — | Sin modelo | No |
| Soja | `soja.muerte_repentina` | Síndrome de Muerte Repentina | Sin fórmula | — | Sin modelo | No |
| Soja | `soja.mancha_ojo_rana` | Mancha Ojo de Rana | Sin fórmula | — | Sin modelo | No |
| Maíz | `maiz.roya` | Roya del Maíz | v3, fórmula heredada de roya de hoja de trigo | GD, DHR, precipitación, HR, variedad | Provisional; debe reemplazarse o validarse específicamente en maíz | No |
| Maíz | `maiz.tizon_foliar` | Tizón Foliar | Sin fórmula | — | Sin modelo | No |
| Arveja | `arveja.ascochyta` | Complejo Ascochyta | v2, screening | temperatura, mojado foliar, lluvia, etapa | Experimental | No |
| Arveja | `arveja.mildiu` | Mildiu | v2, screening | temperatura, mojado foliar, HR, etapa | Experimental | No |
| Arveja | `arveja.oidio` | Oídio | v2, screening | temperatura, lluvia, etapa reproductiva | Experimental | No |
| Vid | `vid.oidio` | Oídio | Sin fórmula | — | Sin modelo | No |
| Vid | `vid.botritis` | Botritis | Sin fórmula | — | Sin modelo | No |
| Vid | `vid.mildiu` | Mildiu | Sin fórmula | — | Sin modelo | No |
| Papa | `papa.tizon_tardio` | Tizón Tardío | Sin fórmula | — | Sin modelo | No |
| Papa | `papa.tizon_temprano` | Tizón Temprano | Sin fórmula | — | Sin modelo | No |
| Papa | `papa.rhizoctonia` | Rhizoctonia | Sin fórmula | — | Sin modelo | No |
| Manzano | `manzano.sarna` | Sarna | Sin fórmula | — | Sin modelo | No |
| Manzano | `manzano.oidio` | Oídio | Sin fórmula | — | Sin modelo | No |
| Frutales | `frutales.fuego_bacteriano` | Fuego Bacteriano | Sin fórmula | — | Sin modelo | No |
| Manzano | `manzano.carpocapsa` | Carpocapsa | Sin fórmula | — | Sin modelo | No |
| Peral | `peral.sarna` | Sarna | Sin fórmula | — | Sin modelo | No |
| Peral | `peral.psila` | Psila | Sin fórmula | — | Sin modelo | No |
| Pecán | `pecan.sarna` | Sarna | Sin fórmula | — | Sin modelo | No |
| Pecán | `pecan.bacteriosis` | Bacteriosis | Sin fórmula | — | Sin modelo | No |

## Compuerta canónica de alerta

Para que una lectura sanitaria cree una alarma debe cumplir simultáneamente:

1. estado `calculado`, valor finito entre 0 y 100 y lectura vigente;
2. definición canónica con motor operativo;
3. versión y validación operativas;
4. calidad de datos superior a baja;
5. resistencia varietal utilizable cuando corresponda;
6. ventana fenológica y cobertura meteorológica suficientes;
7. umbral y evidencia específica de la patología.

En Mancha en Red v4 se agregan cobertura de ventana, al menos un día favorable y presión alta. En Fusarium de trigo no basta el intercepto de la ecuación: se necesita al menos un período de mojado compatible. Las salidas experimentales, provisionales y sin modelo permanecen visibles para seguimiento, pero no entran al semáforo rojo.

## Evidencia automatizada del 5 de agosto

- Suite completa de `sdc-api-predicciones`: **23 suites y 184 pruebas aprobadas** antes de sumar el inventario.
- Inventario sanitario nuevo: **27 pruebas aprobadas**; verifica los 34 IDs, ausencia de duplicados, bloqueo de saturaciones provisionales y contrato estricto de Mancha en Red v4.
- La suite vuelve a ejecutarse completa antes de desplegar a Railway testing.

## Lectura científica y límites

La bibliografía respalda que la coincidencia entre clima favorable, etapa susceptible, hospedante y patógeno es necesaria; no autoriza a interpretar humedad alta como enfermedad confirmada. La revisión moderna de modelos de Fusarium muestra además que muchos son específicos de región y que su desempeño cae al trasladarlos sin recalibración. Por eso Chaman separa **oportunidad ambiental**, **índice predictivo** y **diagnóstico de campo**.

Fuentes de contraste:

- [Matengu et al., revisión de modelos meteorológicos de Fusarium en trigo y cebada](https://bsppjournals.onlinelibrary.wiley.com/doi/10.1111/ppa.13839).
- [INTA: enfermedades foliares de trigo y cebada, monitoreo y cultivares](https://intainforma.inta.gob.ar/trigo-y-cebada-que-hacer-frente-a-las-enfermedades-foliares/).
- [El-Mor et al., diversidad y fenotipado de Mancha en Red](https://apsjournals.apsnet.org/doi/10.1094/PDIS-07-17-0980-RE).

## Próximas validaciones científicas prioritarias

1. Contrastar Mancha en Red v4 contra observaciones de lote y medir falsos positivos/negativos.
2. Calibrar escaldadura, roya de cebada y fusariosis por región, variedad y estado observado.
3. Sustituir la fórmula heredada de roya de maíz por una fuente específica y un dataset local.
4. Validar la fórmula de fin de ciclo de soja con resultados de campo y separar enfermedades componentes.
5. Incorporar modelos faltantes sólo con ecuación trazable, dominio de validez, dataset y protocolo de validación.
