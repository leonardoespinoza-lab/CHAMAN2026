# Auditoría del motor de frío, fenología y seguimiento satelital

Fecha de cierre técnico: 16 de julio de 2026.

## Decisión operativa

Chaman utiliza la siguiente jerarquía por variable meteorológica:

1. sensor de campo asociado y meteorológicamente calificado;
2. central meteorológica asociada, con cobertura temporal comprobada;
3. Open-Meteo como respaldo automático.

Una lectura de campo sin documentación de instalación o calibración se conserva
como referencia comparativa, pero no desplaza el dato canónico ni habilita una
decisión fenológica o varietal.

La jerarquía de fuentes no reemplaza la validación biológica. Aunque la
temperatura provenga de un sensor calificado, Chaman sólo compara el frío o la
vernalización contra un objetivo cuando la ficha varietal identifica modelo,
unidad, valor, fuente, estado y versión.

## Reglas científicas implementadas

### Perennes

- Manzano, peral, vid y pecán se clasifican como dormancia perenne seguida por
  una fase de forzado.
- Se calculan independientemente:
  - horas de frío entre 0 y 7,2 °C;
  - unidades Utah;
  - porciones de frío mediante Dynamic Model horario.
- No se convierten HF, HFE y CP mediante factores mecánicos.
- HFE se conserva solamente como dato legacy auditable y nunca como modelo
  rector.
- Las horas faltantes no se interpolan. La cobertura, la brecha máxima y la
  continuidad acompañan siempre al resultado.
- Una brecha reinicia el precursor del Dynamic Model, de modo que las CP
  informadas constituyen una cota inferior conservadora cuando la serie no es
  continua.
- El frío acumulado no confirma brotación ni floración.
- Los GDD de forzado quedan bloqueados hasta registrar a campo un biofix de
  inicio de forzado, brotación u otro evento equivalente previsto por el
  protocolo.
- Una observación o inicio de etapa registrado a campo prevalece sobre la
  proyección y reancla el seguimiento posterior sin borrar el historial.

### Trigo y cebada

- La vernalización se mantiene separada de las horas de frío de frutales.
- Chaman no infiere hábito primaveral, facultativo o invernal a partir de la
  clasificación comercial corto/intermedio/largo.
- El GDD bruto puede mostrarse, pero una variedad invernal o facultativa no
  atraviesa automáticamente la fase sensible si el requisito, la cobertura o
  la continuidad de vernalización no están validados.
- El fotoperíodo varietal puede limitar una transición sólo cuando existe un
  modelo por etapa validado y trazable.
- Una observación de campo conserva prioridad sobre cualquier bloqueo
  automático.

### Arveja y restantes anuales

- Arveja se trata por defecto como térmico-fotoperiódica.
- La vernalización se habilita únicamente para un genotipo documentado; no se
  aplica un umbral universal de 0 °C, 4 °C ni unidades copiadas de trigo.
- Soja, maíz y papa requieren parámetros varietales térmicos y fotoperiódicos
  propios. La ausencia de esos datos no se sustituye con valores genéricos.
- Un día sin serie térmica completa bloquea la continuidad del GDD acumulado y
  evita declarar automáticamente una etapa.

## Trazabilidad fenológica

Cada etapa calculada persiste:

- fuente de la etapa;
- nivel de confianza;
- versión del modelo;
- fecha agronómica;
- registro de campo que la reancló, cuando corresponde.

Las fuentes admitidas distinguen observación de campo, proyección anclada a una
observación de campo, GDD validado, cronograma de referencia, rango térmico de
referencia y seguimiento. `campo` queda reservado al evento observado;
`proyeccion_anclada_campo` identifica las etapas posteriores calculadas desde
ese biofix. Esta separación evita presentar una referencia de laboratorio o una
proyección como estado observado.

## Matriz varietal prioritaria

| Variedad o grupo | Estado actual | Uso permitido | Bloqueo vigente |
| --- | --- | --- | --- |
| Rosy Glow, manzano | Requiere calibración | HF, Utah y CP descriptivos; registro de brotación/floración | No comparar automáticamente contra los valores internos iniciales |
| Red King Oregon, manzano | Identidad comercial/clonal por confirmar | Acumulaciones climáticas y biofix observado | No heredar umbrales de Red Delicious sin confirmar el clon |
| Rocha, peral | Fuente varietal insuficiente | Acumulaciones descriptivas y observaciones de yema/brotación | No usar el objetivo interno para decisiones |
| Williams/Bartlett, peral | Mejor candidata a calibración, aún no validada para Alto Valle | Contraste sensor–fenología y ficha bibliográfica provisional | No convertir una referencia regional en umbral local sin validar método y respuesta |
| Cebadas cargadas | Hábito y vernalización incompletos | Clima, GDD bruto, cronograma y observaciones | No atravesar automáticamente la fase sensible |
| Trigos cargados | Sin ficha completa de hábito/Vrn/Ppd | Clima, GDD bruto y observaciones | No inferir vernalización desde el ciclo comercial |
| Arvejas cargadas | Sin respuesta varietal a vernalización documentada | GDD, fotoperíodo y observación | No aplicar vernalización genérica |

