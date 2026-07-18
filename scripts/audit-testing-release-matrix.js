#!/usr/bin/env node

/** Auditoria de cierre funcional y de datos para el entorno Testing. */

const { MongoClient } = require("../sdc-datos/node_modules/mongodb");

const DB_NAME = "chaman_testing";
const CURRENT_WHEAT_VERSION = 5;
const CURRENT_PEA_VERSION = 2;
const CROPS_WITH_DISEASE_ENGINE = new Set([
  "Trigo",
  "Cebada",
  "Soja",
  "Maiz",
  "Arveja",
]);
const EXPECTED_DISEASE_IDS = {
  Trigo: new Set([
    "trigo.mancha_amarilla",
    "trigo.roya_hoja",
    "trigo.roya_anaranjada",
    "trigo.mancha_hoja",
    "trigo.fusarium_espiga",
  ]),
  Cebada: new Set([
    "cebada.mancha_red",
    "cebada.escaldadura",
    "cebada.roya_hoja",
    "cebada.fusariosis_espiga",
  ]),
  Arveja: new Set(["arveja.ascochyta", "arveja.mildiu", "arveja.oidio"]),
};

const asString = (value) => (value == null ? undefined : String(value));
const validDate = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
};
const daysSince = (value) => {
  const time = validDate(value);
  return time == null ? undefined : Math.floor((Date.now() - time) / 86400000);
};
const idsEqual = (left, right) => asString(left) === asString(right);

