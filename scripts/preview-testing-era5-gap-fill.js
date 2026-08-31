#!/usr/bin/env node

/**
 * Prueba de integración de solo lectura. Reproduce en memoria el patrón de
 * temperatura faltante de Producción, lo completa con ERA5 y ejecuta el motor
 * agrometeorológico real sin persistir observaciones, indicadores o alertas.
 */

const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const LOT_ID = '6a614893d1b29a87403e9f7d';
const SOWING_ID = '6a6148bbd1b29a87403ea03e';
const GRID_POINT_KEY = 'ar-santa-fe-trigo-pilot';
const FROM = '2026-05-01';
const TO = '2026-07-08';
const CALCULATION_VERSION = 'chaman-meteo-agro-v2';
const SOURCE_VERSION = 'era5-land-timeseries-19var-v2';

// El preview habilita el kill switch solamente dentro de este proceso local y
// después de fijar un único lote. Railway y las APIs continúan apagados.
process.env.CHAMAN_METEO_ENABLED = 'true';
process.env.CHAMAN_METEO_AGROMET_BRIDGE_ENABLED = 'true';
process.env.CHAMAN_METEO_AGROMET_LOT_ALLOWLIST = LOT_ID;
process.env.CHAMAN_METEO_CALCULATION_VERSION = CALCULATION_VERSION;
process.env.CHAMAN_METEO_SOURCE_VERSION = SOURCE_VERSION;

const {
  AgrometeorologicalEngineService,
} = require('../sdc-api-clima/dist/entidades/agrometeorologia/agrometeorological-engine.service');
const {
  ChamanMeteoAgrometBridgeService,
  mergeDailyHistoricalGapFill,
} = require('../sdc-api-clima/dist/entidades/agrometeorologia/chaman-meteo-agromet-bridge.service');
const {
  construirDiasSanitariosCanonicos,
} = require('../sdc-api-predicciones/dist/entidades/prediccion/cultivos/agrometeorologia-canonica');

const asId = (value) => (value == null ? undefined : String(value));
const plain = (value) => JSON.parse(JSON.stringify(value));
const finite = (value) => value !== null && value !== '' && Number.isFinite(Number(value));
const expectedDays =
  Math.round(
    (new Date(`${TO}T00:00:00Z`) - new Date(`${FROM}T00:00:00Z`)) /
      86_400_000,
  ) + 1;

function observationForLot(raw, lotId) {
  const envelope = plain(raw);
  const context = envelope.contextosLote?.[lotId];
  if (context) {
    return {
      ...envelope,
      ...context,
      idEstablecimiento: asId(context.idEstablecimiento || envelope.idEstablecimiento),
      idLote: lotId,
      timestamp: context.timestamp || envelope.timestamp,
      fechaLocal: context.fechaLocal || envelope.fechaLocal,
      granularidad: context.granularidad || envelope.granularidad,
      contextosLote: undefined,
    };
  }
  if (envelope.idLote && asId(envelope.idLote) !== lotId) return undefined;
  return {
    ...envelope,
    idEstablecimiento: asId(envelope.idEstablecimiento),
    idLote: lotId,
    contextosLote: undefined,
  };
}

function removeDailyTemperature(observation) {
  const copy = plain(observation);
  for (const key of ['temperatureC', 'temperatureMinC', 'temperatureMeanC', 'temperatureMaxC']) {
    delete copy.valores?.[key];
    delete copy.fuentePorVariable?.[key];
    delete copy.estadoPorVariable?.[key];
  }
  return copy;
}

