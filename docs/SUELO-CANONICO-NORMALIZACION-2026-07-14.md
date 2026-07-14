# Normalizacion del suelo operativo de Chaman

Fecha: 2026-07-14

## Objetivo

Todos los motores agronomicos deben consumir una unica seleccion edafica trazable por lote, sin borrar los datos historicos ni presentar una estimacion cartografica como una medicion de campo.

El contrato `IEntradasAgronomicasSuelo` es la frontera canonica. Los campos legacy de `ILote` se conservan por compatibilidad, pero no deciden por si solos el suelo utilizado por los algoritmos cuando existe una evaluacion automatica vigente.

## Grano y vigencia

- Grano: lote + geometria/version de resolucion + propiedad + intervalo de profundidad.
- Estados aplicables: `ready`, `partial` y `no_coverage`, siempre que `stale=false`.
- Estados no aplicables: `pending`, `processing`, `source_unavailable`, `failed`, geometria invalida o lectura vencida.
- Una modificacion de geometria o de evidencia fisica invalida la resolucion anterior.

## Precedencia por propiedad

1. Laboratorio confirmado, solo con informe, metodo analitico y profundidad documentados.
2. Sensor calibrado y confirmado.
3. Evaluacion automatica vigente (INTA/SoilGrids y propiedades derivadas).
4. Dato manual como fallback.
5. Dato legacy sin procedencia como ultimo fallback.

La seleccion se realiza por propiedad y profundidad. Los datos no seleccionados permanecen como alternativas y los desacuerdos relevantes se informan como conflictos; no se eliminan.

## Semantica cientifica

- La textura, CC, PMP y agua disponible obtenidas de cartografia/modelos son estimaciones, no observaciones del lote.
- La humedad real del suelo solo puede atribuirse a una sonda valida. Sin sensor se informa balance o estimacion, nunca lectura real.
- `0` es un valor valido cuando fue medido/calculado. La ausencia se representa como `undefined`/sin dato, no como cero.
- CC/PMP automaticos se ponderan por espesor en 0-100 cm; las capas conservan su profundidad y procedencia.

## Consumidores normalizados

| Consumidor | Uso del contrato canonico | Fallback seguro |
| --- | --- | --- |
| Clima/agrometeorologia | balance hidrico y perfil edafico | perfil legacy del lote |
| Riego/predicciones | CC, PMP, textura y capas por profundidad | perfil previo; no persiste estimaciones |
| Cosecha/huella hidrica | calculo unico en `sdc-datos` | perfil legacy |
| Informe agronomico | textura y perfil trazables | perfil legacy rotulado |
| API externa de riego | CC/PMP vigentes por campo | valor legacy; desconocido queda ausente |
| Frontend | cartografia primaria y evidencia confirmada separadas | estado pendiente/sin dato |

### Contrato de la API externa

En `GET /v1/irrigation-prediction/:idSiembra`, `capacidadDeCampo` y `puntoDeMarchitez` son campos opcionales. Si no existe una caracterizacion vigente ni un valor legacy, las propiedades se omiten del JSON; la API no fabrica `0`. Los consumidores deben distinguir campo ausente de un cero explicitamente almacenado.

## Invariantes de persistencia

- El helper canonico trabaja sobre una copia y nunca muta el lote recibido.
- Las capas automaticas se usan en memoria y no se escriben en `ILote.suelos` como manuales.
- Numero de sensor, profundidad y `hayRaices` se preservan al proyectar propiedades canonicas.
- Una edicion neutral o un cambio dinamico de raices/sensores no confirma suelo.
- La cosecha delega una sola ejecucion a `sdc-datos`; no duplica huella ni efectos laterales.

## Validacion requerida antes de produccion

1. Pruebas de seleccion, stale/pending, laboratorio incompleto, sensor confirmado y no mutacion.
2. Pruebas de cada consumidor y de fallback por servicio no disponible.
3. Build de modelos, datos, clima, predicciones, API cliente, API externa y frontend.
4. Backfill en Testing y conteo de estados sin fallos.
5. Verificacion visual y de consola en Testing.
6. Promocion del mismo arbol de codigo y repeticion de smoke tests en Produccion.

## Compatibilidad y rollback

La implementacion es aditiva. Los campos legacy no se migran destructivamente y siguen disponibles como fallback. El punto de rollback previo a esta normalizacion es `7aec356`; un rollback de aplicacion no requiere revertir datos de lote porque el motor no reemplaza los valores historicos.
