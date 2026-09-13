# Fenologia, inicio termico y motores - revision 13/09/2026

## Alcance y estado

Revision de codigo general, consulta de registros de Produccion en modo lectura y correcciones **locales**. No se hizo push, despliegue, migracion, reproceso de Produccion ni envio real de alertas. Rama: `codex/phenology-report-review-2026-09-13`, base `52dec253`.

El usuario definio que el inicio registrado de brotacion debe habilitar GDD en los perennes. Se implemento para todos los perennes del catalogo actual: Vid, Peral, Pecan y Manzano. No se agregaron cultivos ni parametros termicos nuevos.

## Hallazgos principales

| Conexion | Evidencia y resultado |
| --- | --- |
| Registro -> almacenamiento | `siembra/service.ts` agrega registros con identidad de siembra/lote, campania, tipo de evento, fecha, confianza, cobertura y autor. Las correcciones referencian el registro reemplazado; no lo borran. La evidencia termica se obtiene en servidor. |
| Registro -> trabajos de calculo | Existe cola durable: agrometeorologia -> reconstruccion sanitaria -> agroclima/alertas. El guardado no espera necesariamente a que terminen los trabajos. |
| Registro de brotacion -> GDD | Desconexion confirmada: `resolveThermalStart` exigia un evento `biofix` con objetivo de forzado, ignorando un `inicio_etapa` de brotacion. Corregido localmente. |
| Registro -> heladas | El motor de alertas llamaba al resolvedor fenologico sin pasar la etapa de campo. Corregido: se usa el registro decisorio para cada fecha y se indica su origen; sin registro valido se conserva el calendario como referencia, no como observacion. |
| Registro -> granizo | Se agrego el estadio como contexto para inspeccion. El indice meteorologico, la calidad y los requisitos para emitir alertas no se cambiaron. No se calcula porcentaje de dano por etapa. |
| Registro -> Kc/ETc/estres canonico | El motor agrometeorologico ya usa la etapa de campo. En perennes, el calendario solo no habilita decisiones por etapa. Esto NO significa que el modulo separado de recomendaciones de riego use siempre ese mismo motor. |
| Registro -> sanidad frutal | Consume `serie.stage` y su procedencia de la serie canonica. Los modelos frutales revisados siguen siendo screening experimental: conectarlos no los convierte en modelos agronomicamente validados. |
| Registro -> API de fenologia | La proyeccion publica consume etapa, procedencia y confianza canonicas; conserva la distincion observacion/estimacion. No se modifico el contrato ni las credenciales. |
| Registro -> cuadros web | Frio, calculos, riesgos y demanda hidrica tenian claves de cache sin revision fenologica. Se incorporo esa revision; riesgos tambien separa lote/siembra y rechaza respuestas fuera de orden. No se solicitan reprocesos extra por cambiar la clave. |
| Registro -> informe | El encabezado podia priorizar una prediccion anterior o el calendario. Se agrego prioridad de la observacion decisoria. |

### Pendientes que impiden afirmar que toda la plataforma esta unificada

1. **Riego separado:** `sdc-api-predicciones/src/entidades/riego/service.ts`, `riego-v12.engine.ts` y `riego-v13-fallback.engine.ts` aun resuelven Kc mediante cronograma/dias. El pipeline de registro no contiene una etapa explicita de reproceso de riego. Hay que conectar el consumo canonico sin eliminar sus controles de seguridad de sondas ni cambiar dosis inadvertidamente.
2. **Huella hidrica:** `HHVerdeYAzul` en `sdc-api-cliente/src/entidades/siembra/service.ts` usa un calculo ETc propio por calendario. Requiere una migracion de consumo y comparacion de resultados, no una sustitucion ciega de formulas.
3. **Refresco al terminar la cola:** invalidar una cache permite una nueva lectura, pero esta puede llegar antes de que el worker termine. Falta exponer/consumir el estado de finalizacion y refrescar entonces, con limites y control de errores. No se garantiza actualizacion instantanea tras guardar.
4. **Cierre y reapertura perennes:** revisar el uso de `fechaCosecha` como cierre definitivo frente a cosechas estacionales de una plantacion. Varios consumidores ocultan modulos o invalidan registros despues de esa fecha. El recorte del informe no altera esta semantica.
5. Esta revision no es una validacion cientifica de todos los umbrales ni una comprobacion real de notificaciones de cada cliente. Faltan pruebas integradas en Testing y recuperacion controlada de los acumulados existentes antes de promover.

## Regla termica implementada y resguardos

