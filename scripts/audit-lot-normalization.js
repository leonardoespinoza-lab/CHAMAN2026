#!/usr/bin/env node

/**
 * Auditoria combinada y estrictamente de solo lectura para normalizar lotes:
 * vinculacion ERA5, cobertura historica, matriz varietal y salida sanitaria.
 */

const { MongoClient } = require('../sdc-datos/node_modules/mongodb');
const { resolverResistencia } = require('../sdc-modelos/dist');

const DATABASES = {
  production: 'chaman',
  testing: 'chaman_testing',
};
const PERENNIAL_CROPS = new Set(['Pecan', 'Manzano', 'Peral', 'Vid']);

const text = (value) => String(value || '').trim();
const id = (value) => (value == null ? '' : String(value));
const day = (value) => {
  const date = value ? new Date(value) : undefined;
  return date && Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : undefined;
};
const subtractUtcDays = (amount) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - amount);
  return date.toISOString().slice(0, 10);
};
const perennialCampaignStart = () => {
  const now = new Date();
  const year = now.getUTCMonth() >= 4
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
  return `${year}-05-01`;
};
const requiredHistoricalStart = (crop, sowingDate) => {
  if (!sowingDate) return undefined;
  const lowerBound = PERENNIAL_CROPS.has(crop)
    ? perennialCampaignStart()
    : '2020-01-01';
  return sowingDate > lowerBound ? sowingDate : lowerBound;
};
const snap = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? (Math.round(number * 10) / 10).toFixed(1)
    : '?';
};

function emptyCropSummary() {
  return {
    lots: 0,
    bound: 0,
    historicalReady: 0,
    withDiseaseOutputs: 0,
    withResistance: 0,
    withResistanceApplied: 0,
    diseaseResistanceMatches: 0,
  };
}

function emptyCatalogSummary() {
  return {
    records: 0,
    withResistance: 0,
    resistanceEntries: 0,
    inferred: 0,
    susceptibleProfiles: 0,
    unknown: 0,
    missingDiseaseId: 0,
    missingSourceBase: 0,
  };
}

