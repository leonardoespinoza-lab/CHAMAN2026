# Matriz científica de clasificación térmica de cultivos

Fecha de revisión: 16 de julio de 2026.

## Alcance y regla de seguridad

Esta matriz clasifica el proceso térmico que corresponde a los diez cultivos
canónicos de Chaman. No asigna coeficientes numéricos a una variedad cuando no
existe una fuente identificable.

Una referencia general de cultivo puede servir para mostrar clima o una
fenología orientativa, pero no habilita una predicción varietal automática. La
activación requiere que la ficha de la semilla conserve modelo, unidad,
parámetros, fuente y estado `validado`.

## Matriz operativa

| Cultivo | Proceso principal | Unidades admisibles | Evidencia varietal mínima | Bloqueos |
| --- | --- | --- | --- | --- |
| Manzano | Dormancia perenne + forzado | HF o CP; luego GDH/GDD | Modelo rector, requisito en su unidad, fuente, estado y biofix | HFE no gobierna; no convertir HF/CP; frío cumplido no confirma brotación |
| Peral | Dormancia perenne + forzado | HF o CP; luego GDH/GDD | Modelo rector, requisito, fuente, estado y biofix | No extrapolar desde manzano u otro cultivar |
| Vid | Dormancia de yemas + forzado | HF o CP; luego GDH/GDD | Modelo rector, requisito, fuente, estado y biofix | `0/0/0` es sin calibrar; no inferir desde el ciclo |
| Pecan | Dormancia perenne + forzado | HF o CP; luego GDH/GDD | Modelo rector, requisito, fuente, estado y biofix | El requisito cambia entre cultivares; frío y calor interactúan |
| Trigo | Vernalización cereal + temperatura + fotoperíodo | VU para modelos que realmente las implementen; días equivalentes para la ventana Chaman; GDD y horas de luz | Hábito, ventana/modelo implementado, requisito, rango térmico, fuente y estado | No usar HF/CP; el ciclo comercial no demuestra vernalización; no llamar APSIM a una ventana simple |
| Cebada | Vernalización cereal + temperatura + fotoperíodo | VU para modelos que realmente las implementen; días equivalentes para la ventana Chaman; GDD y horas de luz | Hábito, ventana/modelo implementado, requisito, rango térmico, fuente y estado | No usar HF/CP; no inferir hábito desde el ciclo |
| Soja | Térmico-fotoperiódico | GDD y horas de luz | Temperaturas cardinales, objetivos por fase, respuesta fotoperiódica y fuente | El grupo de madurez no es una calibración completa |
| Maíz | Térmico-fotoperiódico | GDD y horas de luz | Base, techo, método GDD, objetivos por fase y respuesta fotoperiódica | No mezclar métodos ni extrapolar entre híbridos |
| Arveja | Térmico-fotoperiódico; vernalización opcional según genotipo | GDD y horas de luz; días equivalentes solo con ventana varietal calibrada | Base, método, objetivos por etapa, respuesta fotoperiódica y, si corresponde, respuesta varietal a vernalización | No universalizar 0 °C o 4/5 °C; no usar HF/CP ni copiar VU de trigo |
| Papa | Térmico-fotoperiódico y tuberización | GDD y horas de luz | Cardinales, fases, respuesta de tuberización y fuente | GDD solo no confirma inicio de tuberización |

## Implementación en Chaman

- La matriz está codificada en
  `sdc-modelos/src/motores/clasificacion-termica-cultivos.ts`.
- `evaluarEvidenciaTermicaVarietal()` solo devuelve
  `operativo_con_variedad` cuando la ficha cumple el contrato completo. En
  perennes una ficha puede quedar como
  `perfil_varietal_validado_requiere_biofix`: el clima puede compararse con la
  referencia, pero el inicio real de brotación/floración se registra a campo.
- En perennes, HFE se preserva por trazabilidad histórica, pero nunca habilita
  decisiones.
- En Trigo y Cebada, la interfaz admin utiliza el campo canónico
  `parametrosAgrometeorologicos` que ya consume el motor climático.
- La vernalización tiene `estadoVernalizacion` propio: validar esta respuesta
  no cambia el estado de Kc, GDD u otros parámetros agronómicos. El estado
  global nunca reemplaza al estado específico, incluso en registros legacy.
- El único modelo expuesto es `ventana_calibrada`. El cálculo vigente suma la
  fracción diaria de horas dentro del rango térmico y expresa el requisito en
  días equivalentes de esa ventana; no implementa las
  ecuaciones APSIM, por lo que Chaman no debe mostrar esa marca.