La prioridad experimental es Williams/Bartlett: documentar el método de la
referencia publicada y contrastar durante varias campañas la temperatura
canónica, el frío acumulado y los biofix de campo de Kleppe. Rosy Glow, Rocha y
Red King Oregon permanecen en investigación hasta identificar fuentes
varietales inequívocas.

## Calidad instrumental y zona horaria

- La calificación de un sensor exige rol de temperatura de aire, altura,
  abrigo, exactitud, vigencia y fuente de calibración.
- La vigencia se evalúa en la fecha de cada lectura; una calibración actual no
  valida retroactivamente toda la historia.
- Los días civiles se agrupan por zona IANA.
- El cálculo admite correctamente jornadas de 23, 24 o 25 horas por cambios de
  horario estacional.
- Una central sólo puede respaldar un agregado diario si todas las horas
  esperadas del día local contienen las variables necesarias o si el proveedor
  entrega una cobertura completa explícita y trazable.
- Para Argentina, la zona IANA y el fallback histórico UTC-3 producen los
  mismos acumulados.

Riesgo internacional pendiente: la normalización horaria de Open-Meteo aún usa
el `utc_offset_seconds` entregado para la respuesta completa. Antes de operar en
regiones con cambios DST se deberá solicitar timestamps Unix o resolver
explícitamente con IANA la hora repetida.

## Diagnóstico Kleppe

### Sensores LoRa

- La ingesta productiva está activa.
- Tres dispositivos inspeccionados tenían lecturas recientes al momento de la
  auditoría.
- Un dispositivo permanecía sin reportar desde el 11 de julio y requiere
  revisión de energía, gateway, cobertura o enlace.
- Los dispositivos continúan sin calificación meteorológica completa. Sus
  acumulados se muestran como referencia y no desplazan automáticamente a la
  central u Open-Meteo.
- El entorno testing no consume actualmente los brokers LoRa en vivo; por eso
  su copia histórica está atrasada y no debe interpretarse como caída general
  de los sensores productivos.

### Historial satelital

El lote inspeccionado conserva cinco escenas Sentinel-2:

- 26 de mayo;
- 31 de mayo;
- 15 de junio;
- 20 de junio;
- 5 de julio.

No corresponde informar que existe una sola captura. La interfaz construye la
serie con todas las escenas fechadas y conserva compatibilidad con reportes
históricos que sólo almacenaban NDVI.

Las pasadas posteriores disponibles para el área presentaron una nubosidad de
tesela aproximada de 100 %, 99 % y 88 % los días 7, 10 y 15 de julio. Es
correcto no fabricar un índice nuevo a partir de esas teselas. Como mejora
futura, una tesela muy nubosa podrá evaluarse sólo si la máscara SCL dentro del
polígono demuestra cobertura local útil; el porcentaje global nunca será
suficiente para guardar una escena.

## Fiabilidad de la cola NDVI

La cola ahora utiliza:

- área `processing` con lease y heartbeat;
- ACK únicamente después de completar raster, almacenamiento y persistencia en
  backend;
- reintentos transitorios con backoff;
- DLQ para fallos permanentes o intentos agotados;
- recuperación automática de tareas abandonadas;
- deduplicación e idempotencia;
- redacción de tokens y secretos en logs y DLQ.

Una pérdida del lease cancela el procesamiento antes del POST o del ACK para
evitar dos ejecuciones concurrentes.

## Fuentes principales

- [WMO, Instruments and Methods of Observation Programme](https://public.wmo.int/activities/instruments-and-methods-of-observation-programme-imop/instruments-and-methods-of-observation-programme)
- [Revisión de dormancia en manzano](https://www.frontiersin.org/journals/horticulture/articles/10.3389/fhort.2023.1217689/full)
- [Dynamic Model, implementación de referencia en chillR](https://search.r-project.org/CRAN/refmans/chillR/html/Dynamic_Model.html)
- [Modelo térmico, vernalización y fotoperíodo en trigo](https://pubmed.ncbi.nlm.nih.gov/30161188/)
- [Revisión de adaptación fenológica de trigo](https://pubmed.ncbi.nlm.nih.gov/32457509/)
- [Vernalización y fotoperíodo en cebada](https://pubmed.ncbi.nlm.nih.gov/17245568/)
- [Documentación Sentinel-2 L2A y máscara SCL](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html)
- [Catálogo STAC de Planetary Computer](https://planetarycomputer.microsoft.com/docs/quickstarts/reading-stac/)

## Criterios para promover a producción

1. builds completos de todos los servicios;
2. pruebas focales de clima, datos, LoRa, predicciones, frontend y NDVI;
3. migración de metadatos ejecutada primero en modo `plan`;
4. backup y checksum antes de aplicar la migración en testing;
5. reproceso controlado de las siembras Kleppe;
6. validación de fuente, cobertura, brechas y última lectura en la interfaz;
7. simulación en Redis real de éxito, HTTP 503, reinicio, recuperación y DLQ;
8. aprobación funcional en testing antes de tocar producción.
