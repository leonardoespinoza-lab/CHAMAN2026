const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');
const { Client: PgClient } = require('../sdc-datos/node_modules/pg');

const MONGO_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  'mongodb://127.0.0.1:27017';
const LEGACY_PG_URL =
  process.env.LEGACY_FRUTALES_PG_URL || process.env.OLD_CHAMAN_PG || '';

const DRY_RUN = !process.argv.includes('--apply');
const CREATE_MISSING = process.argv.includes('--create-missing');
const IMPORT_REPORTS = !process.argv.includes('--no-reports');
const CAMPAIGN_START =
  process.env.LEGACY_FRUTALES_CAMPAIGN_START || '2026-01-01T00:00:00.000Z';

const SOURCE = 'legacy-frutales-neuquen';

const SENSOR_MAP = [
  { sensorNumber: 4, establecimiento: 'EL MIRASOL', lote: 'CUADRO 3' },
  { sensorNumber: 2, establecimiento: 'LA COSTA', lote: 'CUADRO 17' },
  { sensorNumber: 3, establecimiento: 'LA CAROLINA', lote: 'CUADRO 7' },
  { sensorNumber: 1, establecimiento: 'LA COSTA', lote: 'CUADRO 7' },
];

const MANZANO_ETAPAS = {
  Reposo_invernal: 0,
  Yema_hinchada: 35,
  Brotacion: 18,
  Floracion: 18,
  Cuaje: 15,
  Desarrollo_de_fruto: 95,
  Madurez: 35,
  Cosecha: 20,
};

function parseArgsValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveDbName(uri) {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const parsed = new URL(uri);
    const name = parsed.pathname.replace(/^\//, '');
    return name || 'chaman';
  } catch {
    return 'chaman';
  }
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function norm(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizeDevEui(value) {
  return cleanText(value).replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function normalizedEstablecimientoTokens(value) {
  const base = norm(value)
    .replace(/^CHACRA\s+/, '')
    .replace(/^EL\s+/, '')
    .trim();
  return [norm(value), base].filter(Boolean);
}

function expectedLoteLabel(mapping) {
  return `${mapping.lote} (${mapping.establecimiento}) SENSOR ${mapping.sensorNumber}`;
}

function matchesEstablecimientoName(name, expected) {
  const actual = norm(name);
  const expectedTokens = normalizedEstablecimientoTokens(expected);
  return expectedTokens.some(
    (token) =>
      actual === token ||
      actual === norm(`CHACRA ${expected}`) ||
      actual.replace(/^CHACRA\s+/, '') === token ||
      actual.includes(token),
  );
}

function matchesLoteName(name, mapping) {
  const actual = norm(name);
  const fullLabel = norm(expectedLoteLabel(mapping));
  return (
    actual === norm(mapping.lote) ||
    actual === fullLabel ||
    (
      actual.includes(norm(mapping.lote)) &&
      actual.includes(norm(`SENSOR ${mapping.sensorNumber}`)) &&
      actual.includes(norm(mapping.establecimiento))
    )
  );
}

function sensorNumberFromName(name) {
  const match = cleanText(name).match(/sensor\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function toObjectId(value) {
  if (!value) return undefined;
  if (value instanceof ObjectId) return value;
  return new ObjectId(String(value));
}

function numberOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function hfeFactor(temp) {
  const value = Number(temp);
  if (!Number.isFinite(value)) return undefined;
  const points = [
    [-5, 0],
    [0, 0.2],
    [1, 0.45],
    [2, 0.65],
    [3, 0.799],
    [4, 0.905],
    [5, 0.975],
    [6, 1],
    [7, 0.975],
    [8, 0.905],
    [9, 0.799],
    [10, 0.68],
    [11, 0.54],
    [12, 0.407],
    [13, 0.29],
    [14, 0.18],
    [15, 0.08],
    [16, 0],
    [18, 0],
  ];
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (value >= x1 && value <= x2) {
      const t = (value - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return 0;
}

function formatDate(value) {
  return value ? new Date(value).toISOString() : undefined;
}

function drySummary(data) {
  return JSON.stringify(data, null, 2).replace(/[a-f0-9]{24,}/gi, (value) =>
    value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value,
  );
}

function buildSemillaDoc(variedad) {
  const cultivar = cleanText(variedad.cultivar);
  const portainjerto = cleanText(variedad.portainjerto) || 'SIN PIE';
  return {
    codigoCarga: `${SOURCE}:variedad:${variedad.id}`,
    fuenteBase: 'App legacy horas frio Neuquen',
    semillero: 'Frutales Neuquen',
    cultivo: 'Manzano',
    variedad: cultivar,
    ciclo: norm(portainjerto || 'GENERAL'),
    resistencia: [],
    campania: 'Perenne',
    tipoCultivo: 'Perenne',
    portainjerto: portainjerto === 'SIN PIE' ? undefined : portainjerto,
    requerimientoFrio: {
      horasFrio: numberOrUndefined(variedad.hf_requeridas),
      horasFrioEfectivas: numberOrUndefined(variedad.hfe_requeridas),
      porcionesFrio: numberOrUndefined(variedad.cp_requeridas),
      modelo: 'HF + HFE + CP',
    },
    fenologiaReferencia: {
      brotacion: cleanText(variedad.brotacion) || 'Registrar fecha real por lote',
      floracion: cleanText(variedad.floracion) || 'Registrar fecha real por lote',
      cosecha: cleanText(variedad.cosecha) || 'Registrar fecha real por lote',
      editable: true,
      etapas: MANZANO_ETAPAS,
    },
    observaciones:
      cleanText(variedad.observaciones) ||
      'Importado desde app de horas frio; editable por productor o tecnico.',
  };
}

function buildCronoDoc(semilla) {
  return {
    cultivo: 'Manzano',
    ciclo: semilla.ciclo,
    etapas: MANZANO_ETAPAS,
  };
}

function buildReportDoc(row, deviceId) {
  const object = row.object_json || {};
  const temperature = numberOrUndefined(object.temperature);
  const humidity = numberOrUndefined(object.humidity);
  const battery = numberOrUndefined(object.battery);
  const valores = {};

  if (temperature !== undefined) {
    valores.Temperatura = [
      {
        unidad: 'C',
        valores: { actual: Number(temperature.toFixed(2)) },
      },
    ];
  }

  if (humidity !== undefined) {
    valores.Humedad = [
      {
        unidad: '%',
        valores: { actual: Number(humidity.toFixed(2)) },
      },
    ];
  }

  if (battery !== undefined) {
    valores['Batería'] = [
      {
        unidad: '%',
        valores: { actual: Number(battery.toFixed(2)) },
      },
    ];
  }

  return {
    idDispositivo: toObjectId(deviceId),
    deveui: normalizeDevEui(row.dev_eui),
    fechaCreacion: row.created_at ? new Date(row.created_at) : new Date(row.time),
    fecha: new Date(row.time),
    estado: 'completo',
    datos: { valores },
    metadataLora: {
      gatewayID: cleanText(row.gateway_id) || undefined,
      rssi: numberOrUndefined(row.rssi),
      snr: numberOrUndefined(row.snr),
      legacy: {
        source: SOURCE,
        uplinkId: row.id,
        topic: row.topic,
      },
    },
  };
}

function parseLegacyRawPayload(row) {
  let raw = {};
  if (row.raw_json && typeof row.raw_json === 'object') {
    raw = row.raw_json;
  } else if (row.raw_json) {
    try {
      raw = JSON.parse(row.raw_json);
    } catch {
      raw = {};
    }
  }

  return {
    ...raw,
    object: raw.object || row.object_json || {},
    legacy: {
      source: SOURCE,
      uplinkId: row.id,
      importedFrom: 'legacy-frutales-postgres',
    },
  };
}

function buildLorawanUplinkDoc(row) {
  const rawPayload = parseLegacyRawPayload(row);
  const timestamp = new Date(row.time);

  return {
    fechaCreacion: row.created_at ? new Date(row.created_at) : timestamp,
    topic: row.topic,
    applicationName: 'Legacy ChirpStack frutales',
    devEUI: normalizeDevEui(row.dev_eui),
    deviceName: cleanText(row.device_name),
    data: rawPayload.data,
    gatewayID: cleanText(row.gateway_id) || undefined,
    rssi: numberOrUndefined(row.rssi),
    snr: numberOrUndefined(row.snr),
    frequency: numberOrUndefined(rawPayload.frequency),
    dr: numberOrUndefined(rawPayload.dr),
    timestamp,
    rawPayload,
  };
}

function buildDeviceDoc({ oldSensor, mapping, lote, establecimiento, chillState, latestReport }) {
  const latestObject = latestReport?.object_json || {};
  const battery = numberOrUndefined(latestObject.battery);
  const temperature = numberOrUndefined(chillState?.last_temp);
  const lastTime = chillState?.last_time || latestReport?.time;
  const idLote = lote?._id;
  const idEstablecimiento = establecimiento?._id;

  return {
    idQuimica: lote?.idQuimica || establecimiento?.idQuimica,
    idDistribuidor: lote?.idDistribuidor || establecimiento?.idDistribuidor,
    idProductor: lote?.idProductor || establecimiento?.idProductor,
    idEstablecimiento,
    idLote,
    deveui: normalizeDevEui(oldSensor.dev_eui),
    tipo: 'Estacion Meteorologica',
    sensores: ['Temperatura', 'Humedad', 'Batería'],
    nombre: `${mapping.lote} (${mapping.establecimiento}) Sensor ${mapping.sensorNumber}`,
    bateria:
      battery !== undefined
        ? { valor: battery, unidad: '%', fecha: formatDate(lastTime) }
        : undefined,
    ultimoReporte: latestReport ? buildReportDoc(latestReport) : undefined,
    frioAcumulado: {
      fechaInicio: CAMPAIGN_START,
      fechaUltimoCalculo: formatDate(lastTime),
      ultimaTemperatura: temperature,
      horasFrio: numberOrUndefined(chillState?.chill_hours),
      horasFrioEfectivas: numberOrUndefined(chillState?.hfe_hours),
      factorEfectivoActual: hfeFactor(temperature),
      modelo: 'HF <= 7C + HFE Utah simplificado',
      fuente: 'Sensor LoRa',
    },
    fechaUltimaComunicacion: lastTime ? new Date(lastTime) : undefined,
    metadata: {
      applicationName: 'Legacy ChirpStack frutales',
      legacy: {
        source: SOURCE,
        oldDeviceName: oldSensor.device_name,
        oldSensorNumber: mapping.sensorNumber,
      },
    },
  };
}

async function loadLegacyData(pg) {
  const configsRes = await pg.query('select * from sensor_config order by device_name');
  const variedadesRes = await pg.query('select * from variedades order by id');
  const chillRes = await pg.query('select * from chill_state order by device_name');
  const uplinksSummaryRes = await pg.query(`
      select dev_eui, min(time) as first_time, max(time) as last_time, count(*)::int as count
      from uplinks
      group by dev_eui
    `);

  const configsBySensor = new Map(
    configsRes.rows
      .map((row) => [sensorNumberFromName(row.device_name), row])
      .filter(([sensor]) => Number.isFinite(sensor)),
  );
  const variedadesById = new Map(variedadesRes.rows.map((row) => [Number(row.id), row]));
  const chillByDevEui = new Map(
    chillRes.rows.map((row) => [normalizeDevEui(row.dev_eui), row]),
  );
  const summaryByDevEui = new Map(
    uplinksSummaryRes.rows.map((row) => [normalizeDevEui(row.dev_eui), row]),
  );

  const mapped = SENSOR_MAP.map((mapping) => {
    const oldSensor = configsBySensor.get(mapping.sensorNumber);
    const devEui = normalizeDevEui(oldSensor?.dev_eui);
    return {
      mapping,
      oldSensor,
      devEui,
      variedad: variedadesById.get(Number(oldSensor?.variedad_id)),
      chillState: chillByDevEui.get(devEui),
      uplinksSummary: summaryByDevEui.get(devEui),
    };
  });

  const devEuis = mapped.map((item) => item.devEui).filter(Boolean);
  const uplinksByDevEui = new Map(devEuis.map((devEui) => [devEui, []]));

  if (devEuis.length && IMPORT_REPORTS) {
    const uplinksRes = await pg.query(
      `
        select id, dev_eui, device_name, time, object_json, rssi, snr, gateway_id, topic, raw_json, created_at
        from uplinks
        where upper(dev_eui) = any($1)
        order by time asc
      `,
      [devEuis],
    );
    for (const row of uplinksRes.rows) {
      const key = normalizeDevEui(row.dev_eui);
      if (!uplinksByDevEui.has(key)) uplinksByDevEui.set(key, []);
      uplinksByDevEui.get(key).push(row);
    }
  }

  return mapped.map((item) => ({
    ...item,
    uplinks: uplinksByDevEui.get(item.devEui) || [],
  }));
}

async function loadTargetContext(db, legacyItems) {
  const establecimientos = await db.collection('establecimientos').find({}).toArray();
  const lotes = await db.collection('lotes').find({}).toArray();

  return legacyItems.map((item) => {
    const estCandidates = establecimientos.filter(
      (est) => matchesEstablecimientoName(est.nombre, item.mapping.establecimiento),
    );
    const loteCandidates = lotes.filter(
      (lote) => matchesLoteName(lote.nombre, item.mapping),
    );
    const match = loteCandidates
      .map((lote) => ({
        lote,
        establecimiento: estCandidates.find(
          (est) => String(est._id) === String(lote.idEstablecimiento),
        ),
      }))
      .find((candidate) => candidate.establecimiento);

    return {
      ...item,
      target: match || {
        lote: loteCandidates[0],
        establecimiento: estCandidates[0],
      },
      diagnostics: {
        establecimientosConEseNombre: estCandidates.length,
        lotesConEseNombre: loteCandidates.length,
      },
    };
  });
}

async function upsertSemilla(db, variedad) {
  const doc = buildSemillaDoc(variedad);
  const result = await db.collection('semillas').findOneAndUpdate(
    {
      cultivo: doc.cultivo,
      semillero: doc.semillero,
      variedad: doc.variedad,
      ciclo: doc.ciclo,
      campania: doc.campania,
    },
    { $set: doc },
    { upsert: true, returnDocument: 'after' },
  );
  return result.value || result;
}

async function upsertCrono(db, semilla) {
  const doc = buildCronoDoc(semilla);
  const result = await db.collection('cronos').findOneAndUpdate(
    {
      cultivo: doc.cultivo,
      ciclo: doc.ciclo,
      idDepartamento: { $exists: false },
    },
    { $set: doc, $unset: { idDepartamento: '' } },
    { upsert: true, returnDocument: 'after' },
  );
  return result.value || result;
}

async function upsertPlantacion(db, item, semilla, crono) {
  const { lote, establecimiento } = item.target;
  const existing = lote.idSiembra
    ? await db.collection('siembras').findOne({ _id: toObjectId(lote.idSiembra) })
    : await db.collection('siembras').findOne({
        idLote: lote._id,
        activa: true,
      });

  const doc = {
    idQuimica: lote.idQuimica || establecimiento.idQuimica,
    idDistribuidor: lote.idDistribuidor || establecimiento.idDistribuidor,
    idProductor: lote.idProductor || establecimiento.idProductor,
    idEstablecimiento: lote.idEstablecimiento || establecimiento._id,
    idLote: lote._id,
    idDepartamento: lote.idDepartamento,
    idSemilla: semilla._id,
    idCrono: crono._id,
    fechaSiembra: existing?.fechaSiembra || new Date(CAMPAIGN_START),
    activa: true,
    coordenadas: lote.ubicacion?.centro,
    geojson: lote.ubicacion?.geojson,
  };

  const result = await db.collection('siembras').findOneAndUpdate(
    existing ? { _id: existing._id } : { idLote: lote._id, activa: true },
    { $set: doc },
    { upsert: true, returnDocument: 'after' },
  );
  const plantacion = result.value || result;
  await db.collection('lotes').updateOne(
    { _id: lote._id },
    { $set: { idSiembra: plantacion._id } },
  );
  return plantacion;
}

async function upsertDeviceAndReports(db, item) {
  const { lote, establecimiento } = item.target;
  const latestReport = item.uplinks[item.uplinks.length - 1];
  const deviceDoc = buildDeviceDoc({
    oldSensor: item.oldSensor,
    mapping: item.mapping,
    lote,
    establecimiento,
    chillState: item.chillState,
    latestReport,
  });

  const deviceResult = await db.collection('dispositivos').findOneAndUpdate(
    { deveui: deviceDoc.deveui },
    { $set: deviceDoc },
    { upsert: true, returnDocument: 'after' },
  );
  const device = deviceResult.value || deviceResult;

  if (!Array.isArray(lote.idsDispositivo)) {
    await db.collection('lotes').updateOne(
      { _id: lote._id },
      { $set: { idsDispositivo: [] } },
    );
  }

  await db.collection('lotes').updateOne(
    { _id: lote._id },
    { $addToSet: { idsDispositivo: device._id } },
  );

  let reportResult = { upserted: 0, modified: 0, matched: 0, skipped: 0 };
  let uplinkResult = { upserted: 0, modified: 0, matched: 0, skipped: 0 };
  if (IMPORT_REPORTS && item.uplinks.length) {
    const reportOps = item.uplinks.map((row) => {
      const report = buildReportDoc(row, device._id);
      return {
        updateOne: {
          filter: {
            deveui: report.deveui,
            fecha: report.fecha,
            'metadataLora.legacy.source': SOURCE,
          },
          update: { $set: report },
          upsert: true,
        },
      };
    });

    const uplinkOps = item.uplinks.map((row) => {
      const uplink = buildLorawanUplinkDoc(row);
      return {
        updateOne: {
          filter: {
            devEUI: uplink.devEUI,
            timestamp: uplink.timestamp,
            'rawPayload.legacy.source': SOURCE,
            'rawPayload.legacy.uplinkId': row.id,
          },
          update: { $set: uplink },
          upsert: true,
        },
      };
    });

    for (let i = 0; i < reportOps.length; i += 500) {
      const chunk = reportOps.slice(i, i + 500);
      const res = await db.collection('reportes').bulkWrite(chunk, { ordered: false });
      reportResult.upserted += res.upsertedCount || 0;
      reportResult.modified += res.modifiedCount || 0;
      reportResult.matched += res.matchedCount || 0;
    }

    for (let i = 0; i < uplinkOps.length; i += 500) {
      const chunk = uplinkOps.slice(i, i + 500);
      const res = await db.collection('lorawan_uplinks').bulkWrite(chunk, { ordered: false });
      uplinkResult.upserted += res.upsertedCount || 0;
      uplinkResult.modified += res.modifiedCount || 0;
      uplinkResult.matched += res.matchedCount || 0;
    }
  }

  return { device, reportResult, uplinkResult };
}

function collectIssues(items) {
  const issues = [];
  for (const item of items) {
    if (!item.oldSensor) {
      issues.push(`No se encontro sensor legacy ${item.mapping.sensorNumber}`);
    }
    if (!item.variedad) {
      issues.push(`No se encontro variedad legacy para sensor ${item.mapping.sensorNumber}`);
    }
    if (!item.target?.establecimiento) {
      issues.push(`No se encontro establecimiento ${item.mapping.establecimiento} en Chaman`);
    }
    if (!item.target?.lote) {
      issues.push(`No se encontro lote ${item.mapping.lote} en Chaman`);
    }
    if (
      item.target?.lote &&
      item.target?.establecimiento &&
      String(item.target.lote.idEstablecimiento) !== String(item.target.establecimiento._id)
    ) {
      issues.push(
        `El lote ${item.mapping.lote} no pertenece a ${item.mapping.establecimiento}`,
      );
    }
  }
  return issues;
}

async function main() {
  if (!LEGACY_PG_URL) {
    throw new Error('Falta LEGACY_FRUTALES_PG_URL u OLD_CHAMAN_PG para leer la app vieja.');
  }

    const sensorArg = parseArgsValue('--sensor');
    const onlySensor = sensorArg ? Number(sensorArg) : undefined;
  const pg = new PgClient({
    connectionString: LEGACY_PG_URL,
    ssl: process.env.LEGACY_FRUTALES_PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  const mongo = await MongoClient.connect(MONGO_URL);
  const db = mongo.db(resolveDbName(MONGO_URL));

  try {
    await pg.connect();
    let legacyItems = await loadLegacyData(pg);
    if (Number.isFinite(onlySensor)) {
      legacyItems = legacyItems.filter((item) => item.mapping.sensorNumber === onlySensor);
    }
    const items = await loadTargetContext(db, legacyItems);
    const issues = collectIssues(items);

    const summary = {
      ok: true,
      dryRun: DRY_RUN,
      source: SOURCE,
      campaignStart: CAMPAIGN_START,
      importReports: IMPORT_REPORTS,
      issues,
      sensores: items.map((item) => ({
        sensor: item.mapping.sensorNumber,
        establecimiento: item.mapping.establecimiento,
        lote: item.mapping.lote,
        devEui: item.devEui,
        legacyDeviceName: item.oldSensor?.device_name,
        variedad: item.variedad
          ? `${item.variedad.cultivar}${item.variedad.portainjerto ? ` / ${item.variedad.portainjerto}` : ''}`
          : null,
        targetEstablecimiento: item.target?.establecimiento?.nombre,
        targetLote: item.target?.lote?.nombre,
        reportesHistoricos: item.uplinks.length || item.uplinksSummary?.count || 0,
        primerReporte: formatDate(item.uplinksSummary?.first_time),
        ultimoReporte: formatDate(item.uplinksSummary?.last_time),
        horasFrio: numberOrUndefined(item.chillState?.chill_hours),
        horasFrioEfectivas: numberOrUndefined(item.chillState?.hfe_hours),
      })),
    };

    if (DRY_RUN) {
      console.log(drySummary(summary));
      return;
    }

    if (issues.length && !CREATE_MISSING) {
      const error = new Error('Cruce incompleto. Corregir antes de importar.');
      error.issues = issues;
      throw error;
    }

    const writes = [];
    for (const item of items) {
      const semilla = await upsertSemilla(db, item.variedad);
      const crono = await upsertCrono(db, semilla);
      const plantacion = await upsertPlantacion(db, item, semilla, crono);
      const { device, reportResult, uplinkResult } = await upsertDeviceAndReports(db, item);
      writes.push({
        sensor: item.mapping.sensorNumber,
        semilla: semilla._id,
        crono: crono._id,
        plantacion: plantacion._id,
        dispositivo: device._id,
        reportes: reportResult,
        uplinks: uplinkResult,
      });
    }

    console.log(
      drySummary({
        ...summary,
        writes,
        counts: {
          dispositivosLegacy: await db.collection('dispositivos').countDocuments({
            'metadata.legacy.source': SOURCE,
          }),
          reportesLegacy: await db.collection('reportes').countDocuments({
            'metadataLora.legacy.source': SOURCE,
          }),
          uplinksLegacy: await db.collection('lorawan_uplinks').countDocuments({
            'rawPayload.legacy.source': SOURCE,
          }),
          semillasLegacy: await db.collection('semillas').countDocuments({
            codigoCarga: { $regex: `^${SOURCE}:` },
          }),
        },
      }),
    );
  } catch (error) {
    if (error.issues) {
      console.error(JSON.stringify({ ok: false, issues: error.issues }, null, 2));
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await pg.end().catch(() => undefined);
    await mongo.close().catch(() => undefined);
  }
}

main();
