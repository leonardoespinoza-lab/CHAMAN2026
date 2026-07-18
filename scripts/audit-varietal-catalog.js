/*
 * Read-only inventory for the scientific varietal catalog.
 *
 * Usage:
 *   railway run --service testing-datos --environment testing -- \
 *     node scripts/audit-varietal-catalog.js
 */
const { MongoClient } = require('mongodb');

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI no esta disponible.');
  }

  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15_000,
  });

  try {
    await client.connect();
    const db = client.db();
    const rows = await db
      .collection('semillas')
      .find(
        {},
        {
          projection: {
            _id: 1,
            codigoCarga: 1,
            fuenteBase: 1,
            semillero: 1,
            cultivo: 1,
            variedad: 1,
            ciclo: 1,
            campania: 1,
            tipoCultivo: 1,
            portainjerto: 1,
            requerimientoFrio: 1,
            fenologiaReferencia: 1,
            parametrosAgrometeorologicos: 1,
          },
        },
      )
      .sort({ cultivo: 1, semillero: 1, variedad: 1, campania: -1 })
      .toArray();

    const requestedCrop = (() => {
      const index = process.argv.indexOf('--crop');
      return index >= 0 ? normalize(process.argv[index + 1]) : '';
    })();
    const compact = process.argv.includes('--compact');
    const records = rows.map((row) => ({
      id: String(row._id),
      codigoCarga: row.codigoCarga || null,
      fuenteBase: row.fuenteBase || null,
      cultivo: String(row.cultivo || '').trim(),
      semillero: String(row.semillero || '').trim(),
      variedad: String(row.variedad || '').trim(),
      ciclo: String(row.ciclo || '').trim(),
      campania: row.campania || null,
      tipoCultivo: row.tipoCultivo || null,
      portainjerto: row.portainjerto || null,
      tieneFrio: Boolean(row.requerimientoFrio),
      tieneFenologia: Boolean(row.fenologiaReferencia),
      tieneAgrometeorologia: Boolean(row.parametrosAgrometeorologicos),
      key: [row.cultivo, row.semillero, row.variedad]
        .map(normalize)
        .join('|'),
    })).filter(
      (record) => !requestedCrop || normalize(record.cultivo) === requestedCrop,
    );

    const byCrop = new Map();
    const byKey = new Map();
    for (const record of records) {
      const crop = normalize(record.cultivo) || '(SIN CULTIVO)';
      byCrop.set(crop, (byCrop.get(crop) || 0) + 1);
      const values = byKey.get(record.key) || [];
      values.push(record);
      byKey.set(record.key, values);
    }

    const duplicateGroups = [...byKey.values()]
      .filter((values) => values.length > 1)
      .map((values) => ({
        key: values[0].key,
        count: values.length,
        ids: values.map((value) => value.id),
        campaigns: values.map((value) => value.campania),
      }));

    const missing = {
      cultivo: records.filter((record) => !record.cultivo).length,
      semillero: records.filter((record) => !record.semillero).length,
      variedad: records.filter((record) => !record.variedad).length,
      fuenteBase: records.filter((record) => !record.fuenteBase).length,
      campania: records.filter((record) => !record.campania).length,
    };

    const compactVarieties = Object.fromEntries(
      [...byCrop.keys()].sort().map((crop) => [
        crop,
        [...byKey.values()]
          .filter((values) => normalize(values[0].cultivo) === crop)
          .map((values) => ({
            semillero: values[0].semillero || null,
            variedad: values[0].variedad,
            campañas: [...new Set(values.map((value) => value.campania).filter(Boolean))],
          }))
          .sort((a, b) =>
            `${a.semillero || ''}|${a.variedad}`.localeCompare(
              `${b.semillero || ''}|${b.variedad}`,
            ),
          ),
      ]),
    );

    process.stdout.write(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'unknown',
          grain: 'un registro por cultivo, semillero, variedad, ciclo y campania',
          totalRecords: records.length,
          totalCanonicalVarieties: byKey.size,
          byCrop: Object.fromEntries([...byCrop.entries()].sort()),
          missing,
          duplicateGroups,
          ...(compact ? { varieties: compactVarieties } : { records }),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
