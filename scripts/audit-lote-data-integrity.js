const fs = require('fs');

const RECOVERY_URI_FILE = process.env.CHAMAN_RECOVERY_URI_FILE || '';
const DB_URL = RECOVERY_URI_FILE
  ? (() => {
      if (process.env.CHAMAN_RECOVERY_DRILL !== 'true') {
        throw new Error('CHAMAN_RECOVERY_URI_FILE solo se admite en un recovery drill.');
      }
      return fs.readFileSync(RECOVERY_URI_FILE, 'utf8').trim();
    })()
  :
  process.env.MONGO_PUBLIC_URL ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  '';
const DB_NAME =
  process.env.DB_NAME ||
  (String(process.env.RAILWAY_ENVIRONMENT_NAME || '').toLowerCase() ===
  'testing'
    ? 'chaman_testing'
    : 'chaman');
const LIMIT = Number(
  process.env.CHAMAN_AUDIT_LIMIT ||
    process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ||
    5000,
);
const ONLY_LOTES = String(
  process.env.CHAMAN_AUDIT_LOTES ||
    process.argv.find((arg) => arg.startsWith('--lotes='))?.split('=')[1] ||
    '',
).trim();
const STRICT = process.env.CHAMAN_AUDIT_STRICT === 'true' || process.argv.includes('--strict');

const ISSUE_SAMPLE_LIMIT = 30;
const TENANT_FIELDS = ['idQuimica', 'idDistribuidor', 'idProductor', 'idEstablecimiento', 'idDepartamento'];