async function latestBy(collection, match, key, dateField) {
  return collection
    .aggregate([
      { $match: match },
      { $sort: { [dateField]: -1, _id: -1 } },
      { $group: { _id: `$${key}`, document: { $first: "$$ROOT" } } },
    ])
    .toArray();
}

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
      throw new Error(
        "Auditoria rechazada: solo puede ejecutarse en chaman_testing.",
      );
    }

    const lots = await db
      .collection("lotes")
      .find({ idSiembra: { $exists: true, $ne: null } })
      .toArray();
    const sowingIds = lots.map((lot) => lot.idSiembra);
    const lotIds = lots.map((lot) => lot._id);
    const sowings = await db
      .collection("siembras")
      .find({ _id: { $in: sowingIds } })
      .toArray();
    const seeds = await db
      .collection("semillas")
      .find({ _id: { $in: sowings.map((sowing) => sowing.idSemilla) } })
      .toArray();

    const [
      latestPredictions,
      latestAgromet,
      latestAgrometForecast,
      latestIrrigation,
      latestNdvi,
    ] = await Promise.all([
      latestBy(
        db.collection("prediccions"),
        { idSiembra: { $in: sowingIds } },
        "idSiembra",
        "fecha",
      ),
      latestBy(
        db.collection("indicadores_agrometeorologicos_generados"),
        { idSiembra: { $in: sowingIds }, esPronostico: false },
        "idSiembra",
        "fecha",
      ),
      latestBy(
        db.collection("indicadores_agrometeorologicos_generados"),
        { idSiembra: { $in: sowingIds }, esPronostico: true },
        "idSiembra",
        "fecha",
      ),
      latestBy(
        db.collection("prediccionriegos"),
        { idSiembra: { $in: sowingIds } },
        "idSiembra",
        "fechaPrediccion",
      ),
      latestBy(
        db.collection("reportendvis"),
        { idLote: { $in: lotIds } },
        "idLote",
        "fechaDeLaImagen",
      ),
    ]);

    const soilAssessments = await db
      .collection("lot_soil_assessments")
      .find(
        { loteId: { $in: lotIds.map(asString) }, status: "ready" },
        { projection: { loteId: 1 } },
      )
      .toArray();
    const users = await db
      .collection("usuarios")
      .find({ activo: true }, { projection: { permisos: 1 } })
      .toArray();
    const duplicatePredictions = await db
      .collection("prediccions")
      .aggregate([
        { $match: { idSiembra: { $in: sowingIds } } },
        {
          $group: {
            _id: { idSiembra: "$idSiembra", fecha: "$fecha" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: "total" },
      ])
      .next();

    const byId = (items) =>
      new Map(items.map((item) => [asString(item._id), item]));
    const sowingById = byId(sowings);
    const seedById = byId(seeds);
    const predictionBySowing = new Map(
      latestPredictions.map((item) => [asString(item._id), item.document]),
    );
    const agrometBySowing = new Map(
      latestAgromet.map((item) => [asString(item._id), item.document]),
    );
    const agrometForecastBySowing = new Map(
      latestAgrometForecast.map((item) => [asString(item._id), item.document]),
    );
    const irrigationBySowing = new Map(
      latestIrrigation.map((item) => [asString(item._id), item.document]),
    );
    const ndviByLot = new Map(
      latestNdvi.map((item) => [asString(item._id), item.document]),
    );
    const soilLots = new Set(
      soilAssessments.map((item) => asString(item.loteId)),
    );

    const matrix = lots.map((lot) => {
      const sowing = sowingById.get(asString(lot.idSiembra));
      const seed = sowing && seedById.get(asString(sowing.idSemilla));
      const prediction = predictionBySowing.get(asString(sowing?._id));
      const agromet = agrometBySowing.get(asString(sowing?._id));
      const agrometForecast = agrometForecastBySowing.get(
        asString(sowing?._id),
      );
      const irrigation = irrigationBySowing.get(asString(sowing?._id));
      const ndvi = ndviByLot.get(asString(lot._id));
      const diseases = prediction?.enfermedades || [];
      const versions = [
        ...new Set(
          diseases
            .map((item) => item.modelo?.version)
            .filter((item) => item != null),
        ),
      ];
      const crop = seed?.cultivo;
      const expectedDiseases = EXPECTED_DISEASE_IDS[crop];
      const diseaseIds = new Set(
        diseases.map((disease) => disease.idEnfermedad).filter(Boolean),
      );
      const allDiseasesWithoutReading =
        diseases.length > 0 &&
        diseases.every((disease) => disease.estado === "sin_datos");
      const provisionalDiseases = diseases.filter(
        (disease) =>
          disease.modelo?.validacion === "operativo_provisional" ||
          disease.modelo?.validacion === "experimental",
      ).length;
      const experimentalPrimaryLeaks = diseases.filter((disease) => {
        if (disease.modelo?.validacion !== "experimental") return false;
        const variables = disease.variables || {};
        const coverage = Number(variables.coberturaHoraria10d);
        return (
          disease.idEnfermedad === "trigo.roya_anaranjada" &&
          (!Number.isFinite(coverage) || coverage < 0.9) &&
          Number(disease.resultado) > 0
        );
      }).length;
      const completeDiseaseMatrix =
        !expectedDiseases ||
        (diseaseIds.size === expectedDiseases.size &&
          [...expectedDiseases].every((id) => diseaseIds.has(id)));
      const staleWheat =
        crop === "Trigo" &&
        (!prediction ||
          diseases.length === 0 ||
          diseases.some(
            (disease) =>
              Number(disease.modelo?.version) !== CURRENT_WHEAT_VERSION,
          ));
      const stalePea =
        crop === "Arveja" &&
        (!prediction ||
          diseases.length === 0 ||
          diseases.some(
            (disease) =>
              Number(disease.modelo?.version) !== CURRENT_PEA_VERSION,
          ));
      const center = lot.ubicacion?.centro || sowing?.coordenadas;
      const tenantConsistent =
        !sowing ||
        [
          "idQuimica",
          "idDistribuidor",
          "idProductor",
          "idEstablecimiento",
        ].every((field) => idsEqual(lot[field], sowing[field]));

      return {
        idLote: asString(lot._id),
        lote: lot.nombre,
        idSiembra: asString(sowing?._id),
        cultivo: crop || "SIN_SEMILLA",
        variedad: seed?.variedad,
        fechaSiembra: sowing?.fechaSiembra,
        integridad: {
          siembra: Boolean(sowing),
          semilla: Boolean(seed),
          tenantConsistente: tenantConsistent,
          coordenadasValidas:
            Number.isFinite(Number(center?.lat)) &&
            Number.isFinite(Number(center?.lng)),
        },
        sanidad: {
          aplica: CROPS_WITH_DISEASE_ENGINE.has(crop),
          cantidad: diseases.length,
          matrizCompleta: completeDiseaseMatrix,
          lecturaInterpretable:
            diseases.length > 0 && !allDiseasesWithoutReading,
          cantidadProvisional: provisionalDiseases,
          fugasResultadoExperimental: experimentalPrimaryLeaks,
          fecha: prediction?.fecha,
          antiguedadDias: daysSince(prediction?.fecha),
          versiones: versions,
          estados: diseases.reduce((acc, disease) => {
            const key = disease.estado || "sin_estado";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          requiereV5: staleWheat,
          requiereVersionActual: staleWheat || stalePea,
        },
        agromet: {
          disponible: Boolean(agromet),
          fecha: agromet?.fecha,
          antiguedadDias: daysSince(agromet?.fecha),
          completitudPct: agromet?.completitudPct,
          fuente: agromet?.fuente,
          horizontePronostico: agrometForecast?.fecha,
        },
        riego: {
          disponible: Boolean(irrigation),
          fecha: irrigation?.fechaPrediccion,
          antiguedadDias: daysSince(irrigation?.fechaPrediccion),
        },
        satelite: {
          disponible: Boolean(ndvi),
          fechaImagen: ndvi?.fechaDeLaImagen,
          antiguedadDias: daysSince(ndvi?.fechaDeLaImagen),
        },
        suelo: { disponible: soilLots.has(asString(lot._id)) },
      };
    });

    const byCrop = {};
    for (const row of matrix) {
      const crop = (byCrop[row.cultivo] ||= {
        lotes: 0,
        sanidadDisponible: 0,
        sanidadCompleta: 0,
        sanidadConLectura: 0,
        sanidadProvisional: 0,
        sanidadV5Pendiente: 0,
        agrometDisponible: 0,
        riegoDisponible: 0,
        sateliteDisponible: 0,
        sueloDisponible: 0,
      });
      crop.lotes += 1;
      if (row.sanidad.fecha) crop.sanidadDisponible += 1;
      if (row.sanidad.aplica && row.sanidad.matrizCompleta) {
        crop.sanidadCompleta += 1;
      }
      if (row.sanidad.aplica && row.sanidad.lecturaInterpretable) {
        crop.sanidadConLectura += 1;
      }
      if (row.sanidad.aplica && row.sanidad.cantidadProvisional > 0) {
        crop.sanidadProvisional += 1;
      }
      if (row.sanidad.requiereV5) crop.sanidadV5Pendiente += 1;
      if (row.agromet.disponible) crop.agrometDisponible += 1;
      if (row.riego.disponible) crop.riegoDisponible += 1;
      if (row.satelite.disponible) crop.sateliteDisponible += 1;
      if (row.suelo.disponible) crop.sueloDisponible += 1;
    }

    const roleCoverage = {};
    for (const user of users) {
      for (const permission of user.permisos || []) {
        const key = `${permission.nivel}:${permission.rol}`;
        roleCoverage[key] = (roleCoverage[key] || 0) + 1;
      }
    }

    const findings = {
      critical: matrix.filter(
        (row) =>
          !row.integridad.siembra ||
          !row.integridad.semilla ||
          !row.integridad.tenantConsistente,
      ),
      high: matrix.filter(
        (row) =>
          row.sanidad.aplica &&
          (!row.agromet.disponible ||
            !row.sanidad.fecha ||
            !row.sanidad.matrizCompleta ||
            !row.sanidad.lecturaInterpretable ||
            row.sanidad.fugasResultadoExperimental > 0),
      ),
      medium: matrix.filter(
        (row) =>
          row.sanidad.requiereVersionActual ||
          !row.integridad.coordenadasValidas,
      ),
    };

    const summaryOnly = process.argv.includes("--summary");
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          database: DB_NAME,
          grain: "un registro por lote con siembra activa",
          summary: {
            activeLots: matrix.length,
            activeSowings: sowings.length,
            seedsResolved: seeds.length,
            duplicatePredictionKeys: duplicatePredictions?.total || 0,
            criticalFindings: findings.critical.length,
            highFindings: findings.high.length,
            mediumFindings: findings.medium.length,
          },
          byCrop,
          roleCoverage,
          findings,
          ...(!summaryOnly ? { matrix } : {}),
        },
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
