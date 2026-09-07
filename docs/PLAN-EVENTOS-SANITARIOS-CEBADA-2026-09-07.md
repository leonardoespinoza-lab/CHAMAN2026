# Plan de eventos sanitarios de cebada

Fecha: 2026-09-07. Estado: propuesta técnica y agronómica; no implementada ni activada.
Alcance inicial: Escaldadura y Mancha en Red. No modifica Producción, estilos, datos históricos ni alertas.

## 1. Decisión y límites

- Corregir errores técnicos del motor actual por una vía separada de la incorporación de modelos nuevos.
- No suavizar curvas para ocultar picos, convertir faltantes en cero ni forzar una curva siempre creciente.
- Un día favorable puede elevar el indicador ambiental; no equivale a un incremento instantáneo de enfermedad observada.
- No llamar al índice 0–100 «porcentaje de enfermedad» ni «probabilidad» sin definir y validar el evento predicho y su horizonte.
- Mantener la versión nueva experimental y apagada por defecto. Primera evaluación solo en Testing, sin alertas automáticas, notificaciones push ni prescripción.
- La revisión científica justifica investigar eventos y memoria; no acredita los coeficientes, ventanas o umbrales actuales de Chamán.

## 2. Contrato común: salidas que no deben confundirse

| Salida | Qué representa | Comportamiento permitido |
| --- | --- | --- |
| Indicador ambiental diario | Condiciones meteorológicas favorables durante el día | Puede subir o bajar; nunca se rotula como avance acumulado |
| Evento húmedo potencialmente infectivo | Un episodio continuo y su evidencia térmica/hídrica | Puede cruzar días; su identidad y contribución no se duplican |
| Seguimiento de eventos recientes | Memoria de episodios y ventana orientativa de observación | No se borra porque el día siguiente sea seco; cierre explícito |
| Observación de campo | Incidencia/severidad registrada, con muestra y fecha | Serie independiente; no se deduce del clima ni se rellena automáticamente |

Campos mínimos propuestos, internos y auditables:

- `diseaseId`, `modelId`, `modelVersion`, `parameterSetId`, `outputKind`, `unit` y definición del horizonte.
- `lotId`, `sowingId`, campaña, variedad y versión/fuente del perfil sanitario.
- `eventId`, inicio/fin UTC, zona horaria del lote, estado y motivo de cierre.
- Fuentes por variable, resolución, cobertura, intervalos faltantes, calidad y si el mojado es medido o estimado.
- Versión del estimador de mojado, huella de entradas, fecha de cálculo y referencia al resultado reemplazado.
- Estado fenológico observado/proyectado, evidencia de inóculo conocida/desconocida y observaciones asociadas.
- Resultado ausente con motivo cuando no se puede calcular; un cero requiere evidencia suficiente de condiciones no favorables.

Contrato de seguridad: entradas iguales y versión igual producen salida igual; repetir el proceso no agrega eventos.
El cálculo solo usa clima disponible hasta su instante de corte; un retrospectivo debe identificarse como tal.
Fórmulas, coeficientes y detalle de ingeniería permanecen internos; la UI recibe solo información agronómica autorizada.

## 3. Escaldadura: propuesta prioritaria

1. Ingerir horas ordenadas, deduplicadas y con unidades homogéneas de la serie climática canónica; no abrir otra fuente silenciosa.
2. Representar cada intervalo como mojado medido, mojado estimado, seco observado o desconocido.
3. Iniciar un episodio al detectar condiciones compatibles; continuar su estado al cruzar medianoche o un reinicio del trabajador.
4. Evaluar temperatura y duración durante el mojado, no sustituirlas por temperatura media de todo el día.
5. Separar interrupción seca observada de ausencia de datos. Ante un hueco, conservar incertidumbre y suspender clasificación definitiva.
6. Cerrar o reiniciar el episodio por una regla biológica versionada; las horas de tolerancia seca son una decisión pendiente, no un valor inventado.
7. Registrar el episodio como ambientalmente compatible, no como infección confirmada: el clima no demuestra presencia de inóculo.
8. Mantener el episodio en seguimiento después del secado. El desarrollo posterior y la latencia requieren temperatura y tejido susceptible.
9. Definir separadamente incubación (síntomas) y latencia (esporulación); no usar sus nombres o plazos como sinónimos.
10. Cerrar el seguimiento por una regla aprobada, fin de tejido susceptible/campaña o evidencia de campo; conservar el historial y el motivo.

