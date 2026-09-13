# Separacion de riego/huella y compatibilidad por cultivo

## Decision y alcance actual

El usuario pidio conservar el equilibrio propio de cada cultivo y no convertir el registro manual de fenologia en requisito general de riego/huella. La sustitucion de Kc/ETc del commit `1cf874da` se aparto del cambio operativo. Sigue recuperable, con sus pruebas, en la rama local `codex/hydric-canonical-proposal-2026-09-13`. No se reescribio historia ni se descarto codigo del usuario.

Se restablecieron contra `e4113ede` (base local anterior a la unificacion):

- Motores de riego V12 y V13, tablas/interpolacion Kc, fuente de ET0, controles de seguridad y selector de siembras.
- Motor de huella `huella-hidrica-chaman-2026-02`, adaptador de clima, fallback existente y calculo de cierre/seguimiento.
- Elegibilidad previa de la tarjeta de riego. Se retiro el requisito nuevo de brotacion como habilitador general de riego; esto no equivale a resolver las limitaciones previas de temporada.

Se conservan:

- Brotacion -> grados-dia en los cuatro perennes del catalogo, contexto de campo para heladas/granizo y resguardos de registros.
- Informes historicos por campania anual y periodo anual/poscosecha perenne.
- Registro -> cola -> consulta acotada de finalizacion -> refresco de pantalla. Riego recalcula con su algoritmo anterior, no con la demanda sustituida. El nuevo POST interno sigue autenticado y no envia integraciones HTTPS.
- Metadata de calculo no persistible; no cambian permisos, mapas, licencias ni API Corteva.

No se ejecuto push, despliegue, migracion, reproceso ni envio externo. Esta comparacion es contra una base Git local: antes de cualquier despliegue se debe cotejar cada SHA realmente desplegado. **No promover `1cf874da` aisladamente.** Usar el cambio acumulado que incluye esta separacion.

## Comparacion reproducible, solo con datos sinteticos

Ejecutar desde este worktree, con modelos compilados:

```powershell
node sdc-api-cliente/node_modules/typescript/bin/tsc -p sdc-modelos/tsconfig.json
node scripts/audit-hydric-compatibility.cjs
```

El script carga funciones reales de Git (`e4113ede`, propuesta `1cf874da`) y del directorio de trabajo; no copia formulas. No accede a servicios, bases, credenciales ni clientes. Fija el reloj al 13/09/2026 y usa ET0 de 4 mm/dia, perfiles artificiales y 2 mm de riego registrado.

Grano: cultivo x con/sin cronograma x 15/60/120 dias desde siembra. Son 60 escenarios en Trigo, Soja, Maiz, Cebada, Arveja, Papa, Vid, Manzano, Peral y Pecan. Por escenario se comparan V12, V13, huella final y seguimiento, primero sin registro y luego agregando uno: **480 igualdades exactas aprobadas**. Ademas se verifica identidad de seis archivos de algoritmo/seguridad/seleccion contra la base anterior.

Los cronogramas de prueba son fixtures de contrato, no calendarios varietales recomendados. El contraste con la propuesta aisla el reemplazo de Kc y fija el progreso usado como entrada; no reproduce la disponibilidad meteorologica real ni valida el estadio. No deducir dosis de esta tabla.

| Cultivo | Casos restaurados distintos de base | Propuesta sin demanda, de 6 casos sin registro | Propuesta con demanda distinta, de 6 |
| --- | ---: | ---: | ---: |
| Trigo | 0 | 3 | 3 |
| Soja | 0 | 3 | 3 |
| Maiz | 0 | 3 | 3 |
| Cebada | 0 | 3 | 3 |
| Arveja | 0 | 3 | 3 |
| Papa | 0 | 3 | 3 |
| Vid | 0 | 6 | 0 |
| Manzano | 0 | 6 | 0 |
| Peral | 0 | 6 | 0 |
| Pecan | 0 | 6 | 0 |

