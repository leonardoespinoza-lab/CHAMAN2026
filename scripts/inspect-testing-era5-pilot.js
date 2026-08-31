#!/usr/bin/env node

/** Selecciona candidatos ERA5 en Testing usando exclusivamente lecturas. */

const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

function finite(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function day(value) {
  const parsed = value ? new Date(value) : undefined;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : '';
}

function distanceKm(left, right) {
  const radians = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(right.lng) - radians(left.lng);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function main() {
  if (String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() !== 'testing') {
    throw new Error('Inspección rechazada: requiere el entorno Railway testing.');
  }
  const uri = process.env.MONGO_PUBLIC_URL || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) throw new Error('Falta la URL de MongoDB Testing.');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20_000,
    readPreference: 'secondaryPreferred',
  });
  await client.connect();
  try {
    const db = client.db('chaman_testing');
    const [points, lots] = await Promise.all([
      db.collection('weather_grid_points').find(
        { enabled: true },
        { projection: { key: 1, latitude: 1, longitude: 1, timezone: 1, historicalStart: 1 } },
      ).toArray(),
      db.collection('lotes').find(
        { idSiembra: { $exists: true, $ne: null } },
        { projection: { _id: 1, idSiembra: 1, idEstablecimiento: 1, idsDispositivo: 1, ubicacion: 1 } },
      ).toArray(),
    ]);
    const sowings = await db.collection('siembras').find(
      { _id: { $in: lots.map((item) => item.idSiembra) } },
      { projection: { _id: 1, idLote: 1, idEstablecimiento: 1, idSemilla: 1, fechaSiembra: 1, activa: 1, fechaCosecha: 1, coordenadas: 1 } },
    ).toArray();
    const sowingById = new Map(sowings.map((item) => [String(item._id), item]));
    const seeds = await db.collection('semillas').find(
      { _id: { $in: sowings.map((item) => item.idSemilla).filter(Boolean) } },
      { projection: { _id: 1, cultivo: 1, variedad: 1 } },
    ).toArray();
    const seedById = new Map(seeds.map((item) => [String(item._id), item]));
    const rows = [];
    for (const lot of lots) {
      const sowing = sowingById.get(String(lot.idSiembra));
      const center = lot.ubicacion?.centro || sowing?.coordenadas;
      if (!sowing || !center || !finite(center.lat) || !finite(center.lng)) continue;
      const activeSowings = await db.collection('siembras').countDocuments({
        idLote: lot._id,
        activa: { $ne: false },
        $or: [{ fechaCosecha: { $exists: false } }, { fechaCosecha: null }],
      });
      if (activeSowings !== 1) continue;
      const establishmentId = sowing.idEstablecimiento || lot.idEstablecimiento;
      const [devices, establishment, establishmentLots] = await Promise.all([
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
        establishmentId
          ? db.collection('lotes').countDocuments({ idEstablecimiento: establishmentId })
          : 0,
      ]);
      if (devices || establishment?.estacionMeteorologica) continue;
      const generation = await db
        .collection('indicadores_agrometeorologicos_generaciones')
        .findOne(
          { idSiembra: sowing._id, versionCalculo: 'agromet-1.5.0' },
          { projection: { generacionActiva: 1 } },
        );
      const latestIndicator =
        generation?.generacionActiva && generation.generacionActiva !== 'legacy'
          ? await db
              .collection('indicadores_agrometeorologicos_generados')
              .find({
                idSiembra: sowing._id,
                versionCalculo: 'agromet-1.5.0',
                generacionCalculo: generation.generacionActiva,
                esPronostico: { $ne: true },
              })
              .project({
                fecha: 1,
                fuenteEtapaFenologica: 1,
                confianzaEtapaFenologica: 1,
                metricas: 1,
              })
              .sort({ fecha: -1 })
              .limit(1)
              .next()
          : null;
      const nearest = points
        .map((point) => ({
          key: point.key,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          timezone: point.timezone,
          historicalStart: point.historicalStart,
          distanceKm: distanceKm(
            { lat: center.lat, lng: center.lng },
            { lat: point.latitude, lng: point.longitude },
          ),
        }))
        .sort((left, right) => left.distanceKm - right.distanceKm)[0];
      rows.push({
        lotId: String(lot._id),
        sowingId: String(sowing._id),
        sowingDate: day(sowing.fechaSiembra),
        crop: seedById.get(String(sowing.idSemilla))?.cultivo,
        variety: seedById.get(String(sowing.idSemilla))?.variedad,
        establishmentLots,
        currentStageSource: latestIndicator?.fuenteEtapaFenologica,
        currentStageConfidence: latestIndicator?.confianzaEtapaFenologica,
        currentGddComplete:
          latestIndicator?.metricas?.gddAccumulationComplete === true,
        coordinates: { lat: Number(center.lat), lng: Number(center.lng) },
        nearest: nearest
          ? { ...nearest, distanceKm: Number(nearest.distanceKm.toFixed(3)) }
          : null,
      });
    }
    rows.sort((left, right) =>
      (left.nearest?.distanceKm ?? Infinity) - (right.nearest?.distanceKm ?? Infinity),
    );
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      readOnly: true,
      enabledGridPoints: points.length,
      eligibleLots: rows.length,
      within15Km: rows.filter((item) => (item.nearest?.distanceKm ?? Infinity) <= 15).length,
      candidates: rows.slice(0, 20),
      cerealCandidates: rows
        .filter((item) => ['Trigo', 'Cebada'].includes(item.crop))
        .sort((left, right) =>
          Number(left.establishmentLots !== 1) - Number(right.establishmentLots !== 1) ||
          left.sowingDate.localeCompare(right.sowingDate),
        )
        .slice(0, 20),
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
