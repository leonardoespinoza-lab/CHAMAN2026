const { MongoClient } = require("../sdc-datos/node_modules/mongodb");

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "chaman";
const DRY_RUN = process.env.CHAMAN_WEEDS_DRY_RUN === "true";
const EXTENSIVE_WEED_CROPS = ["Soja", "Maiz", "Trigo"];

const WEEDS = [
  {
    codigoCarga: "GOMPERTZ|AMARANTHUS|UNC",
    fuenteBase: "Gompertz_horario - UNC AMARANTHUS.xlsx",
    nombre: "Yuyo colorado",
    nombreCientifico: "Amaranthus spp.",
    cultivosObjetivo: EXTENSIVE_WEED_CROPS,
    modelo: "Gompertz HTT",
    parametros: {
      kMaxPorcentaje: 100,
      beta: 0.0005,
      muHorasTermicas: 9700,
      temperaturaBase: 13.2,
      humedadTheta50: 0.2,
      humedadEscala: 0.03,
      deltaHoras: 24,
    },
    umbrales: [
      {
        porcentaje: 10,
        horasTermicas: 8031.93511,
        fechaEstimadaReferencia: "2023-11-17",
        fechaRealReferencia: "2023-11-19",
      },
      {
        porcentaje: 50,
        horasTermicas: 10433.025841,
        fechaEstimadaReferencia: "2023-12-02",
        fechaRealReferencia: "2023-12-03",
      },
      {
        porcentaje: 90,
        horasTermicas: 14200.734655,
        fechaEstimadaReferencia: "2023-12-23",
        fechaRealReferencia: "2023-12-21",
      },
    ],
    recomendaciones: [
      {
        momento: "Pre-emergencia",
        accion:
          "Mantener suelo cubierto y revisar residualidad del herbicida elegido.",
        detalle:
          "Priorizar lotes con historial de escapes y nacimientos escalonados.",
      },
      {
        momento: "E10 a E50",
        accion: "Ventana de control temprano.",
        detalle:
          "Entrar al lote y validar nacimientos antes de que las plantas superen tamano operativo.",
      },
      {
        momento: "E50 a E90",
        accion: "Riesgo de escapes.",
        detalle:
          "Revisar rotacion de modos de accion y planificar repaso solo con recomendacion tecnica.",
      },
    ],
    observaciones:
      "Modelo calibrado desde Excel UNC. Requiere temperatura y humedad de suelo para correr como prediccion real.",
  },
  {
    codigoCarga: "GOMPERTZ|ELEUSINE|UNC",
    fuenteBase: "Gompertz_horario - UNC ELEUSINE.xlsx",
    nombre: "Pata de gallina",
    nombreCientifico: "Eleusine indica",
    cultivosObjetivo: EXTENSIVE_WEED_CROPS,
    modelo: "Gompertz HTT",
    parametros: {
      kMaxPorcentaje: 100,
      beta: 0.0006,
      muHorasTermicas: 8750,
      temperaturaBase: 14,
      humedadTheta50: 0.25,
      humedadEscala: 0.035,
      deltaHoras: 24,
    },
    umbrales: [
      {
        porcentaje: 10,
        horasTermicas: 7359.945925,
        fechaEstimadaReferencia: "2023-11-23",
        fechaRealReferencia: "2023-11-23",
      },
      {
        porcentaje: 50,
        horasTermicas: 9360.854868,
        fechaEstimadaReferencia: "2023-12-07",
        fechaRealReferencia: "2023-12-08",
      },
      {
        porcentaje: 90,
        horasTermicas: 12500.612212,
        fechaEstimadaReferencia: "2023-12-24",
        fechaRealReferencia: "2024-01-10",
      },
    ],
    recomendaciones: [
      {
        momento: "Pre-emergencia",
        accion: "Revisar nacimientos por camada y cobertura del entresurco.",
        detalle:
          "La emergencia puede acelerarse con suelo caliente y humedad disponible.",
      },
      {
        momento: "E10 a E50",
        accion: "Ventana de monitoreo y control temprano.",
        detalle: "Validar escapes en bordes, huellas y zonas compactadas.",
      },
      {
        momento: "E50 a E90",
        accion: "Alta probabilidad de nacimientos acumulados.",
        detalle:
          "Evitar tratamientos tardios sin diagnostico de tamano, densidad y modo de accion.",
      },
    ],
    observaciones:
      "Modelo calibrado desde Excel UNC. Requiere temperatura y humedad de suelo para correr como prediccion real.",
  },
];

function buildOps() {
  return WEEDS.map((doc) => ({
    updateOne: {
      filter: { codigoCarga: doc.codigoCarga },
      update: { $set: doc },
      upsert: true,
    },
  }));
}

async function main() {
  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          malezas: WEEDS.length,
          samples: WEEDS,
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = await MongoClient.connect(DB_URL);
  const db = client.db(DB_NAME);

  try {
    const result = await db.collection("malezas").bulkWrite(buildOps(), {
      ordered: false,
    });
    const count = await db.collection("malezas").countDocuments();

    console.log(
      JSON.stringify(
        {
          ok: true,
          imported: WEEDS.length,
          result: {
            upserted: result.upsertedCount,
            modified: result.modifiedCount,
            matched: result.matchedCount,
          },
          count,
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
  console.error(error);
  process.exit(1);
});