Ejemplos V13 a 60 dias con el cronograma sintetico y ET0 fija: Trigo 1,72 -> 1,20 mm/dia; Soja 3,88 -> 1,60; Maiz 4,56 -> 1,80. Son diferencias entre implementaciones, no evidencia de que alguno de esos valores sea agronomicamente correcto. La propuesta descartada podia exigir datos que antes no se requerian y modificar consumos aun conservando la formula general de dosis.

## Banco de algoritmos en la web

- Riego: `sdc-app-chaman/.../modulo-admin/algoritmos/algoritmos.component.ts` envia a `POST /algoritmos/riego/simular`. `sdc-datos/.../algoritmos/service.ts::simularRiego` usa Kc y humedad manuales con un balance simplificado. No invoca V12/V13 ni reproduce la validacion 12/12 y frescura de Sentek. Se aclaro esto en los textos del banco y del catalogo, sin cambiar su calculo, formato o permisos.
- Huella: `AlgoritmosService.simularHuellaHidrica` llama al mismo `calcularHuellaHidrica` usado por el cierre; seguimiento usa su funcion correspondiente. Se agregaron pruebas de esa delegacion. Las entradas del simulador siguen siendo artificiales y el circuito real agrega obtencion/seleccion de clima y datos del lote.

## Limitaciones heredadas que NO se corrigieron silenciosamente

1. El helper de riego tiene curvas especificas para Trigo/Soja/Maiz, pero una ruta generica para otros cultivos. La huella tambien usa una curva generica fuera de esos tres. No presentarlas como calibraciones por especie.
2. En esta bateria el umbral de riego avisa tabla por defecto para Cebada, Papa, Manzano, Peral y Pecan. Conservar esa tabla evita cambiar resultados, pero requiere revision agronomica posterior.
3. Los consumidores no interpretan todos igual los campos del cronograma: hay usos como duracion acumulable y otros como hito desde siembra/emergencia. Tambien V12 y V13 difieren en el anclaje de dias. Hay que definir y comprobar ese contrato antes de homologar Kc.
4. El filtro previo de riego de seis meses y el uso de `fechaCosecha` siguen limitando plantaciones antiguas y poscosecha. El GDD desde brotacion esta separado de esta restriccion: recuperar GDD no prueba que el riego perenne este completamente resuelto.
5. La huella perenne sigue pendiente de una temporada y rendimiento de referencia explicitos. El recorte del informe grafico no cambia el balance ni cierra/reabre cosechas.
6. La conexion termica no implica que existan coeficientes `kcPorEtapa` calibrados para cada cultivo. Sin ellos no corresponde afirmar que toda etapa manual cambie automaticamente el consumo.

Siguiente paso: validar en Testing el bloque de brotacion/alertas/refresco preservando los algoritmos hidricos; despues definir y comparar una ficha por cultivo/temporada antes de proponer cambios de Kc, cronograma, dosis o huella. Kleppe y sus registros contradictorios siguen sin modificaciones en Produccion.

## Pruebas de regresion agregadas

- `sdc-api-predicciones/.../riego-crop-compatibility.spec.ts`: tres casos de anuales sin etapa manual ni ETc externa, con valores de contrato congelados de la base anterior.
- `sdc-datos/.../huella-crop-compatibility.spec.ts`: diez cultivos sin registro obligatorio; campos Kc/ETc ajenos no sustituyen el calculo propio; limite de agua azul registrada; paridad entre banco y motor de huella.
- `scripts/audit-hydric-compatibility.cjs`: 480 comparaciones y seis archivos de algoritmo/seguridad/seleccion identicos.

Las pruebas validan compatibilidad de software. No constituyen validacion cientifica de parametros ni una prueba real en campo.

Verificacion local del bloque separado: clima 25 suites/279 pruebas; predicciones 38/316; API cliente 90/557; datos 75/598; web 48 pruebas seleccionadas. Total 1.798 pruebas, ademas de las 480 comparaciones del script. Modelos, API cliente, predicciones, datos y web Testing compilan; la web mantiene avisos CommonJS existentes. Clima no se modifico respecto del bloque previamente compilado y se repitio su suite completa. `git diff --check` correcto.