function responseFrom(indicators, observations) {
  const weatherByDate = new Map(observations
    .filter((item) => item.granularidad === 'daily')
    .map((item) => [item.fechaLocal, item]));
  return {
    summary: {},
    dataSource: { type: 'mixed', completenessPercentage: 100 },
    calculationVersion: 'agromet-1.5.0',
    parametersVersion: indicators.at(-1)?.versionParametros || '',
    warnings: [],
    series: indicators.map((item) => {
      const weather = weatherByDate.get(item.fecha);
      return {
        date: item.fecha,
        isForecast: Boolean(item.esPronostico),
        stage: item.etapaFenologica,
        stageSource: item.fuenteEtapaFenologica,
        stageConfidence: item.confianzaEtapaFenologica,
        phenologyModelVersion: item.versionModeloFenologico,
        weather: weather?.valores || {},
        metrics: item.metricas || {},
        source: item.fuente,
        sourceByVariable: item.fuentePorVariable || {},
        qualityFlags: item.banderasCalidad || [],
        warnings: item.advertencias || [],
      };
    }),
  };
}

function summarizeScenario(indicators, observations, crop) {
  const last = indicators.at(-1);
  const sanitary = construirDiasSanitariosCanonicos(
    responseFrom(indicators, observations),
    crop,
  );
  return {
    indicatorDays: indicators.length,
    gddAccumulationComplete: last?.metricas?.gddAccumulationComplete === true,
    finalGdd: finite(last?.metricas?.gddAccumulated)
      ? Number(last.metricas.gddAccumulated)
      : null,
    incompleteGddDays: indicators.filter((item) =>
      item.banderasCalidad?.includes('incomplete_gdd_accumulation'),
    ).length,
    chamanTemperatureDays: observations.filter((item) =>
      ['temperatureMinC', 'temperatureMeanC', 'temperatureMaxC'].every(
        (key) => item.fuentePorVariable?.[key] === 'chaman_meteo',
      ),
    ).length,
    sanitaryClimateReadyDays: sanitary.filter((item) => item.climaHabilitante).length,
    sanitaryStageReadyDays: sanitary.filter((item) => item.etapaHabilitante).length,
    sanitaryFullyReadyDays: sanitary.filter(
      (item) => item.climaHabilitante && item.etapaHabilitante,
    ).length,
    sample: {
      first: indicators[0]
        ? {
            date: indicators[0].fecha,
            metrics: {
              temperatureMinC: indicators[0].metricas?.temperatureMinC,
              temperatureMaxC: indicators[0].metricas?.temperatureMaxC,
              gddDaily: indicators[0].metricas?.gddDaily,
              gddBaseTemperatureC: indicators[0].metricas?.gddBaseTemperatureC,
              gddAccumulationComplete:
                indicators[0].metricas?.gddAccumulationComplete,
            },
            flags: indicators[0].banderasCalidad,
            warnings: (indicators[0].advertencias || []).filter((item) =>
              /GDD|temperatura base|acumulado/i.test(item),
            ),
          }
        : null,
      last: last
        ? {
            date: last.fecha,
            metrics: {
              temperatureMinC: last.metricas?.temperatureMinC,
              temperatureMaxC: last.metricas?.temperatureMaxC,
              gddDaily: last.metricas?.gddDaily,
              gddBaseTemperatureC: last.metricas?.gddBaseTemperatureC,
              gddAccumulationComplete: last.metricas?.gddAccumulationComplete,
            },
            stage: last.etapaFenologica,
            stageSource: last.fuenteEtapaFenologica,
          }
        : null,
    },
  };
}

