'use strict';
const { ChamanClient } = require('./chaman-client.cjs');
/** Call from your server event/job when a new resource is created in your app.
 * Preserve input IDs/body when retrying; completed steps are not rolled back. */
async function registerScenario(client, input) {
  const { producer, establishment, lot, sowing } = input;
  const result = {};
  if (producer) {
    result.producer = await client.registerProducer(producer.id, producer.nombre);
    result.establishment = await client.registerProducerEstablishment(establishment.id, establishment.nombre, producer.id);
  } else {
    result.establishment = await client.registerOwnEstablishment(establishment.id, establishment.nombre);
  }
  result.lot = await client.registerLot(lot.id, { nombre: lot.nombre, establecimientoIdExterno: establishment.id,
    ubicacion: lot.ubicacion, superficieHa: lot.superficieHa });
  result.sowing = await client.registerSowing(sowing.id, { loteIdExterno: lot.id, idSemilla: sowing.idSemilla, fechaSiembra: sowing.fechaSiembra });
  result.phenology = await client.phenology(sowing.id);
  return result;
}
function fictitiousScenarios({ idSemilla, fechaSiembra, prefix = 'demo-api-20260912' }) {
  if (!/^[a-f0-9]{24}$/.test(idSemilla || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fechaSiembra || ''))
    throw new Error('Elegir una semilla del catálogo y una fecha de prueba explícita.');
  return ['propio', 'productor'].map(mode => ({
    ...(mode === 'productor' ? { producer: { id: prefix + '-productor', nombre: 'DEMO API - Productor ficticio' } } : {}),
    establishment: { id: `${prefix}-campo-${mode}`, nombre: `DEMO API - Campo ${mode}` },
    lot: { id: `${prefix}-lote-${mode}`, nombre: `DEMO API - Lote ${mode}`, superficieHa: 1,
      ubicacion: mode === 'propio' ? { lat: -32.2, lng: -63.4 } : { lat: -32.21, lng: -63.41 } },
    sowing: { id: `${prefix}-siembra-${mode}`, idSemilla, fechaSiembra },
  }));
}
if (require.main === module) {
  (async () => {
    const scenarios = fictitiousScenarios({ idSemilla: process.env.CHAMAN_DEMO_SEED_ID, fechaSiembra: process.env.CHAMAN_DEMO_SOWING_DATE });
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ dryRun: true, note: 'No requests sent. Fictitious points; no polygon.', scenarios }, null, 2));
      return;
    }
    const environment = process.env.CHAMAN_ENVIRONMENT;
    if (environment === 'production' && process.env.CHAMAN_ALLOW_PRODUCTION_DEMO !== 'APP CORTEVA FICTICIOS')
      throw new Error('Producción requiere confirmación explícita de escrituras ficticias.');
    const client = new ChamanClient({ environment, apiKey: process.env.CHAMAN_API_KEY });
    const services = await client.services();
    if (environment === 'production' && services.data.integracion !== 'appcorteva')
      throw new Error('La demo productiva está restringida a la integración appcorteva.');
    for (const scenario of scenarios) console.log(JSON.stringify(await registerScenario(client, scenario), null, 2));
  })().catch(error => {
    console.error(JSON.stringify({ completed: false, status: error.status || null, requestId: error.requestId || null,
      note: 'Revisar configuración/estado. Reintentar los mismos IDs y cuerpos; no registrar la clave.' }));
    process.exitCode = 1;
  });
}
module.exports = { registerScenario, fictitiousScenarios };
