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

## Secuencia segura de implementacion

1. Persistir el biofix observado y la confirmacion de campo.
2. Crear el motor perenne v2 sin alertas ni prescripciones.
3. Implementar primero Vid y corregir Pecan con las reglas trazables anteriores.
4. Migrar Manzano y Peral desde la fecha fija al biofix observado/proyectado.
5. Ejecutar en sombra sobre Testing y comparar contra recorridas reales.
6. Habilitar tarjetas en Produccion solo como `condiciones favorables / recorrida recomendada`.
7. Mantener alertas automaticas bloqueadas hasta medir sensibilidad, especificidad y falsos positivos con datos de campo.

## Criterios de aceptacion

- Ninguna enfermedad foliar calcula una ventana activa durante dormancia sin tejido susceptible.
- Un patogeno que inverna no se interpreta como eliminado por dormancia.
- Cambiar o registrar una etapa recalcula la serie desde el nuevo biofix.
- Los huecos climaticos se completan por la cadena canonica sin reemplazar sensores validos.
- Toda salida muestra calidad, fuente y si la etapa fue observada o proyectada.
- Ninguna salida automatica dice "presencia confirmada".
- Una confirmacion de campo queda persistida y auditable despues de recargar la aplicacion.
