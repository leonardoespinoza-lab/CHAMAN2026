#!/usr/bin/env node

/** Diagnostico de solo lectura para bloqueos sanitarios en Testing. */

const { MongoClient } = require("../sdc-datos/node_modules/mongodb");

const DB_NAME = "chaman_testing";

const stringId = (value) => (value == null ? undefined : String(value));

(async () => {
  const url =
    process.env.MONGO_PUBLIC_URL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI;
  if (!url) throw new Error("No se encontro URL de MongoDB.");
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || DB_NAME);
    if (db.databaseName !== DB_NAME || /production|chaman_prod/i.test(url)) {
      throw new Error("Diagnostico rechazado: solo se permite chaman_testing.");
    }

    const lots = await db
      .collection("lotes")
      .find({ idSiembra: { $exists: true, $ne: null } })
      .toArray();
    const sowings = await db
      .collection("siembras")
      .find({ _id: { $in: lots.map((lot) => lot.idSiembra) } })
      .toArray();
    const rows = [];
    for (const sowing of sowings) {
      const seed = sowing.idSemilla
        ? await db.collection("semillas").findOne({ _id: sowing.idSemilla })
        : sowing.semilla;
      const crop = seed?.cultivo;
      if (!new Set(["Cebada", "Arveja"]).has(crop)) continue;
      const prediction = await db
        .collection("prediccions")
        .find({ idSiembra: sowing._id })
        .sort({ fecha: -1, _id: -1 })
        .limit(1)
        .next();
      const agromet = await db
        .collection("indicadores_agrometeorologicos_generados")
        .find({ idSiembra: sowing._id, esPronostico: false })
        .sort({ fecha: -1, _id: -1 })
        .limit(1)
        .next();
      rows.push({
        idSiembra: stringId(sowing._id),
        cultivo: crop,
        variedad: seed?.variedad,
        fechaPrediccion: prediction?.fecha,
        etapaPrediccion: prediction?.nombreEtapa,
        fuenteFenologia: prediction?.fuenteFenologia,
        calidadFenologia: prediction?.calidadFenologia,
        enfermedades: (prediction?.enfermedades || []).map((disease) => ({
          id: disease.idEnfermedad,
          estado: disease.estado,
          resultado: disease.resultado,
          validacion: disease.modelo?.validacion,
          calidad: disease.calidadDatos,
        })),
        agromet: agromet && {
          fecha: agromet.fecha,
          stage: agromet.stage,
          stageSource: agromet.stageSource,
          stageConfidence: agromet.stageConfidence,
          qualityFlags: agromet.qualityFlags,
          completitudPct: agromet.completitudPct,
          metricas: agromet.metricas || agromet.metrics,
          clima: agromet.clima || agromet.weather,
        },
      });
    }
    const summaryOnly = process.argv.includes("--summary");
    console.log(
      JSON.stringify(
        summaryOnly
          ? rows.map((row) => ({
              idSiembra: row.idSiembra,
              cultivo: row.cultivo,
              variedad: row.variedad,
              fechaPrediccion: row.fechaPrediccion,
              etapaPrediccion: row.etapaPrediccion,
              calidadFenologia: row.calidadFenologia?.nivel,
              estados: row.enfermedades.reduce((acc, disease) => {
                acc[disease.estado] = (acc[disease.estado] || 0) + 1;
                return acc;
              }, {}),
              validaciones: [
                ...new Set(
                  row.enfermedades.map((disease) => disease.validacion),
                ),
              ],
            }))
          : rows,
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