- Soja, Maíz, Arveja y Papa permanecen en calibración varietal para predicción
  térmico-fotoperiódica mientras el esquema no conserve una respuesta
  fotoperiódica completa y trazable.
- En Arveja el comportamiento por defecto continúa siendo
  térmico-fotoperiódico. La interfaz permite activar vernalización únicamente
  para una variedad documentada; no usa horas de frío de frutales ni aplica un
  requisito genérico a toda la especie.

## Estado de las variedades Kleppe cargadas

El seed local contiene Rosy Glow, Red King Oregon, Rocha y Williams/Bartlett
con objetivos iniciales HF/CP y una fuente interna editable. Las cuatro fichas
declaran `requiere_calibracion`; por lo tanto, la matriz las conserva como
referencia y no las eleva automáticamente a modelo varietal operativo. Esto
evita presentar como validación científica un valor inicial de trabajo.

## Auditoría de la base de testing

Lectura de solo consulta realizada el 16 de julio de 2026 sobre 770 fichas:

| Cultivo | Fichas | Hallazgo térmico |
| --- | ---: | --- |
| Manzano | 17 | 17 con HFE legacy; 0 con fuente, modelo rector y estado validado |
| Peral | 18 | 18 con HFE legacy; 0 con fuente, modelo rector y estado validado |
| Vid | 61 | 61 bloques vacíos/nulos de frío; 0 requisitos varietales utilizables |
| Pecan | 16 | 16 conversiones mecánicas HF→HFE/CP; 0 fuentes identificadas |
| Trigo | 141 | 0 fichas con vernalización varietal calibrada |
| Cebada | 12 | 0 fichas con vernalización varietal calibrada |
| Soja | 270 | No corresponde dormancia ni vernalización |
| Maíz | 203 | No corresponde dormancia ni vernalización |
| Arveja | 19 | No corresponde dormancia; ninguna ficha actual documenta una respuesta varietal a vernalización |
| Papa | 13 | No corresponde dormancia ni vernalización |

La migración no inventa umbrales. Conserva el valor original en un bloque
legacy con respaldo y checksum, elimina HFE como dato rector, elimina CP
obtenidas mediante divisiones mecánicas y deja las fichas sin fuente en
`requiere_calibracion`. En particular, la bibliografía de pecán contradice la
idea de una conversión universal: reporta diferencias varietales amplias e
interacción entre frío otoñal y calor de primavera.

Para Trigo y Cebada, completar las 153 variedades exige evidencia del hábito,
respuesta a vernalización y fotoperíodo del cultivar. Hasta que esa evidencia
se cargue en el admin, Chaman puede mostrar clima, GDD y fenología observada,
pero no debe declarar una respuesta varietal de vernalización.

## Fuentes principales

- Trigo argentino: [Jardón et al., modelo genético con temperatura,
  vernalización y fotoperíodo](https://academic.oup.com/jxb/article/76/8/2162/8005022).
- Trigo y fotoperíodo: [Pérez-Gianmarco et al.,
  Ppd-1](https://academic.oup.com/jxb/article/71/3/1185/5607826).
- Cebada: [respuesta de cultivares a fotoperíodo y
  vernalización](https://pubmed.ncbi.nlm.nih.gov/17245568/).
- Soja: [algoritmo fototérmico y diferencias entre
  cultivares](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2019.01755/full).
- Arveja: [variación genotípica y ambiental del tiempo
  térmico](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2021.688067/full)
  y [respuesta a vernalización dependiente del
  genotipo](https://doi.org/10.1093/jxb/26.6.860).
- Papa: [variación genética y control fotoperiódico del momento de
  tuberización](https://doi.org/10.1093/jxb/erm140).
- Manzano: [requisitos de frío y calor de diez
  cultivares](https://www.sciencedirect.com/science/article/pii/S0304423825001839)
  y [revisión de modelos de
  dormancia](https://www.frontiersin.org/journals/horticulture/articles/10.3389/fhort.2023.1217689/full).
- Peral: [requisito de frío para ruptura de dormancia en seis cultivares
  europeos](https://www.actahort.org/books/909/909_7.htm) y
  [evaluación de 61 accesiones en ambientes
  mediterráneos](https://doi.org/10.3390/horticulturae7030045).
- Vid: [interacción de temperatura y duración del frío sobre
  brotación](https://doi.org/10.21273/HORTSCI.34.6.1).
- Pecan: [ensayo de doce cultivares bajo frío
  artificial](https://www.alice.cnptia.embrapa.br/handle/doc/1152922) y
  [síntesis de extensión sobre variación
  varietal](https://site.extension.uga.edu/pecan/2015/02/pecans-and-chilling/).