- Primer inicio persistente valido de `Brotacion`/`Brotacion vegetativa` de la campania vigente. Una etapa posterior o una segunda entrada no reinician el acumulado.
- Una correccion reemplaza la fecha de anclaje a efectos del calculo, conservando ambas entradas del historial.
- Se excluyen observaciones puntuales, baja confianza, cobertura cero, fechas invalidas/futuras, otra siembra/lote/cultivo y otra campania.
- Se conserva la compatibilidad con biofix explicitos de inicio/reinicio de forzado ya configurados. Un biofix sin objetivo termico conserva su significado de anclaje. Es una excepcion explicita, no un inicio automatico desde yema hinchada.
- Sin temperatura util, el dato sigue faltando: no se fabrica un GDD cero.
- La temporada de frio y sus modelos no cambian. Los anuales siguen acumulando desde su inicio ya definido.
- Version del motor local: `agromet-1.5.1`; alertas de helada: `v1.1-fenologia-campo`.

## Kleppe: evidencia de Produccion consultada sin modificarla

Las cuatro generaciones activas consultadas se calcularon el 13/09/2026 alrededor de 13:17 UTC. El motor recibio los registros y dispuso de temperaturas, pero los GDD quedaron sin valor por falta del biofix tipado exigido anteriormente.

| Cuadro | Registro vigente relevante | Efecto esperado al recuperar con el nuevo codigo |
| --- | --- | --- |
| La Costa, cuadro 7 / sensor 1 | Brotacion 01/09/2026 | Inicio 01/09, sujeto a continuidad meteorologica |
| La Costa, cuadro 17 / sensor 2 | Yema hinchada 09/09/2026; sin brotacion | Debe continuar pendiente, no iniciar desde yema |
| La Carolina, cuadro 7 / sensor 3 | Brotacion 09/09 y yema hinchada 10/09 | Ancla termica 09/09; la ultima etapa sigue siendo yema. Hay inconsistencia que el cliente debe aclarar |
| El Mirasol, cuadro 3 / sensor 4 | Brotacion 09/09/2026 | Inicio 09/09, sujeto a continuidad meteorologica |

Ninguno de estos registros ni acumulados se recupero aun en Produccion.

## Trigo, soja y maiz: no retirar el registro de campo

Consulta de catalogo: 144 entradas de Trigo, 270 de Soja y 203 de Maiz; ninguna de las filas consultadas tenia parametros agrometeorologicos o fenologia de referencia explicitos almacenados. Existen referencias centrales de temperatura y cronogramas, pero sin umbrales termicos por etapa calibrados individualmente en esas entradas.

Tener un catalogo amplio no demuestra exactitud fenologica de cada variedad. Conservar el registro como confirmacion/correccion opcional. Separar siempre etapa observada, proyeccion anclada y referencia de calendario.

## Informe agronomico

- Anuales: desde la siembra hasta cosecha, o hasta hoy si el ciclo sigue abierto.
- Perennes: poscosecha registrada del anio en curso; si no existe, desde el inicio del anio y explicitando ese criterio. Nunca desde la implantacion antigua del monte.
- Nuevos graficos diarios: Tmin/Tmax, HR, precipitacion, GDD acumulado, ET0/ETc y porcentaje de agua disponible **estimada por balance**, no humedad volumetrica.
- Serie sanitaria historica consultada aparte del resumen de riesgo actual. Solo lecturas operativas; no se grafican screenings experimentales como porcentajes operativos.
- Consulta satelital acotada al periodo completo, no limitada a las ultimas ocho escenas.
- Graficos nuevos con fechas reales; huecos y valores ausentes no se convierten en ceros. Se excluye pronostico. Los acumuladores conservan su origen biologico, no se reinician al recortar la vista.
- Se corrigio presentacion de fechas de calendario que se desplazaban un dia por zona horaria y el corte de tarjetas de calidad entre paginas.
- Prueba visual: PDF local de ocho paginas con datos sinteticos, sin informacion de clientes. Se revisaron las paginas renderizadas. No se modifico el estilo global de la aplicacion.

## Verificacion y siguiente ruta

- Clima: 25 suites / 279 pruebas.
- Predicciones: 37 suites / 311 pruebas, incluidas pruebas de riego y sanidad existentes.
- API cliente: 89 suites / 551 pruebas en la corrida completa; despues se agrego una prueba del encabezado/fecha y se repitieron las 57 pruebas de informes/frontera fenologica, todas correctas.
- Frontend: 43 pruebas existentes de los cuadros + 3 nuevas de refresco, correctas.
- Modelos, API cliente, clima y predicciones compilan; frontend compila en configuracion Testing. Avisos existentes de dependencias CommonJS, sin error de build.
- Herramientas locales reproducibles en `C:/CHAMAN2026/output/phenology-report-audit-2026-09-13/`. Clima/predicciones usan dependencias existentes con alias explicito a los modelos de esta rama, no a los del worktree raiz.

Antes de publicar: cerrar el refresco ligado a la cola, resolver el alcance de riego/huella, probar cambios de etapa completos en Testing y preparar commits por servicio contra el SHA realmente desplegado. Respaldar y recuperar solo las siembras aprobadas. No promover el monorepo completo ni modificar datos contradictorios por inferencia.