async function main() {
  const environment = text(process.env.RAILWAY_ENVIRONMENT_NAME).toLowerCase();
  const databaseName = DATABASES[environment];
  if (!databaseName) {
    throw new Error('La auditoria requiere Railway production o testing.');
  }
  const uri =
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL;
  if (!uri) throw new Error('Falta la URL de MongoDB.');

  const requiredCoverageTo = subtractUtcDays(6);
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20_000,
    readPreference: 'secondaryPreferred',
  });
  await client.connect();
  try {
    const db = client.db(databaseName);
    if (db.databaseName !== databaseName) {
      throw new Error(`Base inesperada: ${db.databaseName}.`);
    }

    const lots = await db.collection('lotes').find(
      { idSiembra: { $exists: true, $ne: null } },
      {
        projection: {
          _id: 1,
          nombre: 1,
          idSiembra: 1,
          ubicacion: 1,
        },
      },
    ).toArray();
    const sowings = await db.collection('siembras').find(
      { _id: { $in: lots.map((item) => item.idSiembra) } },
      {
        projection: {
          _id: 1,
          idSemilla: 1,
          fechaSiembra: 1,
          fechaCosecha: 1,
          activa: 1,
        },
      },
    ).toArray();
    const seeds = await db.collection('semillas').find(
      {},
      {
        projection: {
          _id: 1,
          cultivo: 1,
          variedad: 1,
          semillero: 1,
          campania: 1,
          fuenteBase: 1,
          resistencia: 1,
        },
      },
    ).toArray();
    const bindings = await db.collection('weather_location_bindings').find({
      locationType: 'lote',
      active: true,
    }).toArray();
    const gridPoints = await db.collection('weather_grid_points').find(
      { enabled: { $ne: false } },
      {
        projection: {
          _id: 0,
          key: 1,
          historicalStart: 1,
          timezone: 1,
          countryCode: 1,
        },
      },
    ).toArray();
    const coverages = await db.collection('weather_grid_coverage_versions')
      .find({})
      .sort({ lastSuccessfulImportAt: -1, updatedAt: -1 })
      .toArray();
    const predictions = await db.collection('prediccions').aggregate([
      { $match: { idSiembra: { $in: sowings.map((item) => item._id) } } },
      { $sort: { fecha: -1, _id: -1 } },
      { $group: { _id: '$idSiembra', document: { $first: '$$ROOT' } } },
    ]).toArray();

    const sowingById = new Map(sowings.map((item) => [id(item._id), item]));
    const seedById = new Map(seeds.map((item) => [id(item._id), item]));
    const bindingByLot = new Map(
      bindings.map((item) => [id(item.locationId), item]),
    );
    const coverageByGrid = new Map();
    const pointByGrid = new Map(
      gridPoints.map((item) => [text(item.key), item]),
    );
    for (const coverage of coverages) {
      if (!coverageByGrid.has(coverage.gridPointKey)) {
        coverageByGrid.set(coverage.gridPointKey, coverage);
      }
    }
    const predictionBySowing = new Map(
      predictions.map((item) => [id(item._id), item.document]),
    );

    const byCrop = {};
    const lotRows = lots.map((lot) => {
      const sowing = sowingById.get(id(lot.idSiembra));
      const seed = sowing && seedById.get(id(sowing.idSemilla));
      const crop = text(seed?.cultivo) || 'SIN_SEMILLA';
      const binding = bindingByLot.get(id(lot._id));
      const coverage = binding && coverageByGrid.get(binding.gridPointKey);
      const gridPoint = binding && pointByGrid.get(binding.gridPointKey);
      const sowingDate = day(sowing?.fechaSiembra);
      const requiredFrom = requiredHistoricalStart(crop, sowingDate);
      const historicalReady = Boolean(
        requiredFrom &&
          coverage?.dailyFrom &&
          coverage?.dailyTo &&
          coverage.dailyFrom <= requiredFrom &&
          coverage.dailyTo >= requiredCoverageTo,
      );
      const diseases = Array.isArray(
        predictionBySowing.get(id(sowing?._id))?.enfermedades,
      )
        ? predictionBySowing.get(id(sowing?._id)).enfermedades
        : [];
      const resistances = Array.isArray(seed?.resistencia)
        ? seed.resistencia
        : [];
      const diseaseResistanceChecks = diseases.map((disease) => {
        const expected = resolverResistencia(
          resistances,
          disease?.idEnfermedad || disease?.enfermedad || '',
        );
        const actual = disease?.resistenciaUsada;
        const expectedResistance = expected.resistencia;
        const required = disease?.estado === 'calculado';
        const multiplierMatches =
          expectedResistance &&
          Number.isFinite(Number(actual?.multiplicador)) &&
          Math.abs(
            Number(actual.multiplicador) - Number(expected.multiplicador),
          ) < 0.0001;
        return {
          diseaseId: disease?.idEnfermedad || null,
          calculationState: disease?.estado || null,
          expectedProfile: expectedResistance?.perfil || null,
          expectedState: expected.estado,
          expectedMultiplier: expected.multiplicador,
          actualProfile: actual?.perfil || null,
          actualState: actual?.estado || null,
          actualMultiplier: Number.isFinite(Number(actual?.multiplicador))
            ? Number(actual.multiplicador)
            : null,
          applied: Boolean(actual && actual.estado !== 'desconocida'),
          matches:
            !required ||
            Boolean(
              expectedResistance &&
                actual?.estado === expected.estado &&
                actual?.perfil === expectedResistance.perfil &&
                multiplierMatches,
            ),
        };
      });
      const center = lot?.ubicacion?.centro || {};
      const row = {
        lotId: id(lot._id),
        lot: text(lot.nombre) || 'Lote sin nombre',
        crop,
        variety: text(seed?.variedad) || null,
        sowingDate: sowingDate || null,
        sowingActive: sowing?.activa !== false,
        harvestDate: day(sowing?.fechaCosecha) || null,
        eligible:
          sowing?.activa !== false &&
          (!sowing?.fechaCosecha || PERENNIAL_CROPS.has(crop)),
        bound: Boolean(binding),
        gridPointKey: binding?.gridPointKey || null,
        pendingGrid: binding
          ? null
          : `${snap(center.lat)}:${snap(center.lng)}`,
        coverageFrom: coverage?.dailyFrom || null,
        coverageTo: coverage?.dailyTo || null,
        gridHistoricalStart: gridPoint?.historicalStart || null,
        historicalReady,
        diseaseOutputs: diseases.length,
        predictionDate:
          day(predictionBySowing.get(id(sowing?._id))?.fecha) || null,
        resistanceEntries: resistances.length,
        resistanceApplied: diseaseResistanceChecks.some((item) => item.applied),
        diseaseResistanceMatches:
          diseaseResistanceChecks.length > 0 &&
          diseaseResistanceChecks.every((item) => item.matches),
        resistanceMismatches: diseaseResistanceChecks.filter(
          (item) => !item.matches,
        ),
      };
      const summary = byCrop[crop] || emptyCropSummary();
      summary.lots += 1;
      if (row.bound) summary.bound += 1;
      if (row.historicalReady) summary.historicalReady += 1;
      if (row.diseaseOutputs) summary.withDiseaseOutputs += 1;
      if (row.resistanceEntries) summary.withResistance += 1;
      if (row.resistanceApplied) summary.withResistanceApplied += 1;
      if (row.diseaseResistanceMatches) summary.diseaseResistanceMatches += 1;
      byCrop[crop] = summary;
      return row;
    });

    const catalogByCrop = {};
    for (const seed of seeds) {
      const crop = text(seed.cultivo) || 'SIN_CULTIVO';
      const summary = catalogByCrop[crop] || emptyCatalogSummary();
      const resistances = Array.isArray(seed.resistencia)
        ? seed.resistencia
        : [];
      summary.records += 1;
      if (resistances.length) summary.withResistance += 1;
      summary.resistanceEntries += resistances.length;
      summary.inferred += resistances.filter(
        (item) => item?.estado === 'inferida',
      ).length;
      summary.susceptibleProfiles += resistances.filter((item) =>
        ['S', 'MS'].includes(text(item?.perfil).toUpperCase()),
      ).length;
      summary.unknown += resistances.filter(
        (item) =>
          item?.estado === 'desconocida' || item?.perfil === 'DESCONOCIDA',
      ).length;
      summary.missingDiseaseId += resistances.filter(
        (item) => !item?.idEnfermedad,
      ).length;
      if (!seed.fuenteBase) summary.missingSourceBase += 1;
      catalogByCrop[crop] = summary;
    }

    const unboundLots = lotRows.filter((item) => !item.bound);
    const pendingGrids = new Set(
      unboundLots.map((item) => item.pendingGrid).filter(Boolean),
    );
    const gridSummary = {};
    for (const row of lotRows.filter((item) => item.bound)) {
      const grid = gridSummary[row.gridPointKey] || {
        lots: 0,
        requiredFrom: null,
        gridHistoricalStart: row.gridHistoricalStart,
        coverageFrom: row.coverageFrom,
        coverageTo: row.coverageTo,
        historicalReady: 0,
      };
      const requiredFrom = requiredHistoricalStart(row.crop, row.sowingDate);
      grid.lots += 1;
      grid.requiredFrom = !grid.requiredFrom || requiredFrom < grid.requiredFrom
        ? requiredFrom
        : grid.requiredFrom;
      if (row.historicalReady) grid.historicalReady += 1;
      gridSummary[row.gridPointKey] = grid;
    }
    const diseaseResistanceSummary = {};
    for (const row of lotRows) {
      for (const check of row.resistanceMismatches) {
        const key = `${row.crop}:${check.diseaseId || 'sin_id'}`;
        const summary = diseaseResistanceSummary[key] || {
          crop: row.crop,
          diseaseId: check.diseaseId,
          mismatches: 0,
          examples: [],
        };
        summary.mismatches += 1;
        if (summary.examples.length < 3) {
          summary.examples.push({
            lot: row.lot,
            variety: row.variety,
            predictionDate: row.predictionDate,
            calculationState: check.calculationState,
            expectedProfile: check.expectedProfile,
            expectedState: check.expectedState,
            expectedMultiplier: check.expectedMultiplier,
            actualProfile: check.actualProfile,
            actualState: check.actualState,
            actualMultiplier: check.actualMultiplier,
          });
        }
        diseaseResistanceSummary[key] = summary;
      }
    }
    const fruitLots = lotRows.filter((item) =>
      ['Manzano', 'Peral', 'Pecan'].includes(item.crop),
    );
    const summaryOnly = process.argv.includes('--summary');
    const eligibleLots = lotRows.filter((row) => row.eligible);
    const pendingCoverageLots = eligibleLots.filter(
      (item) => !item.historicalReady,
    );
    const pendingCoverageGrids = new Set(
      pendingCoverageLots
        .map((item) => item.gridPointKey || item.pendingGrid)
        .filter(Boolean),
    );

    process.stdout.write(JSON.stringify({
      capturedAt: new Date().toISOString(),
      environment,
      database: databaseName,
      readOnly: true,
      definitions: {
        population: 'Lotes con idSiembra asignada.',
        historicalReady:
          `Cobertura ERA5 hasta ${requiredCoverageTo}: cultivos anuales desde la siembra (limitada a 2020-01-01) y perennes desde el inicio de la campania fria vigente (o implantacion posterior).`,
        pendingGrid:
          'Coordenada del centroide redondeada a la grilla ERA5 de 0,1 grados; no sustituye la validacion de pais y zona horaria.',
      },
      summary: {
        lotsWithSowing: lotRows.length,
        eligibleLots: eligibleLots.length,
        eligibleBindings: eligibleLots.filter((item) => item.bound).length,
        eligibleUnboundLots: eligibleLots.filter((item) => !item.bound).length,
        activeBindings: lotRows.filter((item) => item.bound).length,
        unboundLots: unboundLots.length,
        estimatedPendingGrids: pendingGrids.size,
        historicalCoverageReady: lotRows.filter((item) => item.historicalReady).length,
        eligibleHistoricalCoverageReady: eligibleLots.filter(
          (item) => item.historicalReady,
        ).length,
        eligiblePendingCoverage: pendingCoverageLots.length,
        eligiblePendingCoverageGrids: pendingCoverageGrids.size,
        withDiseaseOutputs: lotRows.filter((item) => item.diseaseOutputs > 0).length,
        withResistance: lotRows.filter((item) => item.resistanceEntries > 0).length,
        withResistanceApplied: lotRows.filter((item) => item.resistanceApplied).length,
        diseaseResistanceMatches: lotRows.filter(
          (item) => item.diseaseResistanceMatches,
        ).length,
      },
      byCrop,
      diseaseResistanceSummary,
      gridSummary,
      catalogByCrop,
      fruitLots,
      unboundLots,
      ...(!summaryOnly ? { lots: lotRows } : {}),
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