function id(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function eq(a, b) {
  const left = id(a);
  const right = id(b);
  if (!left || !right) return true;
  return left === right;
}

function label(doc) {
  return [doc?.nombre, doc?._id ? id(doc._id).slice(-6) : undefined].filter(Boolean).join(' ');
}

function createFindingCollector(sampleLimit = ISSUE_SAMPLE_LIMIT) {
  return { total: 0, samples: [], sampleLimit };
}

function pushIssue(findings, type, message, details) {
  findings.total += 1;
  if (findings.samples.length < findings.sampleLimit) {
    findings.samples.push({ type, message, details });
  }
}

function classifySiembraReferences(siembra) {
  return {
    missingSemilla: !siembra?.idSemilla ? 'blocking' : 'ok',
    // idCrono es metadata legacy opcional. Los motores sanitarios canonicos
    // leen la etapa desde la serie agrometeorologica y Cebada / Arveja
    // conservan explicitamente salidas de baja confianza cuando falta etapa.
    missingCrono: !siembra?.idCrono ? 'warning' : 'ok',
  };
}

function compareTenant(findings, sourceName, source, lote) {
  for (const field of TENANT_FIELDS) {
    if (!eq(source?.[field], lote?.[field])) {
      pushIssue(findings, 'tenant_mismatch', `${sourceName}.${field} no coincide con lote.${field}`, {
        sourceId: id(source?._id),
        lote: label(lote),
        sourceValue: id(source?.[field]),
        loteValue: id(lote?.[field]),
      });
    }
  }
}

async function collectionExists(db, name) {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
}

async function getCollection(db, names) {
  for (const name of names) {
    if (await collectionExists(db, name)) return db.collection(name);
  }
  return undefined;
}

async function main() {
  if (!DB_URL) {
    throw new Error('Falta MONGO_URI/MONGO_URL/DATABASE_URL/DB_URL para auditar integridad de lotes.');
  }

  // El driver pertenece al servicio Datos. Se carga sólo al ejecutar la CLI
  // para que las reglas puras de auditoría puedan probarse offline en CI.
  const { MongoClient } = require('../sdc-datos/node_modules/mongodb');
  const client = await MongoClient.connect(DB_URL, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
  });

  try {
    const db = client.db(DB_NAME);
    const lotesCollection = db.collection('lotes');
    const siembrasCollection = db.collection('siembras');
    const ndviCollection = await getCollection(db, ['reportendvis', 'reporte_ndvis']);
    const alertasCollection = await getCollection(db, ['alertas']);
    const dispositivosCollection = await getCollection(db, ['dispositivos']);
    const prediccionsCollection = await getCollection(db, ['prediccions']);
    const predRiegoCollection = await getCollection(db, ['prediccion-riego', 'prediccionriegos']);

    const filtroLotes = ONLY_LOTES ? { nombre: { $regex: ONLY_LOTES, $options: 'i' } } : {};
    const lotes = await lotesCollection.find(filtroLotes).limit(LIMIT).toArray();
    const loteById = new Map(lotes.map((lote) => [id(lote._id), lote]));
    const loteIds = lotes.map((lote) => lote._id);
    const issues = createFindingCollector();
    const warnings = createFindingCollector();
    const counters = {
      lotes: lotes.length,
      siembras: 0,
      ndvi: 0,
      alertas: 0,
      dispositivos: 0,
      predicciones: 0,
      riego: 0,
      issues: 0,
      warnings: 0,
    };

    const siembras = await siembrasCollection
      .find({ idLote: { $in: loteIds } })
      .project({
        idLote: 1,
        idSemilla: 1,
        idCrono: 1,
        idQuimica: 1,
        idDistribuidor: 1,
        idProductor: 1,
        idEstablecimiento: 1,
        idDepartamento: 1,
        fechaSiembra: 1,
        fechaCosecha: 1,
        activa: 1,
      })
      .toArray();
    counters.siembras = siembras.length;

    const siembraById = new Map(siembras.map((siembra) => [id(siembra._id), siembra]));
    for (const siembra of siembras) {
      const lote = loteById.get(id(siembra.idLote));
      if (!lote) {
        pushIssue(issues, 'missing_lote', 'Siembra apunta a lote inexistente en el alcance auditado', {
          siembraId: id(siembra._id),
          idLote: id(siembra.idLote),
        });
        continue;
      }
      compareTenant(issues, 'siembra', siembra, lote);
      const references = classifySiembraReferences(siembra);
      if (references.missingSemilla === 'blocking') {
        pushIssue(issues, 'missing_semilla', 'Siembra sin idSemilla', { siembraId: id(siembra._id), lote: label(lote) });
      }
      if (references.missingCrono === 'warning') {
        pushIssue(warnings, 'missing_crono', 'Siembra sin idCrono; metadata legacy opcional', {
          siembraId: id(siembra._id),
          lote: label(lote),
        });
      }
      if (lote.idSiembra && id(lote.idSiembra) !== id(siembra._id) && siembra.activa !== false && !siembra.fechaCosecha) {
        pushIssue(issues, 'active_siembra_mismatch', 'Lote.idSiembra no coincide con siembra activa', {
          lote: label(lote),
          loteIdSiembra: id(lote.idSiembra),
          siembraId: id(siembra._id),
        });
      }
    }

    const siembraIds = siembras.map((siembra) => siembra._id);

    if (ndviCollection) {
      const reportes = await ndviCollection
        .find({ idLote: { $in: loteIds } })
        .project({
          idLote: 1,
          idQuimica: 1,
          idDistribuidor: 1,
          idProductor: 1,
          idEstablecimiento: 1,
          idDepartamento: 1,
          fechaDeLaImagen: 1,
          ndviPromedio: 1,
          coleccion: 1,
        })
        .limit(LIMIT)
        .toArray();
      counters.ndvi = reportes.length;
      for (const reporte of reportes) {
        const lote = loteById.get(id(reporte.idLote));
        if (lote) compareTenant(issues, 'reporteNdvi', reporte, lote);
      }
    }

    if (alertasCollection) {
      const alertas = await alertasCollection
        .find({ idSiembra: { $in: siembraIds } })
        .project({
          idSiembra: 1,
          idQuimica: 1,
          idDistribuidor: 1,
          idProductor: 1,
          idEstablecimiento: 1,
          categoria: 1,
          severidad: 1,
          prioridad: 1,
          estadoActual: 1,
          titulo: 1,
        })
        .limit(LIMIT)
        .toArray();
      counters.alertas = alertas.length;
      for (const alerta of alertas) {
        const siembra = siembraById.get(id(alerta.idSiembra));
        const lote = siembra ? loteById.get(id(siembra.idLote)) : undefined;
        if (!siembra || !lote) {
          pushIssue(issues, 'alerta_orfana', 'Alerta sin siembra/lote resoluble', {
            alertaId: id(alerta._id),
            idSiembra: id(alerta.idSiembra),
          });
          continue;
        }
        compareTenant(issues, 'alerta', alerta, lote);
      }
    }

    if (dispositivosCollection) {
      const dispositivos = await dispositivosCollection
        .find({ idLote: { $in: loteIds } })
        .project({
          idLote: 1,
          idQuimica: 1,
          idDistribuidor: 1,
          idProductor: 1,
          idEstablecimiento: 1,
          nombre: 1,
          devEUI: 1,
        })
        .limit(LIMIT)
        .toArray();
      counters.dispositivos = dispositivos.length;
      for (const dispositivo of dispositivos) {
        const lote = loteById.get(id(dispositivo.idLote));
        if (lote) compareTenant(issues, 'dispositivo', dispositivo, lote);
      }
    }

    if (prediccionsCollection) {
      const predicciones = await prediccionsCollection
        .find({ idSiembra: { $in: siembraIds } })
        .project({ idSiembra: 1, idQuimica: 1, idDistribuidor: 1, idProductor: 1, idEstablecimiento: 1 })
        .limit(LIMIT)
        .toArray();
      counters.predicciones = predicciones.length;
      for (const prediccion of predicciones) {
        const siembra = siembraById.get(id(prediccion.idSiembra));
        const lote = siembra ? loteById.get(id(siembra.idLote)) : undefined;
        if (lote) compareTenant(issues, 'prediccion', prediccion, lote);
      }
    }

    if (predRiegoCollection) {
      const riegos = await predRiegoCollection
        .find({ idLote: { $in: loteIds } })
        .project({ idLote: 1, idQuimica: 1, idDistribuidor: 1, idProductor: 1, idEstablecimiento: 1 })
        .limit(LIMIT)
        .toArray();
      counters.riego = riegos.length;
      for (const riego of riegos) {
        const lote = loteById.get(id(riego.idLote));
        if (lote) compareTenant(issues, 'prediccionRiego', riego, lote);
      }
    }

    counters.issues = issues.total;
    counters.warnings = warnings.total;
    const result = {
      ok: issues.total === 0,
      db: DB_NAME,
      filtroLotes: ONLY_LOTES || 'todos',
      limit: LIMIT,
      counters,
      issueSamples: issues.samples,
      warningSamples: warnings.samples,
      nota:
        issues.total > issues.samples.length
          ? `Se muestran solo ${ISSUE_SAMPLE_LIMIT} muestras; aumentar CHAMAN_AUDIT_LIMIT o filtrar con CHAMAN_AUDIT_LOTES.`
          : undefined,
      notaAdvertencias:
        warnings.total > warnings.samples.length
          ? `Se muestran solo ${ISSUE_SAMPLE_LIMIT} advertencias.`
          : undefined,
    };

    console.log(JSON.stringify(result, null, 2));
    if (STRICT && !result.ok) process.exit(1);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}

module.exports = { classifySiembraReferences, createFindingCollector, pushIssue };
