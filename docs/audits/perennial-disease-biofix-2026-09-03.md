# Relevamiento sanitario de cultivos perennes

**Fecha:** 3 de septiembre de 2026  
**Alcance:** Vid, Manzano, Peral y Pecan.  
**Objetivo:** definir un aviso conservador de condiciones favorables para recorrida, nunca un diagnostico ni una prescripcion automatica.

## Hallazgo principal

La salida invernal no elimina el inoculo. Varios patogenos sobreviven en yemas, hojas caidas, corteza, frutos momificados o restos del cultivo. La brotacion o aparicion de tejido verde es el **biofix de susceptibilidad del hospedante**: desde ese momento la coincidencia entre tejido susceptible, inoculo plausible y ambiente favorable puede generar un aviso de recorrida.

El motor no debe comunicar "presencia" sin una observacion de campo persistida. Su salida automatica sera una de estas:

1. `dormancia_sin_tejido_susceptible`;
2. `monitoreo_por_inoculo_posible`;
3. `condiciones_favorables_recorrida`;
4. `evento_confirmado_campo`, exclusivamente con registro humano, fecha y evidencia;
5. `sin_datos_suficientes`.

## Estado actual en Chaman

| Cultivo | Catalogo actual | Estado real del motor | Correccion necesaria |
|---|---|---|---|
| Vid | Oidio, Botritis, Mildiu | Los tres figuran como `sin_modelo`; Vid no entra al servicio experimental de frutales | Incorporar un screening propio desde brotacion y por ventanas fenologicas |
| Manzano | Sarna, Oidio, Fuego bacteriano, Carpocapsa | Sarna y oidio tienen screening experimental; fuego bacteriano comparte una regla generica; Carpocapsa no tiene motor | Reemplazar la fecha fija por biofix; fuego bacteriano solo como vigilancia cuarentenaria; separar Carpocapsa como plaga |
| Peral | Sarna, Fuego bacteriano, Psila | Sarna y fuego bacteriano tienen screening experimental; Psila no tiene motor | Incorporar antecedentes de inoculo y biofix; fuego bacteriano solo como vigilancia; separar Psila como plaga |
| Pecan | Sarna, Bacteriosis | Ambos tienen screening experimental | Ajustar sarna a fuente regional; identificar taxon/agente de "Bacteriosis" antes de asignar formula |

El servicio actual usa un inicio de campania fijo el 1 de mayo y reglas internas genericas. Esto sirve como compuerta experimental, pero no representa de forma suficiente la salida real de dormancia por lote, variedad y zona.

## Decision sobre el historico

El motor sanitario perenne no debe reconstruir la vida completa del monte ni usar la fecha de plantacion como inicio. Para una campania nueva se propone:

- conservar el frio y la salida de dormancia como contexto fenologico de la campania;
- abrir la evaluacion sanitaria desde el primer tejido susceptible observado o proyectado;
- consultar como maximo 30 dias previos al biofix para contexto de humedad, lluvia e inoculo cuando el modelo lo requiera;
- acumular eventos y observaciones hacia adelante hasta cierre de campania;
- trasladar a la campania siguiente solamente antecedentes estructurados: enfermedad confirmada, organo, severidad orientativa, fecha, evidencia y manejo realizado.

La ausencia de registros anteriores no se interpreta como ausencia de enfermedad. En la primera campania de Chaman el estado inicial sera `sin_antecedente`, y el sistema recomendara recorridas cuando coincidan tejido susceptible y ambiente favorable.

## Cobertura real que debe priorizar el piloto

La auditoria de Produccion del 3 de septiembre de 2026 encontro 27 lotes perennes activos con historico meteorologico listo:

| Cultivo | Variedades activas | Lotes |
|---|---|---:|
| Pecan | Elliott (1), Kiowa (6), Oconee (3), Pawnee (6), Sumner (6) | 22 |
| Manzano | Cripps Pink/Pink Lady (1), Red King Oregon (1), Rosy Glow (1) | 3 |
| Peral | Rocha (1), Williams (1) | 2 |

Para sarna del pecan, la referencia varietal externa ubica a Elliott con resistencia alta, Kiowa y Oconee con resistencia intermedia, Sumner de buena a intermedia y Pawnee como susceptible. Esos valores son un punto de partida, no una verdad local: las razas del patogeno y la respuesta cambian por ambiente y monte. Hasta contar con observaciones argentinas, Chaman debe mostrar la fuente, mantener baja confianza y permitir corregir la clasificacion por variedad sin cambiar la formula ambiental.

## Contrato propuesto para el motor perenne v2

### 1. Biofix fenologico

Prioridad:

1. etapa observada y registrada en campo;
2. etapa anclada a una observacion anterior;
3. estimacion por frio cumplido mas acumulacion termica varietal;
4. cronograma regional, con confianza baja.

No se evalua infeccion foliar antes de que exista el organo susceptible. Una observacion posterior de dormancia debe cerrar nuevamente la ventana.

### 2. Inoculo y antecedentes

Mantener un estado por enfermedad y campania:

- `sin_antecedente`;
- `posible_por_residuo_o_yema`;
- `confirmado_campania_anterior`;
- `confirmado_campania_actual`.

Fotos, audio o una visita general no equivalen por si solos a confirmacion. Hace falta un registro estructurado con enfermedad, fecha, observador, organo, severidad orientativa y evidencia vinculada.

### 3. Evento ambiental

La serie horaria canonica conserva la prioridad existente:

`sensor de campo -> central asociada -> Open-Meteo reciente/pronostico -> Chaman-Meteo ERA5 historico`.

Cada enfermedad debe declarar temperatura, humedad, lluvia/mojado, duracion de la ventana y cobertura minima. Un proxy diario puede producir `monitoreo`, pero no un evento fuerte ni una alerta automatica.

### 4. Susceptibilidad varietal y calidad

La susceptibilidad multiplica la prioridad de recorrida, no inventa enfermedad. Si falta el perfil varietal se usa el escenario conservador susceptible y se informa calidad baja. Una salida calculada requiere, como minimo, etapa susceptible y clima suficiente.

### 5. Regla de salida

La logica comun sera:

`aviso = tejido susceptible x inoculo plausible x evento ambiental x susceptibilidad varietal x calidad de datos`

El resultado se muestra como indice interno de seguimiento y estado operativo. No se presenta como probabilidad, incidencia, severidad ni presencia confirmada.

## Matriz inicial por cultivo

| Cultivo/enfermedad | Biofix | Persistencia relevante | Variables de screening | Salida permitida inicialmente |
|---|---|---|---|---|
| Vid - Oidio | Brotacion; ventana principal de racimos entre floracion y envero | Micelio en yemas; estructuras en corteza y hojas | T y HR horarias, lluvias ligeras, ventana movil de 15 dias, variedad | Condiciones favorables y recorrida |
| Vid - Mildiu | Brotacion y partes verdes activas | Oosporas en hojas caidas | Lluvia, mojado foliar, T, HR y continuidad de tejido verde | Condiciones favorables y recorrida |
| Vid - Botritis | Floracion, cierre de racimo y madurez | Restos y tejidos infectados | T, HR, lluvia/mojado, heridas y etapa del racimo | Condiciones favorables y recorrida |
| Manzano - Sarna | Punta verde/primeras hojas | Pseudotecios en hojas y frutos caidos | Mojado foliar continuo, T, lluvia y edad del tejido | Condiciones favorables y recorrida |
| Manzano - Oidio | Emergencia de hojas y brotes jovenes | Micelio en yemas dormidas infectadas | T, HR, edad del tejido; el agua libre no se usa como promotor | Monitoreo por yema/inoculo y recorrida |
| Peral - Sarna | Brotacion/primeras hojas | Hojas del suelo; frutos momificados y eventualmente lesiones leñosas | Mojado foliar continuo, T y lluvia | Condiciones favorables y recorrida |
| Pecan - Sarna | Brotacion y tejidos nuevos | Restos e infecciones previas | 15-25 C, HR alta y mojado; INTA informa un minimo de 2 h a 20 C para iniciar infeccion | Condiciones favorables y recorrida |

### Casos que no deben entrar como enfermedad comun

- **Fuego bacteriano:** `Erwinia amylovora` es plaga cuarentenaria ausente en Argentina. El clima solo puede mostrar una **ventana de vigilancia**, nunca "posible presencia" ni una alerta sanitaria comun. Cualquier sospecha requiere el circuito oficial correspondiente.
- **Carpocapsa y Psila:** son plagas, no enfermedades. Deben conservar un motor y una visualizacion propios, aunque compartan la seccion general de sanidad.
- **Bacteriosis del Pecan:** el nombre actual no identifica un agente causal canonico. No debe recibir un numero nuevo hasta definir patogeno, organos, fuente y condiciones de validez.

## Fuentes oficiales y primarias utilizadas

- INTA/UNCuyo, modelo meteorologico de oidio de la vid en Mendoza: https://repositorio.inta.gob.ar/handle/20.500.12123/1320
- INTA, ficha de oidio de la vid y supervivencia del inoculo: https://repositorio.inta.gob.ar/handle/20.500.12123/13114
- INTA/UNCuyo, peronospora o mildiu de la vid: https://repositorio.inta.gob.ar/handle/20.500.12123/13121
- SINAVIMO/SENASA, oidio del manzano: https://www.sinavimo.gob.ar/plaga/podosphaera-leucotricha
- SINAVIMO/SENASA, sarna del manzano: https://www.sinavimo.gob.ar/plaga/venturia-inaequalis
- INTA Alto Valle, inoculo de sarna del peral en frutos momificados y ramas: https://repositorio.inta.gob.ar/handle/20.500.12123/19754
- INTA Bella Vista, principales enfermedades del pecan: https://repositorio.inta.gob.ar/handle/20.500.12123/13824
- INTA Alto Valle, evaluacion Maryblyt y condicion cuarentenaria de fuego bacteriano: https://repositorio.inta.gob.ar/handle/20.500.12123/23637
- Oklahoma State University, ciclo y modelo horario de sarna del pecan: https://extension.okstate.edu/fact-sheets/pecan-diseases-prevention-and-control
- University of Georgia, resistencia varietal a sarna del pecan y variacion entre montes: https://fieldreport.caes.uga.edu/publications/C898/pecan-varieties-for-georgia-orchards/
- Oregon State University, sarna del peral y relacion temperatura/mojado: https://extension.oregonstate.edu/sites/default/files/documents/em9003.pdf
- Penn State Extension, oidio del manzano desde yemas infectadas y brotes activos: https://extension.psu.edu/apple-disease-powdery-mildew

