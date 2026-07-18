#!/usr/bin/env node

/**
 * Reparacion acotada y reversible de datos de Testing previa a produccion.
 *
 * Por seguridad:
 * - solo opera sobre la base chaman_testing;
 * - por defecto ejecuta dry-run;
 * - --apply crea un respaldo logico antes de escribir;
 * - --rollback <backupId> restaura exactamente los campos modificados.
 */

const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const DB_NAME = 'chaman_testing';
const BACKUP_COLLECTION = 'maintenance_backups';
const REPAIR_ID = 'preproduction-2026-07-17';
const HAIL_CUTOFF = new Date('2026-07-12T00:00:00.000Z');
const HAIL_COMMENT =
  'Finalizada por mantenimiento controlado: la ventana pronosticada de 72 h de la version v1 ya vencio. No representa el riesgo vigente; cualquier nueva senal debe ser recalculada por el motor v2-conservador.';

const NDVI_REPAIRS = [
  {
    reportId: '6a314c8c4637ff5369375973',
    lotId: '6a314c8c4637ff536937596b',
    fromDepartmentId: '629f9d55ba41aac343d80855',
    toDepartmentId: '629f9d55ba41aac343d808be',
  },
  {
    reportId: '6a316757afac3610561ffe10',
    lotId: '6a314c8c4637ff536937596b',
    fromDepartmentId: '629f9d55ba41aac343d80855',
    toDepartmentId: '629f9d55ba41aac343d808be',
  },
];

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const rollbackIndex = argv.indexOf('--rollback');
  return {
    apply: args.has('--apply'),
    rollbackId:
      rollbackIndex >= 0 && argv[rollbackIndex + 1]
        ? argv[rollbackIndex + 1]
        : undefined,
  };
}

function id(value) {
  return new ObjectId(value);
}

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

function assertTestingOnly(db, mongoUrl) {
  if (db.databaseName !== DB_NAME) {
    throw new Error(`Base rechazada: ${db.databaseName}. Solo se permite ${DB_NAME}.`);
  }
  if (/chaman_prod|production/i.test(String(mongoUrl))) {
    throw new Error('URL rechazada: parece corresponder a produccion.');
  }
}

async function inspect(db) {
  const hailQuery = {
    activa: true,
    versionMotor: 'v1',
    tipo: 'granizo',
    categoria: 'agroclimatica',
    fechaUltimoEvento: { $lt: HAIL_CUTOFF },
  };
  const hailAlerts = await db
    .collection('alertas')
    .find(hailQuery)
    .sort({ fechaUltimoEvento: 1, _id: 1 })
    .toArray();

  const ndvi = [];
  for (const repair of NDVI_REPAIRS) {
    const report = await db.collection('reportendvis').findOne({
      _id: id(repair.reportId),
      idLote: id(repair.lotId),
    });
    const lot = await db.collection('lotes').findOne({ _id: id(repair.lotId) });
    const tenantMatches =
      report &&
      lot &&
      ['idQuimica', 'idDistribuidor', 'idProductor', 'idEstablecimiento'].every(
        (field) => sameId(report[field], lot[field]),
      );
    ndvi.push({
      repair,
      report,
      lot,
      tenantMatches,
      applicable:
        tenantMatches &&
        sameId(report?.idDepartamento, repair.fromDepartmentId) &&
        sameId(lot?.idDepartamento, repair.toDepartmentId),
      alreadyApplied:
        tenantMatches &&
        sameId(report?.idDepartamento, repair.toDepartmentId) &&
        sameId(lot?.idDepartamento, repair.toDepartmentId),
    });
  }

  return { hailQuery, hailAlerts, ndvi };
}

function summary(state) {
  return {
    staleHailV1: state.hailAlerts.length,
    staleHailIds: state.hailAlerts.map((alert) => String(alert._id)),
    ndvi: state.ndvi.map((item) => ({
      reportId: item.repair.reportId,
      tenantMatches: item.tenantMatches,
      applicable: item.applicable,
      alreadyApplied: item.alreadyApplied,
      currentDepartmentId: String(item.report?.idDepartamento || ''),
      lotDepartmentId: String(item.lot?.idDepartamento || ''),
    })),
  };
}