La caída del indicador del día no cancela automáticamente una infección potencial anterior.
La memoria propuesta no significa sumar todos los días desde la siembra ni acumular hasta 100 indefinidamente.
No transformar episodios consecutivos del mismo proceso en ensayos probabilísticos independientes.

## 4. Mancha en Red: contrato específico

- Mantener explícita la separación entre indicador ambiental reciente, evento húmedo y observación de campo.
- Revisar si la agregación existente se alimenta de episodios cortados por fecha; probar continuidad horaria antes de cambiar su agregación.
- Temperatura durante mojado y duración son relevantes, pero las respuestas publicadas dependen del aislamiento, cultivar y edad foliar.
- No trasladar automáticamente los parámetros de Escaldadura a Mancha en Red, ni los de forma tipo spot a forma tipo red.
- La ventana reciente y su ponderación son hipótesis operativas por validar; una referencia de latencia no valida por sí sola una ventana fija.
- Aplicar el perfil varietal una sola vez y conservar su procedencia; «sin datos» no equivale a resistente ni susceptible confirmado.
- Roya de la hoja y Fusariosis conservan sus contratos separados; extender este plan exige evidencia específica adicional.

## 5. Qué está respaldado y qué sigue pendiente

Evidencia consultada el 2026-09-07:

- [Ryan y Clare, 1975: infección de Escaldadura](https://www.sciencedirect.com/science/article/pii/0048405975901083). Experimento original: la temperatura y la duración del mojado inmediatamente posterior a inoculación condicionan las lesiones. El resumen informa lesiones con 2 h y mayor desarrollo con al menos 14 h; no son umbrales universales de campo.
- [Davis y Fitt, 1994: latencia de Escaldadura](https://onlinelibrary.wiley.com/doi/10.1111/j.1439-0434.1994.tb04816.x). Experimento original: latencia aproximada de 24 días a 5 °C a 13 días a 20 °C bajo mojado continuo. Algunas interrupciones secas posteriores a infección no anularon lesiones. Respalda separar evento y seguimiento; no valida un reloj local de Chamán.
- [Shaw, 1986: temperatura y mojado en Mancha en Red](https://bsppjournals.onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-3059.1986.tb02018.x). Experimento original: germinación con agua líquida, infección y latencia dependientes de temperatura/mojado; el estado de la hoja afecta el resultado. No demuestra una probabilidad por lote sin observar inóculo.
- [van den Berg y Rossnagel, 1990: infección de Mancha en Red](https://www.tandfonline.com/doi/pdf/10.1080/07060669009500997). Experimento original: el mínimo mojado necesario cambió con temperatura y aislamiento. Impide asumir un único umbral transferible entre variantes y ambientes.
- [FAUBA: Escaldadura de cebada](https://herbariofitopatologia.agro.uba.ar/?page_id=67). Referencia institucional argentina, sin fecha editorial indicada: destaca clima fresco-húmedo, lluvia/salpicadura, rastrojo e importancia de variedad y etapa; no es una calibración cuantitativa del motor.
- [INTA Marcos Juárez: evaluación de cultivares, campaña 2024](https://www.argentina.gob.ar/sites/default/files/2025/03/inta_crcordoba_eeamarcosjuarez_donaire_g_evaluacion_cebc.pdf). Evidencia argentina de perfiles varietales. Distingue la distribución regional de Escaldadura; su tabla sanitaria no valida multiplicadores numéricos ni el índice climático de Chamán.

Los estudios controlados extranjeros justifican componentes candidatos, no su transferencia sin validación argentina.
No hay en este documento validación de campo de una probabilidad de infección de Chamán.

Decisiones pendientes con responsable agronómico antes de habilitar un modelo:

- Definición del evento objetivo, tejido/etapa susceptible y horizonte de seguimiento por enfermedad.
- Estimador de mojado y su validación local; HR alta, lluvia y humedad de suelo no son mediciones equivalentes de mojado foliar.
- Duración mínima, respuesta térmica, tolerancia a interrupción seca y manejo de huecos.
- Memoria, latencia/incubación, envejecimiento de tejido y reglas de cierre; no asumir duración fija para todo el ciclo.
- Tratamiento de inóculo desconocido, variedad sin perfil y efectos de manejos registrados.
- Agregación, escala y criterios de interpretación; no introducir coeficientes numéricos solo para mejorar la apariencia de la curva.

## 6. Testing: criterios técnicos de aceptación

- Un episodio con las mismas horas produce igual resultado si cruza medianoche, si llega por lotes o si el trabajador se reinicia.
- Horas repetidas/desordenadas no duplican duración ni intensidad; eventos ya guardados no se vuelven a sumar.
- Mojado, seco, desconocido y cero real tienen pruebas independientes; faltantes no fuerzan un pico ni su desaparición.
- Un episodio truncado por falta de historia se marca incompleto, no como recién iniciado con certeza.
- Cambios de proveedor/unidades, zona horaria, redondeo y perfil varietal no provocan saltos no trazables.
- Secado posterior conserva seguimiento del evento previo; cierre y expiración se prueban sin borrar registros.
- Una prueba sintética de calor/humedad produce una respuesta explicable, no necesariamente monótona ni una probabilidad.
- Reprocesar un rango tras corregir clima, fecha o perfil conserva original, genera nueva versión y es idempotente.
- No unir en una misma línea resultados con distinta semántica/unidad/versiones incompatibles sin identificarlos.
- UI, informes y API conservan el contrato y el diseño aprobado; no publican fórmulas ni emiten alertas automáticas.

## 7. Validación agronómica y salida del modo experimental

1. Guardar prospectivamente por lote: cultivo/variedad, estado fenológico, fuente climática, rastrojo/antecesor, manejo y visitas.
2. En visitas registrar presencia/ausencia observada, incidencia y/o severidad con protocolo de muestreo, estrato foliar, fecha, fotos y evaluador.
3. Registrar también visitas sin síntomas; «sin visita» nunca cuenta como ausencia de enfermedad. Revisar diagnósticos confundibles.
4. Comparar lluvia/mojado estimado con medición independiente cuando exista; estratificar por fuente, zona, cobertura y variedad.
5. Fijar antes del ensayo la ventana evento→observación; seguir eventos y periodos sin señal para medir aciertos, omisiones y falsas señales.
6. Separar ajuste de evaluación por lote y campaña; no repartir horas vecinas del mismo episodio entre entrenamiento y prueba.
7. Evaluar oportunidad de la señal, sensibilidad, valor predictivo positivo y falsas señales por lote-tiempo; revisar intervalos de incertidumbre y fallos por estrato.
8. Si se propone una probabilidad, añadir calibración contra un evento y horizonte definidos; un buen ajuste o correlación no bastan.
9. El responsable agronómico fija previamente tamaño de muestra, regiones/campañas y tolerancias aceptables; quedan pendientes, no se declaran aprobados aquí.
10. Emitir un acta con límites, versión, resultados y decisión. Si la evidencia no alcanza, conservar seguimiento experimental sin probabilidad pública.

## 8. Entregables y compuertas de publicación

| Etapa | Entregable | Condición para avanzar |
| --- | --- | --- |
| A. Reparación técnica | Pruebas de regresión del motor vigente | Sin cambios biológicos encubiertos; revisión del diff |
| B. Contrato | Ficha por enfermedad y decisiones pendientes resueltas | Aprobación agronómica; salida/unidad/horizonte inequívocos |
| C. Prototipo | Motor horario experimental aislado y eventos trazables | Pruebas técnicas completas; apagado por defecto |
| D. Ensayo | Comparación prospectiva clima/campo y reporte de errores | Criterios predefinidos satisfechos; revisión independiente |
| E. Promoción | Versión candidata, alcance y reversión documentados | Autorización expresa por GitHub → Testing → Producción |

La bandera experimental propuesta debe nacer deshabilitada; este documento no crea ni activa ninguna variable.
No reemplazar retrospectivamente predicciones de clientes ni lanzar un recálculo masivo sin un plan autorizado.
Habilitar visualización experimental no autoriza alertas automáticas: requieren una revisión y autorización separadas.
Responsabilidades: Backend (contrato/eventos), Agronomía (parámetros/validación), QA (regresiones), Producto (mensajes) y responsable de publicación (promoción).
