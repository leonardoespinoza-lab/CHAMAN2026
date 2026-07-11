const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'chaman_testing';

const IDS = {
  provincia: new ObjectId('700000000000000000000001'),
  departamento: new ObjectId('700000000000000000000002'),
};

const semillas = [
  {
    codigoCarga: 'TESTING|TRIGO|REFERENCIA|2025-2026',
    fuenteBase: 'Catalogo sintetico exclusivo del entorno testing',
    semillero: 'CHAMAN TESTING',
    cultivo: 'Trigo',
    variedad: 'TRIGO REFERENCIA',
    ciclo: 'LARGO',
    campania: '2025-2026',
    tipoCultivo: 'Anual',
    resistencia: [
      ['trigo.roya_hoja', 'Roya de la Hoja', 'MR', 0.5],
      ['trigo.roya_tallo', 'Roya del Tallo', 'MR', 0.5],
      ['trigo.roya_anaranjada', 'Roya Anaranjada', 'MR', 0.5],
      ['trigo.mancha_amarilla', 'Mancha Amarilla', 'MS', 0.75],
      ['trigo.mancha_hoja', 'Mancha de la Hoja', 'DESCONOCIDA', 1],
      ['trigo.fusarium_espiga', 'Fusarium de la Espiga', 'MS', 0.75],
    ].map(([idEnfermedad, enfermedad, perfil, multiplicador]) => ({
      idEnfermedad,
      enfermedad,
      perfil,
      multiplicador,
      estado: perfil === 'DESCONOCIDA' ? 'desconocida' : 'inferida',
      confianza: perfil === 'DESCONOCIDA' ? 'sin_datos' : 'media',
      fuente: 'Perfil sintetico para pruebas funcionales; no usar como recomendacion agronomica.',
      campaniaFuente: '2025-2026',
    })),
  },
  {
    codigoCarga: 'TESTING|SOJA|REFERENCIA|2025-2026',
    fuenteBase: 'Catalogo sintetico exclusivo del entorno testing',
    semillero: 'CHAMAN TESTING',
    cultivo: 'Soja',
    variedad: 'SOJA REFERENCIA',
    ciclo: 'IV LARGO',
    campania: '2025-2026',
    tipoCultivo: 'Anual',
    resistencia: [
      {
        idEnfermedad: 'soja.fin_ciclo',
        enfermedad: 'Fin de Ciclo',
        perfil: 'DESCONOCIDA',
        multiplicador: 1,
        estado: 'desconocida',
        confianza: 'sin_datos',
        fuente: 'Perfil sintetico para pruebas funcionales; no usar como recomendacion agronomica.',
        campaniaFuente: '2025-2026',
      },
    ],
  },
  {
    codigoCarga: 'TESTING|MAIZ|REFERENCIA|2025-2026',
    fuenteBase: 'Catalogo sintetico exclusivo del entorno testing',
    semillero: 'CHAMAN TESTING',
    cultivo: 'Maiz',
    variedad: 'MAIZ REFERENCIA',
    ciclo: 'INTERMEDIO',
    campania: '2025-2026',
    tipoCultivo: 'Anual',
    resistencia: [
      {
        idEnfermedad: 'maiz.roya',
        enfermedad: 'Roya del Maiz',
        perfil: 'MR',
        multiplicador: 0.5,
        estado: 'inferida',
        confianza: 'media',
        fuente: 'Perfil sintetico para pruebas funcionales; no usar como recomendacion agronomica.',
        campaniaFuente: '2025-2026',
      },
      {
        idEnfermedad: 'maiz.tizon_foliar',
        enfermedad: 'Tizon Foliar del Maiz',
        perfil: 'DESCONOCIDA',
        multiplicador: 1,
        estado: 'desconocida',
        confianza: 'sin_datos',
        fuente: 'Perfil sintetico para pruebas funcionales; no usar como recomendacion agronomica.',
        campaniaFuente: '2025-2026',
      },
    ],
  },
];

const cronos = [
  {
    cultivo: 'Trigo',
    ciclo: 'LARGO',
    mesSiembra: 7,
    diaSiembra: 1,
    etapas: { R0_R1: 12, R1_R2: 65, R2_R3: 18, R3_R4: 14, R4_R5: 5, R5_R6: 18, R6_R7: 25 },
  },
  {
    cultivo: 'Soja',
    ciclo: 'IV LARGO',
    mesSiembra: 11,
    diaSiembra: 15,
    etapas: { siembra_emergencia: 8, emergencia_R1: 35, R1_R3: 18, R3_R5: 28, R5_R7: 38 },
  },
  {
    cultivo: 'Maiz',
    ciclo: 'INTERMEDIO',
    mesSiembra: 9,
    diaSiembra: 20,
    etapas: { siembra_emergencia: 8, emergencia_floracion: 65, floracion_madurez: 55 },
  },
].map((crono) => ({ ...crono, idDepartamento: IDS.departamento }));

async function main() {
  if (!DB_URL) throw new Error('Falta MONGO_URI/MONGO_URL/DATABASE_URL para seed de testing.');
  if (process.env.CHAMAN_TESTING_BOOTSTRAP !== 'true') {
    throw new Error('seed-testing-base.js solo puede ejecutarse con CHAMAN_TESTING_BOOTSTRAP=true.');
  }

  const client = await MongoClient.connect(DB_URL);
  try {
    const db = client.db(DB_NAME);
    await db.collection('provincias').updateOne(
      { _id: IDS.provincia },
      { $set: { nombre: 'BUENOS AIRES' } },
      { upsert: true },
    );
    await db.collection('departamentos').updateOne(
      { _id: IDS.departamento },
      { $set: { nombre: 'PERGAMINO', idProvincia: IDS.provincia } },
      { upsert: true },
    );

    for (const semilla of semillas) {
      await db.collection('semillas').updateOne(
        {
          cultivo: semilla.cultivo,
          semillero: semilla.semillero,
          variedad: semilla.variedad,
          ciclo: semilla.ciclo,
          campania: semilla.campania,
        },
        { $set: semilla },
        { upsert: true },
      );
    }
    for (const crono of cronos) {
      await db.collection('cronos').updateOne(
        {
          cultivo: crono.cultivo,
          idDepartamento: crono.idDepartamento,
          ciclo: crono.ciclo,
          mesSiembra: crono.mesSiembra,
          diaSiembra: crono.diaSiembra,
        },
        { $set: crono },
        { upsert: true },
      );
    }
    console.log(JSON.stringify({
      ok: true,
      entorno: 'testing',
      provincias: 1,
      departamentos: 1,
      semillas: semillas.length,
      cronos: cronos.length,
    }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