async function apply(db, state) {
  const invalidNdvi = state.ndvi.filter(
    (item) => !item.applicable && !item.alreadyApplied,
  );
  if (invalidNdvi.length > 0) {
    throw new Error(
      `Se cancela la reparacion: ${invalidNdvi.length} reporte(s) NDVI no cumplen las precondiciones de tenant y ubicacion.`,
    );
  }

  const now = new Date();
  const backup = {
    repairId: REPAIR_ID,
    createdAt: now,
    database: db.databaseName,
    status: 'prepared',
    hailAlerts: state.hailAlerts.map((alert) => ({
      _id: alert._id,
      activa: alert.activa,
      estadoActual: alert.estadoActual,
      estados: alert.estados || [],
      fechaVencimiento: alert.fechaVencimiento,
      claveDedupeActiva: alert.claveDedupeActiva,
    })),
    ndviReports: state.ndvi
      .filter((item) => item.applicable)
      .map((item) => ({
        _id: item.report._id,
        idDepartamento: item.report.idDepartamento,
      })),
  };
  const inserted = await db.collection(BACKUP_COLLECTION).insertOne(backup);

  try {
    let closed = 0;
    if (state.hailAlerts.length > 0) {
      const result = await db.collection('alertas').updateMany(
        {
          ...state.hailQuery,
          _id: { $in: state.hailAlerts.map((alert) => alert._id) },
        },
        {
          $set: {
            activa: false,
            estadoActual: 'Finalizada',
            fechaVencimiento: now,
          },
          $unset: { claveDedupeActiva: '' },
          $push: {
            estados: {
              fecha: now,
              estado: 'Finalizada',
              comentario: HAIL_COMMENT,
            },
          },
        },
      );
      closed = result.modifiedCount;
    }

    let ndviUpdated = 0;
    for (const item of state.ndvi.filter((entry) => entry.applicable)) {
      const result = await db.collection('reportendvis').updateOne(
        {
          _id: item.report._id,
          idLote: item.lot._id,
          idDepartamento: id(item.repair.fromDepartmentId),
        },
        { $set: { idDepartamento: id(item.repair.toDepartmentId) } },
      );
      ndviUpdated += result.modifiedCount;
    }

    await db.collection(BACKUP_COLLECTION).updateOne(
      { _id: inserted.insertedId },
      {
        $set: {
          status: 'applied',
          appliedAt: new Date(),
          result: { closedHailAlerts: closed, ndviReportsUpdated: ndviUpdated },
        },
      },
    );
    return {
      backupId: String(inserted.insertedId),
      closedHailAlerts: closed,
      ndviReportsUpdated: ndviUpdated,
    };
  } catch (error) {
    await db.collection(BACKUP_COLLECTION).updateOne(
      { _id: inserted.insertedId },
      { $set: { status: 'failed', failedAt: new Date(), error: String(error) } },
    );
    throw error;
  }
}

async function rollback(db, backupId) {
  const backup = await db
    .collection(BACKUP_COLLECTION)
    .findOne({ _id: id(backupId), repairId: REPAIR_ID });
  if (!backup) throw new Error(`No existe el respaldo ${backupId}.`);
  if (backup.status !== 'applied') {
    throw new Error(`El respaldo ${backupId} no esta aplicado (${backup.status}).`);
  }

  for (const alert of backup.hailAlerts || []) {
    const set = {
      activa: alert.activa,
      estadoActual: alert.estadoActual,
      estados: alert.estados,
    };
    if (alert.fechaVencimiento !== undefined) {
      set.fechaVencimiento = alert.fechaVencimiento;
    }
    if (alert.claveDedupeActiva !== undefined) {
      set.claveDedupeActiva = alert.claveDedupeActiva;
    }
    const unset = {};
    if (alert.fechaVencimiento === undefined) unset.fechaVencimiento = '';
    if (alert.claveDedupeActiva === undefined) unset.claveDedupeActiva = '';
    await db.collection('alertas').updateOne(
      { _id: alert._id },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    );
  }

  for (const report of backup.ndviReports || []) {
    await db
      .collection('reportendvis')
      .updateOne(
        { _id: report._id },
        { $set: { idDepartamento: report.idDepartamento } },
      );
  }

  await db.collection(BACKUP_COLLECTION).updateOne(
    { _id: backup._id },
    { $set: { status: 'rolled_back', rolledBackAt: new Date() } },
  );
  return {
    backupId,
    restoredHailAlerts: (backup.hailAlerts || []).length,
    restoredNdviReports: (backup.ndviReports || []).length,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const mongoUrl = process.env.MONGO_PUBLIC_URL || process.env.MONGO_URL;
  if (!mongoUrl) throw new Error('Falta MONGO_PUBLIC_URL o MONGO_URL.');

  const client = new MongoClient(mongoUrl);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    assertTestingOnly(db, mongoUrl);
    if (options.rollbackId) {
      console.log(JSON.stringify(await rollback(db, options.rollbackId), null, 2));
      return;
    }
    const state = await inspect(db);
    console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...summary(state) }, null, 2));
    if (options.apply) {
      console.log(JSON.stringify(await apply(db, state), null, 2));
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