## Secuencia segura de implementacion

### Fase 1 - Registro prospectivo y biofix

1. Agregar a la visita de campo un registro estructurado de etapa observada: dormancia, yema hinchada, brotacion/tejido verde, floracion, cuaje, fruto en crecimiento, madurez y caida de hojas.
2. Persistir por lote, variedad y campania la fecha del primer tejido susceptible.
3. Permitir corregir el biofix sin perder el valor anterior: toda correccion queda auditada y recalcula la serie.
4. Incorporar una observacion sanitaria estructurada: enfermedad, organo, `no evaluada/sin sintomas/sospecha/confirmada`, incidencia por categorias, severidad orientativa, comentario, foto o audio y observador.

### Fase 2 - Motores de screening en sombra

1. Implementar primero sarna del pecan, sarna del manzano y sarna del peral porque ya existen lotes activos y los tres modelos dependen de tejido nuevo, temperatura y mojado/humedad.
2. Calcular con datos horarios canonicos y registrar cobertura, fuente, huecos y version del modelo.
3. Mostrar los resultados solo en Testing y en un panel interno de auditoria; no enviar alertas ni recomendaciones de productos.
4. Mantener por separado las plagas Carpocapsa y Psila y la vigilancia cuarentenaria de fuego bacteriano.

### Fase 3 - Campania observacional

1. Ante cada evento favorable, generar `recorrida recomendada`, nunca `enfermedad presente`.
2. Vincular la recorrida, sus comentarios, fotos y audios con el evento calculado.
3. Registrar tambien recorridas sin sintomas: son necesarias para medir falsos positivos.
4. Congelar la version del algoritmo durante cada tramo fenologico; los cambios se ensayan en paralelo para no alterar retrospectivamente lo mostrado al cliente.

### Fase 4 - Calibracion por cultivo y variedad

1. Comparar eventos calculados contra observaciones de campo por cultivo, variedad, region y fuente meteorologica.
2. Medir sensibilidad, especificidad, precision, falsos negativos, falsos positivos y anticipacion en horas/dias.
3. Ajustar primero los umbrales ambientales generales y luego los multiplicadores varietales, evitando calibrar una variedad con muy pocas observaciones.
4. Conservar el escenario susceptible cuando no haya perfil varietal, pero mostrarlo como supuesto conservador y pedir recorrida.

### Fase 5 - Salida controlada a clientes

1. Habilitar una tarjeta por cultivo solo cuando su version haya completado una campania observacional y una revision agronomica.
2. Comunicar `condiciones no favorables`, `monitoreo` o `recorrida recomendada`.
3. Reservar `evento confirmado en campo` exclusivamente para una visita humana persistida.
4. Mantener bloqueadas prescripciones y aplicaciones automaticas hasta una validacion especifica independiente.

## Orden recomendado

1. Pecan - sarna: 22 lotes activos y perfiles varietales utiles para estratificar el seguimiento.
2. Manzano y peral - sarna: adaptar tablas temperatura/mojado y usar punta verde o primeras hojas como biofix.
3. Manzano - oidio: separar infeccion primaria desde yemas de los eventos secundarios; no usar lluvia como promotor.
4. Vid - oidio, mildiu y Botrytis: comenzar cuando existan lotes activos y biofix de brotacion/floracion confiables.
5. Bacteriosis del pecan: pausar hasta identificar el agente causal del dato de catalogo.
6. Fuego bacteriano: conservar solo vigilancia cuarentenaria; no mostrar riesgo de presencia.

## Criterios de aceptacion

- Ninguna enfermedad foliar calcula una ventana activa durante dormancia sin tejido susceptible.
- Un patogeno que inverna no se interpreta como eliminado por dormancia.
- Cambiar o registrar una etapa recalcula la serie desde el nuevo biofix.
- Los huecos climaticos se completan por la cadena canonica sin reemplazar sensores validos.
- Toda salida muestra calidad, fuente y si la etapa fue observada o proyectada.
- Ninguna salida automatica dice "presencia confirmada".
- Una confirmacion de campo queda persistida y auditable despues de recargar la aplicacion.
- Una visita permite ver, editar o archivar sus comentarios y evidencia vinculada.
- Una campania nueva puede operar sin datos sanitarios de campanias anteriores.
- El calculo sanitario empieza en el biofix y no en la fecha historica de plantacion.
- El piloto conserva negativos de campo y no solo eventos con sintomas.