async function main() {
  if (String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() !== 'testing') {
    throw new Error('Preview rechazado: requiere el entorno Railway testing.');
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
    const lotObjectId = new ObjectId(LOT_ID);
    const sowingObjectId = new ObjectId(SOWING_ID);
    const [lot, sowing, gridPoint, dailyRows] = await Promise.all([
      db.collection('lotes').findOne({ _id: lotObjectId }),
      db.collection('siembras').findOne({ _id: sowingObjectId, idLote: lotObjectId }),
      db.collection('weather_grid_points').findOne({ key: GRID_POINT_KEY, enabled: true }),
      db.collection('weather_daily').find({
        gridPointKey: GRID_POINT_KEY,
        calculationVersion: CALCULATION_VERSION,
        date: { $gte: FROM, $lte: TO },
      }).sort({ date: 1 }).toArray(),
    ]);
    if (!lot || !sowing || !gridPoint) throw new Error('Scope piloto incompleto.');
    const [seed, crono, observations] = await Promise.all([
      db.collection('semillas').findOne({ _id: sowing.idSemilla }),
      db.collection('cronos').findOne({ _id: sowing.idCrono }),
      db.collection('observaciones_meteorologicas').find({
        idEstablecimiento: sowing.idEstablecimiento || lot.idEstablecimiento,
        granularidad: 'daily',
        fechaLocal: { $gte: FROM, $lte: TO },
      }).sort({ fechaLocal: 1, _id: 1 }).toArray(),
    ]);
    if (!seed || !crono) throw new Error('Semilla o cronograma piloto no resoluble.');
    const base = observations
      .map((item) => observationForLot(item, LOT_ID))
      .filter(Boolean);
    if (
      new Set(base.map((item) => item.fechaLocal)).size !== expectedDays ||
      dailyRows.length !== expectedDays
    ) {
      throw new Error(`Cobertura piloto inesperada (base=${base.length}, era5=${dailyRows.length}).`);
    }

    const bridge = new ChamanMeteoAgrometBridgeService({});
    const resolved = {
      binding: {
        locationType: 'lote',
        locationId: LOT_ID,
        gridPointKey: GRID_POINT_KEY,
        latitude: Number(lot.ubicacion.centro.lat),
        longitude: Number(lot.ubicacion.centro.lng),
        distanceKm: 0,
        active: true,
      },
      gridPoint: plain(gridPoint),
    };
    const config = {
      enabled: true,
      lotAllowlist: [LOT_ID],
      historicalStart: FROM,
      recentOpenMeteoDays: 5,
      calculationVersion: CALCULATION_VERSION,
      sourceVersion: SOURCE_VERSION,
    };
    const era5 = dailyRows
      .map((row) => bridge.normalizeDaily(
        row,
        asId(sowing.idEstablecimiento || lot.idEstablecimiento),
        LOT_ID,
        resolved,
        config,
      ))
      .filter(Boolean);
    const simulatedMissing = base.map(removeDailyTemperature);
    const merged = mergeDailyHistoricalGapFill(simulatedMissing, era5);
    const engine = new AgrometeorologicalEngineService({}, {});
    const inputSowing = {
      ...plain(sowing),
      _id: SOWING_ID,
      idLote: LOT_ID,
      fechaSiembra: FROM,
      semilla: plain(seed),
      crono: plain(crono),
    };
    const inputLot = { ...plain(lot), _id: LOT_ID };
    const coordinates = {
      lat: Number(lot.ubicacion.centro.lat),
      lng: Number(lot.ubicacion.centro.lng),
    };
    const before = engine.calculateIndicators(
      inputSowing,
      inputLot,
      coordinates,
      simulatedMissing,
      [],
      undefined,
      undefined,
      TO,
    );
    const after = engine.calculateIndicators(
      inputSowing,
      inputLot,
      coordinates,
      merged,
      [],
      undefined,
      undefined,
      TO,
    );
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database: db.databaseName,
      readOnly: true,
      persistedWrites: 0,
      pilot: { lotId: LOT_ID, sowingId: SOWING_ID, crop: seed.cultivo, from: FROM, to: TO },
      coverage: { baseDays: base.length, era5Days: era5.length, mergedDays: merged.length },
      simulatedWithoutEra5: summarizeScenario(before, simulatedMissing, seed.cultivo),
      withEra5GapFill: summarizeScenario(after, merged, seed.cultivo),
      priorityProof: {
        retainedOpenMeteoPrecipitationDays: merged.filter(
          (item) => item.fuentePorVariable?.precipitationMm === 'open_meteo',
        ).length,
        retainedHigherPriorityTemperatureDays: base.filter((item) =>
          ['temperatureMinC', 'temperatureMeanC', 'temperatureMaxC'].every(
            (key) => finite(item.valores?.[key]),
          ),
        ).length,
      },
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
