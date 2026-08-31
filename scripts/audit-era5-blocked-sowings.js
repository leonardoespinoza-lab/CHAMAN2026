#!/usr/bin/env node

/**
 * Auditoría de solo lectura de las siembras que históricamente quedaron
 * bloqueadas por temperatura diaria incompleta. No llama motores ni contiene
 * operaciones de escritura.
 */

const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const DB_NAME = 'chaman';
const AGROMET_VERSION = 'agromet-1.5.0';
const DEFAULT_TO_EXCLUSIVE = '2026-08-27';
const SOWING_IDS = [
  '6a7de0361447da860d8106cc',
  '6a7efa53975346ea77478896',
  '6a7f0139975346ea774793b5',
  '6a806519963c5f88fa62d815',
  '6a8c74e83b0e91ed17836378',
  '6a8c751f3b0e91ed178366f6',
  '6a8c754b3b0e91ed17836a08',
  '6a8c756f3b0e91ed17836fa9',
  '6a8067ef963c5f88fa62f548',
  '6a85f52af9b27f4600038e91',
  '6a8897303b0e91ed177f8e8e',
  '6a8897633b0e91ed177f92b6',
  '6a8897853b0e91ed177f95b2',
  '6a889aff3b0e91ed177fa07f',
  '6a889ada3b0e91ed177f9e14',
  '6a8c3e8b3b0e91ed17830b43',
  '6a8c62773b0e91ed178348f2',
  '6a8ee6ed3b0e91ed17862a7a',
  '6a8c65333b0e91ed17834f54',
  '6a8f3daab68369637d5f0482',
  '6a8f00243b0e91ed17865141',
];

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function day(value) {
  const parsed = value ? new Date(value) : undefined;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : '';
}

