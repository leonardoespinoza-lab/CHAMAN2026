# Código de servidor para integrar Corteva con Chamán

Ejemplo ejecutable en **Node.js 22 o posterior**, sin dependencias externas. Es código del conector, no código de los algoritmos de Chamán. No requiere acceso a MongoDB ni la contraseña de appcorteva.

**Estado:** candidato local. Las URLs están definidas pero su presencia no demuestra activación productiva. Ver el acta del piloto antes de entregar una credencial al cliente.

## Archivos y configuración

- `chaman-client.cjs`: cliente HTTP y sincronizador de resultados.
- `demo.cjs`: dos altas encadenadas y consulta; por defecto sólo muestra el plan, sin enviar solicitudes.
- `client.test.cjs`: pruebas locales simuladas, ejecutar `node --test client.test.cjs`.

Configurar en el gestor de secretos/entorno de **su servidor**:

| Variable | Valor |
| --- | --- |
| `CHAMAN_ENVIRONMENT` | `testing` o `production`, explícito |
| `CHAMAN_API_KEY` | Clave del entorno entregada por canal seguro; no pegarla en Git, navegador, app móvil ni logs |
| `CHAMAN_DEMO_SEED_ID` | `idSemilla` obtenido de `client.catalog({cultivo:'Trigo'})`; no inventarlo |
| `CHAMAN_DEMO_SOWING_DATE` | Fecha de prueba YYYY-MM-DD; mantenerla al reintentar |

La clave pertenece a una integración. La cuenta appcorteva permite verificar esa misma cartera desde Chamán. Productor no significa usuario/login: el endpoint no crea contraseñas ni invita personas.

## 1. Enviar lo que crean en su plataforma

```js
const { ChamanClient } = require('./chaman-client.cjs');
const { registerScenario } = require('./demo.cjs');
const client = new ChamanClient({
  environment: process.env.CHAMAN_ENVIRONMENT,
  apiKey: process.env.CHAMAN_API_KEY,
});

// Ejemplo: evento de su servidor cuando el usuario confirma una siembra.
// Los datos del evento deben estar autorizados y usar IDs persistentes de SU sistema.
async function onSowingCreated(event) {
  return registerScenario(client, {
    producer: event.producer, // Omitir si el campo es propio del asesor.
    establishment: event.establishment, // {id, nombre}
    lot: event.lot, // {id, nombre, ubicacion:{lat,lng}, superficieHa}
    sowing: event.sowing, // {id, idSemilla, fechaSiembra}
  });
}
```

Para un cliente asesorado: `producer = {id, nombre}`. Para cartera propia: **omitir producer**, sin crear uno ficticio que represente al asesor. Cada alta usa un establecimiento y cada siembra un lote. El punto y la superficie no dibujan un polígono; esa ampliación aún no está disponible.

`PUT` registra o confirma el mismo alta: mismo ID y contenido no duplica. Contenido diferente devuelve 409 y no actualiza. Tras un timeout puede existir un registro guardado: repetir el mismo evento, no cambiar de ID. Los pasos completados no se borran si falla uno posterior. Mantener una cola/outbox durable y evitar duplicar trabajadores sobre el mismo lote.

## 2. Mantener actualizada la fenología en su app

```js
const { syncPhenology } = require('./chaman-client.cjs');
async function refreshSowing(sowingId, store) {
  const update = await syncPhenology({ client, store,
    namespace: process.env.CHAMAN_ENVIRONMENT + ':appcorteva', sowingId });
  if (update.changed) {
    // update.result contiene etapa, fechaDato, origen, estado y revision.
    // store.set ya guardó el resultado. Su frontend lee SU servidor/base local.
    // Aquí pueden notificar a su frontend por su mecanismo habitual.
  }
  return update;
}
```

Implementar `store.get(key)` y `store.set(key,value)` con su base de datos y escrituras atómicas. No usar sólo memoria en producción. Ejecutar el job cada 30–60 minutos, escalonado y sin concurrencia por siembra. Repartir consultas entre instancias respetando el cupo global informado por `/servicios`; más workers no aumentan el cupo.

`ETag`/`If-None-Match` evita retransmitir resultados sin cambios (304). Aun así es una solicitud y consume cupo. Si falla una consulta no borrar el último resultado: mostrar fecha/estado de sincronización. `pendiente` no es cero y una `referencia_calendario` no es una observación confirmada a campo. No prometer una frecuencia de cambio distinta a la del motor.

## 3. Ejecutar la demo sin afectar carteras reales

Con semilla/fecha explícitas: `node demo.cjs` imprime dos recorridos, sin conectar.

`node demo.cjs --execute` **crea datos**. En producción requiere además `CHAMAN_ALLOW_PRODUCTION_DEMO="APP CORTEVA FICTICIOS"`, comprueba la integración `appcorteva` y usa IDs/nombres `DEMO API` fijos. No ejecutarlo con una cuenta de otro cliente. No cambiar fecha, semilla o IDs entre reintentos. Son ubicaciones ficticias, no campos relevados ni polígonos del cliente.

Al finalizar, abrir Chamán con appcorteva y verificar productor (sólo segundo recorrido), ambos establecimientos, lotes, siembras y resultados. Archivar ejemplos únicamente con autorización; el script no borra nada.

## Errores, seguridad y entrega

- 400/401/403/404: corregir datos/acceso/cupo, no reintentar ciegamente.
- 409: revisar conflicto; no reintenta automáticamente ni sobrescribe.
- 429: respeta Retry-After (mínimo 60 segundos). Si la espera supera 5 minutos devuelve un error con `retryAfterMs`; su job deberá esperar ese plazo.
- 502/503/504 o conexión incierta: reintento acotado, misma URL/ID/cuerpo. Si se agota, persistir el evento pendiente.
- No sigue redirecciones y sólo usa las URLs oficiales incluidas. Los errores del conector no contienen credenciales/cuerpos crudos. Los logs y dependencias de SU servidor también deben redaccionarlos.

Las fórmulas permanecen en Chamán. Este ejemplo implementa estructura, catálogo y fenología; los otros servicios del catálogo comercial no quedan habilitados por aparecer en el panel. La vigencia, servicios y límites se administran desde Chamán. No hay envío de código o claves al cliente automático: este paquete se entrega al responsable técnico por el canal acordado.
