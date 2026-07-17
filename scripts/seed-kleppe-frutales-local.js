const { MongoClient, ObjectId } = require('../sdc-datos/node_modules/mongodb');

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const DRY_RUN = !process.argv.includes('--apply');

const SOURCE = 'kleppe-alto-valle-2026';
const SEMILLERO = 'Kleppe Alto Valle';
const CAMPANIA = 'Perenne';

const STAGES = {
  Manzano: {
    Reposo_invernal: 0,
    Yema_hinchada: 35,
    Brotacion: 18,
    Floracion: 18,
    Cuaje: 15,
    Desarrollo_de_fruto: 95,
    Madurez: 35,
    Cosecha: 20,
    Reposo_invernal_siguiente: 129,
  },
  Peral: {
    Reposo_invernal: 0,
    Yema_hinchada: 32,
    Brotacion: 16,
    Floracion: 16,
    Cuaje: 14,
    Desarrollo_de_fruto: 90,
    Madurez: 30,
    Cosecha: 20,
    Reposo_invernal_siguiente: 137,
  },
};

const VARIEDADES = [
  {
    establecimiento: 'LA COSTA',
    lote: 'CUADRO 7',
    cultivo: 'Manzano',
    variedad: 'Rosy Glow',
    portainjerto: 'EM-04',
    requerimientoFrio: { horasFrio: 700, horasFrioEfectivas: 600, porcionesFrio: 42 },
    fenologia: {
      brotacion: 'Septiembre; registrar fecha real por cuadro.',
      floracion: 'Octubre; ajustar con frio acumulado y temperatura.',
      cosecha: 'Fines de marzo/abril en Alto Valle, segun color y destino.',
    },
    resistencia: [
      { enfermedad: 'Sarna del Manzano', multiplicador: 1 },
      { enfermedad: 'Oidio del Manzano', multiplicador: 1 },
      { enfermedad: 'Fuego Bacteriano', multiplicador: 1.1 },
      { enfermedad: 'Carpocapsa', multiplicador: 1 },
    ],
    observaciones:
      'Rosy Glow es una mutacion de color de Cripps Pink/Pink Lady. Perfil inicial Alto Valle: cosecha tardia, demanda buena exposicion/color, vigilar golpe de sol, calcio y carga. Pie EM-04: vigor medio-alto/semi-vigoroso; validar estructura, riego y carga con asesor. Requerimientos HF/HFE/CP editables.',
  },
  {
    establecimiento: 'LA COSTA',
    lote: 'CUADRO 17',
    cultivo: 'Manzano',
    variedad: 'Red King Oregon',
    portainjerto: 'franco',
    requerimientoFrio: { horasFrio: 850, horasFrioEfectivas: 720, porcionesFrio: 52 },
    fenologia: {
      brotacion: 'Septiembre; registrar fecha real por cuadro.',
      floracion: 'Septiembre/octubre.',
      cosecha: 'Marzo; ajustar por color, firmeza y destino comercial.',
    },
    resistencia: [
      { enfermedad: 'Sarna del Manzano', multiplicador: 1 },
      { enfermedad: 'Oidio del Manzano', multiplicador: 1 },
      { enfermedad: 'Fuego Bacteriano', multiplicador: 1.05 },
      { enfermedad: 'Carpocapsa', multiplicador: 1 },
    ],
    observaciones:
      'Red King Oregon se maneja como grupo Red Delicious/Oregon. Perfil inicial: requerimiento de frio medio-alto/alto, buena coloracion roja, vigilar alternancia, calibre, sarna, oidio y carpocapsa. Pie franco: vigor alto, mayor longevidad y entrada productiva mas lenta; ajustar poda y carga.',
  },
  {
    establecimiento: 'LA CAROLINA',
    lote: 'CUADRO 7',
    cultivo: 'Peral',
    variedad: 'Rocha',
    portainjerto: 'BA29',
    requerimientoFrio: { horasFrio: 750, horasFrioEfectivas: 630, porcionesFrio: 45 },
    fenologia: {
      brotacion: 'Septiembre; registrar fecha real por cuadro.',
      floracion: 'Primavera temprana; monitorear heladas.',
      cosecha: 'Febrero/marzo, ajustar por presion y destino.',
    },
    resistencia: [
      { enfermedad: 'Sarna del Peral', multiplicador: 1 },
      { enfermedad: 'Fuego Bacteriano', multiplicador: 1.1 },
      { enfermedad: 'Psila del Peral', multiplicador: 1 },
    ],
    observaciones:
      'Rocha: pera europea con perfil inicial de frio medio-alto. Vigilar floracion, heladas, sarna, fuego bacteriano y psila. BA29: membrillero de vigor medio, precoz y productivo; validar afinidad, clorosis/caliza, anclaje y manejo de riego.',
  },
  {
    establecimiento: 'EL MIRASOL',
    lote: 'CUADRO 3',
    cultivo: 'Peral',
    variedad: 'Williams',
    portainjerto: 'franco',
    requerimientoFrio: { horasFrio: 800, horasFrioEfectivas: 680, porcionesFrio: 48 },
    fenologia: {
      brotacion: 'Septiembre; registrar fecha real por cuadro.',
      floracion: 'Primavera temprana; monitorear heladas.',
      cosecha: 'Enero/febrero en Alto Valle, ajustar por madurez.',
    },
    resistencia: [
      { enfermedad: 'Sarna del Peral', multiplicador: 1 },
      { enfermedad: 'Fuego Bacteriano', multiplicador: 1.2 },
      { enfermedad: 'Psila del Peral', multiplicador: 1 },
    ],
    observaciones:
      'Williams/Bartlett: variedad temprana, muy difundida, sensible a fuego bacteriano y con manejo estricto de madurez. Pie franco: vigor alto, buena exploracion radical y longevidad; entrada en produccion mas lenta que membrillero. Requerimientos editables para calibracion local.',
  },
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cycleFor(portainjerto) {
  return normalize(portainjerto || 'GENERAL').replace(/\s+/g, '-');
}

function stableKey(...parts) {
  return parts.map((part) => normalize(part).replace(/\s+/g, '-')).join(':').toLowerCase();
}

function toObjectId(value) {
  if (!value) return undefined;
  if (value instanceof ObjectId) return value;
  return new ObjectId(String(value));
}

function asId(value) {
  return value ? String(value) : '';
}

function buildSemillaDoc(item) {
  const ciclo = cycleFor(item.portainjerto);
  return {
    codigoCarga: stableKey(SOURCE, item.cultivo, item.variedad, ciclo),
    fuenteBase: 'Base Chaman Kleppe Alto Valle - perfil inicial editable',
    semillero: SEMILLERO,
    cultivo: item.cultivo,
    variedad: item.variedad,
    ciclo,
    resistencia: item.resistencia,
    campania: CAMPANIA,
    tipoCultivo: 'Perenne',
    portainjerto: item.portainjerto,
    requerimientoFrio: {
      ...item.requerimientoFrio,
      modelo: 'HF + Dynamic Model',
      modeloRector: item.requerimientoFrio.porcionesFrio ? 'CP' : 'HF',
      estado: 'requiere_calibracion',
      fuente: 'Base Chaman Kleppe Alto Valle - perfil inicial editable',
      confianza: 'estimada',
      observaciones:
        'Objetivos iniciales sujetos a validacion local. HFE se conserva solo como dato legacy; no gobierna decisiones ni se convierte a CP.',
    },
    fenologiaReferencia: {
      ...item.fenologia,
      editable: true,
      etapas: STAGES[item.cultivo],
    },
    observaciones: item.observaciones,
  };
}

function buildCronoDoc(semilla) {
  return {
    cultivo: semilla.cultivo,
    ciclo: semilla.ciclo,
    etapas: STAGES[semilla.cultivo],
  };
}

function matchesEstablecimiento(establecimiento, esperado) {
  const actual = normalize(establecimiento?.nombre);
  const target = normalize(esperado);
  return actual === target || actual.includes(target) || actual.includes(`CHACRA ${target}`);
}

function matchesLote(lote, item) {
  const actual = normalize(lote?.nombre);
  const target = normalize(item.lote);
  const est = normalize(item.establecimiento);
  return actual === target || actual.includes(target) || (actual.includes(target) && actual.includes(est));
}

async function findTarget(db, item) {
  const establecimientos = await db.collection('establecimientos').find({}).toArray();
  const candidatosEst = establecimientos.filter((est) => matchesEstablecimiento(est, item.establecimiento));

  const lotes = await db.collection('lotes').find({}).toArray();
  const candidatosLote = lotes.filter((lote) => {
    if (!matchesLote(lote, item)) return false;
    if (!candidatosEst.length) return normalize(lote.nombre).includes(normalize(item.establecimiento));
    return candidatosEst.some((est) => asId(lote.idEstablecimiento) === asId(est._id));
  });

  if (candidatosLote.length !== 1) {
    return {
      error: `Se esperaban 1 lote para ${item.establecimiento} / ${item.lote}, encontrados ${candidatosLote.length}`,
      candidatos: candidatosLote.map((lote) => ({ id: lote._id, nombre: lote.nombre })),
    };
  }

  const lote = candidatosLote[0];
  const establecimiento =
    candidatosEst.find((est) => asId(est._id) === asId(lote.idEstablecimiento)) ||
    establecimientos.find((est) => asId(est._id) === asId(lote.idEstablecimiento));

  return { lote, establecimiento };
}

async function upsertSemilla(db, item) {
  const doc = buildSemillaDoc(item);
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

async function upsertPlantacion(db, target, semilla, crono) {
  const { lote, establecimiento } = target;
  const existing = lote.idSiembra
    ? await db.collection('siembras').findOne({ _id: toObjectId(lote.idSiembra) })
    : await db.collection('siembras').findOne({ idLote: lote._id, activa: true });

  const doc = {
    idQuimica: lote.idQuimica || establecimiento?.idQuimica,
    idDistribuidor: lote.idDistribuidor || establecimiento?.idDistribuidor,
    idProductor: lote.idProductor || establecimiento?.idProductor,
    idEstablecimiento: lote.idEstablecimiento || establecimiento?._id,
    idLote: lote._id,
    idDepartamento: lote.idDepartamento,
    idSemilla: semilla._id,
    idCrono: crono._id,
    fechaSiembra: existing?.fechaSiembra || new Date(`${new Date().getFullYear()}-01-01T00:00:00.000Z`),
    activa: true,
    coordenadas: lote.ubicacion?.centro,
    geojson: lote.ubicacion?.geojson,
  };

  const result = await db.collection('siembras').findOneAndUpdate(
    existing ? { _id: existing._id } : { idLote: lote._id, activa: true },
    { $set: doc },
    { upsert: true, returnDocument: 'after' },
  );
  const siembra = result.value || result;

  await db.collection('lotes').updateOne(
    { _id: lote._id },
    { $set: { idSiembra: siembra._id } },
  );

  return { siembra, existing: !!existing };
}

function safeSummary(data) {
  return JSON.stringify(data, null, 2).replace(/[a-f0-9]{24,}/gi, (value) =>
    value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value,
  );
}

async function main() {
  const mongo = await MongoClient.connect(DB_URL);
  const db = mongo.db(DB_NAME);
  const summary = {
    ok: true,
    dryRun: DRY_RUN,
    source: SOURCE,
    variedades: [],
    issues: [],
  };

  try {
    for (const item of VARIEDADES) {
      const semillaDoc = buildSemillaDoc(item);
      const target = await findTarget(db, item);
      const row = {
        establecimiento: item.establecimiento,
        lote: item.lote,
        cultivo: item.cultivo,
        variedad: item.variedad,
        portainjerto: item.portainjerto,
        requerimientoFrio: semillaDoc.requerimientoFrio,
      };

      if (target.error) {
        summary.issues.push({ ...row, error: target.error, candidatos: target.candidatos });
        summary.variedades.push({ ...row, accion: 'semilla/crono solamente' });
        continue;
      }

      summary.variedades.push({
        ...row,
        targetLote: target.lote?.nombre,
        targetEstablecimiento: target.establecimiento?.nombre,
        accion: DRY_RUN ? 'validar' : 'actualizar plantacion',
      });
    }

    if (DRY_RUN) {
      console.log(safeSummary(summary));
      return;
    }

    const writes = [];
    for (const item of VARIEDADES) {
      const semilla = await upsertSemilla(db, item);
      const crono = await upsertCrono(db, semilla);
      const target = await findTarget(db, item);
      let plantacion;
      if (!target.error) {
        plantacion = await upsertPlantacion(db, target, semilla, crono);
      }
      writes.push({
        establecimiento: item.establecimiento,
        lote: item.lote,
        semilla: semilla._id,
        crono: crono._id,
        siembra: plantacion?.siembra?._id,
        siembraExistente: plantacion?.existing,
        target: target.error || target.lote?.nombre,
      });
    }

    console.log(
      safeSummary({
        ...summary,
        writes,
      }),
    );
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