function finite(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function observationForLot(observation, lotId) {
  const context = observation?.contextosLote?.[lotId];
  if (context) return context;
  if (observation?.idLote && String(observation.idLote) !== lotId) return undefined;
  return observation;
}

async function main() {
  const environment = String(process.env.RAILWAY_ENVIRONMENT_NAME || '').trim().toLowerCase();
  if (environment !== 'production') {
    throw new Error('Auditoría rechazada: requiere RAILWAY_ENVIRONMENT_NAME=production.');
  }
  const uri = process.env.MONGO_PUBLIC_URL || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) throw new Error('Falta la URL de MongoDB.');
  const toExclusive = argument('to-exclusive', DEFAULT_TO_EXCLUSIVE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toExclusive)) {
    throw new Error('--to-exclusive debe usar YYYY-MM-DD.');
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20_000,
    readPreference: 'secondaryPreferred',
  });
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    if (db.databaseName !== DB_NAME) throw new Error('Base productiva inesperada.');
    const sowingObjectIds = SOWING_IDS.map((value) => new ObjectId(value));
    const sowings = await db.collection('siembras').find(
      { _id: { $in: sowingObjectIds } },
      { projection: { _id: 1, idLote: 1, idEstablecimiento: 1, fechaSiembra: 1 } },
    ).toArray();
    const lots = await db.collection('lotes').find(
      {
        $or: [
          { idSiembra: { $in: sowingObjectIds } },
          { _id: { $in: sowings.map((item) => item.idLote).filter(Boolean) } },
        ],
      },
      {
        projection: {
          _id: 1,
          idSiembra: 1,
          idEstablecimiento: 1,
          idsDispositivo: 1,
          ubicacion: 1,
        },
      },
    ).toArray();
    const sowingById = new Map(sowings.map((item) => [String(item._id), item]));
    const lotById = new Map(lots.map((item) => [String(item._id), item]));
    const lotBySowingId = new Map(
      lots.filter((item) => item.idSiembra).map((item) => [String(item.idSiembra), item]),
    );
    const rows = [];

    for (const sowingId of SOWING_IDS) {
      const sowing = sowingById.get(sowingId);
      const lot = sowing && (lotById.get(String(sowing.idLote)) || lotBySowingId.get(sowingId));
      if (!sowing || !lot) {
        rows.push({ sowingId, exists: false });
        continue;
      }
      const lotId = String(lot._id);
      const establishmentId = sowing.idEstablecimiento || lot.idEstablecimiento;
      const from = day(sowing.fechaSiembra);
      const [activeSowings, devices, establishment, observations, manifest, predictionCount] =
        await Promise.all([
          db.collection('siembras').countDocuments({
            idLote: lot._id,
            activa: { $ne: false },
            $or: [{ fechaCosecha: { $exists: false } }, { fechaCosecha: null }],
          }),
          db.collection('dispositivos').countDocuments({
            $or: [
              { idLote: lot._id },
              { _id: { $in: Array.isArray(lot.idsDispositivo) ? lot.idsDispositivo : [] } },
            ],
          }),
          establishmentId
            ? db.collection('establecimientos').findOne(
                { _id: establishmentId },
                { projection: { estacionMeteorologica: 1 } },
              )
            : null,
          establishmentId && from
            ? db.collection('observaciones_meteorologicas').find(
                {
                  idEstablecimiento: establishmentId,
                  granularidad: 'daily',
                  fechaLocal: { $gte: from, $lt: toExclusive },
                },
                {
                  projection: {
                    fechaLocal: 1,
                    valores: 1,
                    fuentePorVariable: 1,
                    contextosLote: 1,
                    idLote: 1,
                  },
                },
              ).sort({ fechaLocal: 1, _id: 1 }).toArray()
            : [],
          db.collection('indicadores_agrometeorologicos_generaciones').findOne(
            { idSiembra: sowing._id, versionCalculo: AGROMET_VERSION },
            { projection: { generacionActiva: 1 } },
          ),
          db.collection('prediccions').countDocuments({ idSiembra: sowing._id }),
        ]);

      let completeTemperatureDays = 0;
      let incompleteTemperatureDays = 0;
      let duplicateDates = 0;
      let chamanMeteoDays = 0;
      let firstComplete = '';
      const seenDates = new Set();
      for (const rawObservation of observations) {
        const observation = observationForLot(rawObservation, lotId);
        if (!observation) continue;
        const date = String(observation.fechaLocal || rawObservation.fechaLocal || '');
        if (seenDates.has(date)) {
          duplicateDates += 1;
          continue;
        }
        seenDates.add(date);
        const values = observation.valores || {};
        const complete = ['temperatureMinC', 'temperatureMeanC', 'temperatureMaxC']
          .every((key) => finite(values[key]));
        if (complete) {
          completeTemperatureDays += 1;
          if (!firstComplete) firstComplete = date;
        } else {
          incompleteTemperatureDays += 1;
        }
        if (Object.values(observation.fuentePorVariable || {}).includes('chaman_meteo')) {
          chamanMeteoDays += 1;
        }
      }

      let agromet = { rows: 0, lastDate: '', gddComplete: false, lastGdd: null };
      if (manifest?.generacionActiva && manifest.generacionActiva !== 'legacy') {
        const generated = await db.collection('indicadores_agrometeorologicos_generados').find(
          {
            idSiembra: sowing._id,
            versionCalculo: AGROMET_VERSION,
            generacionCalculo: manifest.generacionActiva,
            esPronostico: { $ne: true },
          },
          { projection: { fecha: 1, metricas: 1 } },
        ).sort({ fecha: 1 }).toArray();
        const last = generated.at(-1);
        agromet = {
          rows: generated.length,
          lastDate: day(last?.fecha),
          gddComplete: last?.metricas?.gddAccumulationComplete === true,
          lastGdd: finite(last?.metricas?.gddAccumulated)
            ? Number(last.metricas.gddAccumulated)
            : null,
        };
      }
      const center = lot.ubicacion?.centro;
      rows.push({
        sowingId,
        lotId,
        exists: true,
        from,
        activeSowings,
        devices,
        hasFieldClimate: Boolean(establishment?.estacionMeteorologica),
        coordinatesValid: Boolean(center && finite(center.lat) && finite(center.lng)),
        dailyRows: seenDates.size,
        completeTemperatureDays,
        incompleteTemperatureDays,
        duplicateDates,
        firstComplete,
        chamanMeteoDays,
        agromet,
        predictions: predictionCount,
      });
    }

    const existing = rows.filter((item) => item.exists);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database: DB_NAME,
      readOnly: true,
      window: { toExclusive },
      summary: {
        requested: SOWING_IDS.length,
        existing: existing.length,
        missing: rows.length - existing.length,
        incompleteTemperatureDays: existing.reduce(
          (sum, item) => sum + item.incompleteTemperatureDays,
          0,
        ),
        withActiveGeneration: existing.filter((item) => item.agromet.rows > 0).length,
        withCompleteGdd: existing.filter((item) => item.agromet.gddComplete).length,
        withPredictions: existing.filter((item) => item.predictions > 0).length,
        withDevices: existing.filter((item) => item.devices > 0).length,
        withFieldClimate: existing.filter((item) => item.hasFieldClimate).length,
        withValidCoordinates: existing.filter((item) => item.coordinatesValid).length,
        chamanMeteoDays: existing.reduce((sum, item) => sum + item.chamanMeteoDays, 0),
      },
      rows,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
