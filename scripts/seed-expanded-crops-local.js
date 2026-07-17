const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { MongoClient } = require('../sdc-datos/node_modules/mongodb');

const DB_URL =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URL ||
  'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'chaman';
const DRY_RUN = ['true', '1'].includes(
  String(process.env.CHAMAN_EXPANDED_CROPS_DRY_RUN || process.env.CHAMAN_DRY_RUN || '').toLowerCase(),
);
const bundledPython = path.join(
  os.homedir(),
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'python',
  process.platform === 'win32' ? 'python.exe' : 'python'
);
const PYTHON =
  process.env.CHAMAN_PYTHON ||
  process.env.PYTHON ||
  (fs.existsSync(bundledPython) ? bundledPython : 'python');

const downloadsDir = path.join(os.homedir(), 'Downloads');

const WORKBOOKS = {
  Peral: process.env.CHAMAN_PERAL_XLSX || path.join(downloadsDir, 'BASE CARGA PERAL.xlsx'),
  Pecan: process.env.CHAMAN_PECAN_XLSX || path.join(downloadsDir, 'CARGA BASE PECAN.xlsx'),
  Papa: process.env.CHAMAN_PAPA_XLSX || path.join(downloadsDir, 'BASE CARGA PAPA.xlsx'),
  Manzano: process.env.CHAMAN_MANZANO_XLSX || path.join(downloadsDir, 'BASE CARGA MANZANO.xlsx'),
  Vid: process.env.CHAMAN_VID_XLSX || path.join(downloadsDir, 'BASE CARGA VID.xlsx'),
};

const CAMPAIGN_BY_CROP = {
  Peral: '2026-2027',
  Pecan: '2026-2027',
  Manzano: '2026-2027',
  Papa: '2025-2026',
  Vid: '2025-2026',
};

const CROP_STAGE_TEMPLATES = {
  Papa: {
    etapas: {
      Plantacion: 0,
      Emergencia: 18,
      Desarrollo_vegetativo: 24,
      Tuberizacion: 28,
      Llenado_de_tuberculos: 38,
      Madurez_y_cosecha: 22,
    },
    fenologiaReferencia: {
      brotacion: 'Emergencia 15-25 dias despues de plantacion',
      floracion: 'Inicio de tuberizacion y floracion segun ambiente',
      cosecha: '90-140 dias segun ciclo y destino',
      editable: true,
    },
  },
  Vid: {
    etapas: {
      Dormancia: 0,
      Brotacion: 28,
      Floracion: 35,
      Cuaje: 18,
      Envero: 55,
      Madurez: 45,
      Cosecha: 20,
    },
    fenologiaReferencia: {
      brotacion: 'Primavera; registrar fecha real por lote',
      floracion: 'Primavera tardia; depende de variedad y zona',
      cosecha: 'Verano/otono segun destino y variedad',
      editable: true,
    },
  },
  Manzano: {
    etapas: {
      Reposo_invernal: 0,
      Yema_hinchada: 35,
      Brotacion: 18,
      Floracion: 18,
      Cuaje: 15,
      Desarrollo_de_fruto: 95,
      Madurez: 35,
      Cosecha: 20,
    },
    fenologiaReferencia: {
      brotacion: 'Septiembre, ajustar por variedad, pie y frio acumulado',
      floracion: 'Septiembre/Octubre',
      cosecha: 'Febrero a abril segun variedad',
      editable: true,
    },
  },
  Peral: {
    etapas: {
      Reposo_invernal: 0,
      Yema_hinchada: 32,
      Brotacion: 16,
      Floracion: 16,
      Cuaje: 14,
      Desarrollo_de_fruto: 90,
      Madurez: 30,
      Cosecha: 20,
    },
    fenologiaReferencia: {
      brotacion: 'Fin de invierno/primavera; registrar fecha real',
      floracion: 'Primavera temprana',
      cosecha: 'Verano, segun variedad y zona',
      editable: true,
    },
  },
  Pecan: {
    etapas: {
      Dormancia: 0,
      Brotacion: 40,
      Floracion: 25,
      Cuaje: 20,
      Llenado_de_nuez: 90,
      Madurez: 45,
      Cosecha: 30,
    },
    fenologiaReferencia: {
      brotacion: 'Primavera; registrar por lote y variedad',
      floracion: 'Primavera, con monitoreo de sincronizacion floral',
      cosecha: 'Otono, segun variedad y ambiente',
      editable: true,
    },
  },
};

const DISEASES = [
  {
    nombre: 'Oidio',
    cultivo: 'Vid',
    formula: 'Monitoreo base: riesgo con brotes activos, HR moderada/alta y temperaturas templadas. Requiere validacion local.',
    etapas: [1, 2, 3, 4],
    tempMin: 15,
    tempMax: 30,
    rocioMin: 60,
    rocioMax: 95,
  },
  {
    nombre: 'Botritis',
    cultivo: 'Vid',
    formula: 'Monitoreo base: riesgo con floracion/cierre de racimo/madurez, mojado prolongado y alta humedad.',
    etapas: [2, 3, 4, 5],
    tempMin: 12,
    tempMax: 25,
    rocioMin: 85,
    rocioMax: 100,
  },
  {
    nombre: 'Mildiu',
    cultivo: 'Vid',
    formula: 'Monitoreo base: riesgo con lluvia, hoja mojada y temperatura templada en canopia activa.',
    etapas: [1, 2, 3, 4],
    tempMin: 11,
    tempMax: 27,
    rocioMin: 80,
    rocioMax: 100,
  },
  {
    nombre: 'Tizon Tardio',
    cultivo: 'Papa',
    formula: 'Monitoreo base: riesgo con HR alta, mojado foliar y temperaturas frescas a templadas.',
    etapas: [1, 2, 3, 4],
    tempMin: 10,
    tempMax: 24,
    rocioMin: 85,
    rocioMax: 100,
  },
  {
    nombre: 'Tizon Temprano',
    cultivo: 'Papa',
    formula: 'Monitoreo base: riesgo con estres, alternancia humedad/sequedad y canopeo desarrollado.',
    etapas: [2, 3, 4],
    tempMin: 18,
    tempMax: 30,
    rocioMin: 70,
    rocioMax: 100,
  },
  {
    nombre: 'Rhizoctonia',
    cultivo: 'Papa',
    formula: 'Monitoreo base: riesgo en emergencia/tuberizacion con suelo frio-humedo y antecedentes del lote.',
    etapas: [0, 1, 2, 3],
    tempMin: 8,
    tempMax: 22,
    rocioMin: 70,
    rocioMax: 100,
  },
  {
    nombre: 'Sarna del Manzano',
    cultivo: 'Manzano',
    formula: 'Monitoreo base: riesgo primario con tejido verde susceptible, mojado foliar y temperatura templada.',
    etapas: [1, 2, 3, 4],
    tempMin: 6,
    tempMax: 25,
    rocioMin: 85,
    rocioMax: 100,
  },
  {
    nombre: 'Oidio del Manzano',
    cultivo: 'Manzano',
    formula: 'Monitoreo base: riesgo con brotes activos, clima templado y alta humedad sin lavado intenso.',
    etapas: [2, 3, 4, 5],
    tempMin: 10,
    tempMax: 28,
    rocioMin: 65,
    rocioMax: 95,
  },
  {
    nombre: 'Fuego Bacteriano',
    cultivo: 'Manzano',
    formula: 'Monitoreo base: riesgo en floracion con temperatura templada/calida y humedad o lluvia.',
    etapas: [3, 4],
    tempMin: 16,
    tempMax: 30,
    rocioMin: 70,
    rocioMax: 100,
  },
  {
    nombre: 'Carpocapsa',
    cultivo: 'Manzano',
    formula: 'Monitoreo base: seguir por grados-dia/trampas. No es enfermedad, se registra como plaga sanitaria.',
    etapas: [4, 5, 6],
    tempMin: 10,
    tempMax: 32,
  },
  {
    nombre: 'Sarna del Peral',
    cultivo: 'Peral',
    formula: 'Monitoreo base: riesgo con brotacion/floracion, mojado foliar y temperatura templada.',
    etapas: [1, 2, 3, 4],
    tempMin: 6,
    tempMax: 25,
    rocioMin: 85,
    rocioMax: 100,
  },
  {
    nombre: 'Psila del Peral',
    cultivo: 'Peral',
    formula: 'Monitoreo base por observacion y temperatura. Plaga sanitaria: validar umbrales regionales.',
    etapas: [1, 2, 3, 4, 5],
    tempMin: 10,
    tempMax: 32,
  },
  {
    nombre: 'Fuego Bacteriano',
    cultivo: 'Peral',
    formula: 'Monitoreo base: riesgo en floracion con temperatura templada/calida y humedad o lluvia.',
    etapas: [3, 4],
    tempMin: 16,
    tempMax: 30,
    rocioMin: 70,
    rocioMax: 100,
  },
  {
    nombre: 'Sarna del Pecan',
    cultivo: 'Pecan',
    formula: 'Monitoreo base: riesgo con brotes/frutos jovenes, humedad alta y mojado prolongado.',
    etapas: [1, 2, 3, 4],
    tempMin: 18,
    tempMax: 30,
    rocioMin: 80,
    rocioMax: 100,
  },
  {
    nombre: 'Bacteriosis del Pecan',
    cultivo: 'Pecan',
    formula: 'Monitoreo base: riesgo con heridas, lluvia/viento y humedad sostenida.',
    etapas: [1, 2, 3, 4],
    tempMin: 15,
    tempMax: 30,
    rocioMin: 75,
    rocioMax: 100,
  },
];

const PRINCIPIOS_SANITARIOS = [
  {
    nombre: 'Azufre',
    cultivosObjetivo: ['Vid', 'Manzano'],
    enfermedadesObjetivo: ['Oidio', 'Oidio del Manzano'],
    modoAccion: 'Multisitio / contacto',
    dosisHaSugerida: 'Validar dosis por marbete, temperatura y estado fenologico',
    recomendacionUso: 'Uso orientativo para oidio; evitar condiciones de fitotoxicidad y validar compatibilidad.',
  },
  {
    nombre: 'Cobre',
    cultivosObjetivo: ['Vid', 'Manzano', 'Peral', 'Pecan', 'Papa'],
    enfermedadesObjetivo: ['Mildiu', 'Fuego Bacteriano', 'Bacteriosis del Pecan', 'Tizon Tardio'],
    modoAccion: 'Multisitio / bactericida-fungicida preventivo',
    dosisHaSugerida: 'Segun formulado comercial y marbete',
    recomendacionUso: 'Uso preventivo orientativo; ajustar por sensibilidad varietal, clima y restricciones de etiqueta.',
  },
  {
    nombre: 'Mancozeb',
    cultivosObjetivo: ['Papa', 'Vid', 'Manzano', 'Peral'],
    enfermedadesObjetivo: ['Tizon Tardio', 'Tizon Temprano', 'Mildiu', 'Sarna del Manzano', 'Sarna del Peral'],
    modoAccion: 'Multisitio (FRAC M03)',
    dosisHaSugerida: 'Segun cultivo, formulado y marbete',
    recomendacionUso: 'Preventivo multisitio; revisar carencias, limites regulatorios y destino comercial.',
  },
  {
    nombre: 'Metalaxil-M',
    cultivosObjetivo: ['Papa', 'Vid'],
    enfermedadesObjetivo: ['Tizon Tardio', 'Mildiu'],
    modoAccion: 'Fenilamida (FRAC 4)',
    dosisHaSugerida: 'Segun marbete y estrategia anti-resistencia',
    recomendacionUso: 'Usar en programas con rotacion de modos de accion y riesgo confirmado.',
  },
  {
    nombre: 'Difenoconazole',
    cultivosObjetivo: ['Manzano', 'Peral', 'Papa'],
    enfermedadesObjetivo: ['Sarna del Manzano', 'Sarna del Peral', 'Tizon Temprano'],
    modoAccion: 'Triazol / DMI (FRAC 3)',
    dosisHaSugerida: 'Segun formulado comercial y marbete',
    recomendacionUso: 'Orientativo para programas sanitarios; rotar modos de accion.',
  },
  {
    nombre: 'Captan',
    cultivosObjetivo: ['Manzano', 'Peral'],
    enfermedadesObjetivo: ['Sarna del Manzano', 'Sarna del Peral'],
    modoAccion: 'Multisitio (FRAC M04)',
    dosisHaSugerida: 'Segun marbete',
    recomendacionUso: 'Preventivo orientativo para sarna; revisar compatibilidades y restricciones.',
  },
  {
    nombre: 'Ciprodinil + Fludioxonil',
    cultivosObjetivo: ['Vid', 'Manzano', 'Peral'],
    enfermedadesObjetivo: ['Botritis'],
    modoAccion: 'Anilinopirimidina + fenilpirrol',
    dosisHaSugerida: 'Segun cultivo y marbete',
    recomendacionUso: 'Orientativo para botritis en ventanas criticas con alta humedad.',
  },
  {
    nombre: 'Clorantraniliprol',
    cultivosObjetivo: ['Manzano', 'Peral'],
    enfermedadesObjetivo: ['Carpocapsa'],
    modoAccion: 'Diamida / insecticida',
    dosisHaSugerida: 'Segun marbete y monitoreo de plaga',
    recomendacionUso: 'No aplicar por calendario: validar vuelos/trampas, grados-dia y etiqueta.',
  },
];

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

function stableKey(...parts) {
  return parts
    .map((part) => norm(part).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('|');
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function titleCaseCrop(value) {
  const key = norm(value);
  const map = {
    PERAL: 'Peral',
    PECAN: 'Pecan',
    PAPA: 'Papa',
    MANZANO: 'Manzano',
    VID: 'Vid',
  };
  return map[key] || cleanText(value);
}

function ratingToMultiplier(value) {
  const key = norm(value);
  const map = {
    R: 0.25,
    MR: 0.5,
    MT: 0.5,
    MS: 0.75,
    S: 1.2,
    I: 1,
    ALTA: 0.5,
    MEDIA: 0.85,
    MODERADA: 0.85,
    BAJA: 1.2,
    SUSCEPTIBLE: 1.2,
    SUCEPTIBLE: 1.2,
    TOLERANTE: 0.5,
    RESISTENTE: 0.25,
  };
  return map[key];
}

function ratingToResistanceIndex(rating) {
  const key = norm(rating);
  const map = {
    R: 1,
    MR: 2 / 3,
    MT: 2 / 3,
    MS: 1 / 3,
    S: 0,
    I: 0,
    ALTA: 2 / 3,
    MEDIA: 1 / 3,
    MODERADA: 1 / 3,
    BAJA: 0,
    SUSCEPTIBLE: 0,
    SUCEPTIBLE: 0,
    TOLERANTE: 2 / 3,
    RESISTENTE: 1,
  };
  return map[key];
}

function resistance(enfermedad, idEnfermedad, rating, metadata = {}) {
  const multiplicador = ratingToMultiplier(rating);
  const desconocida = multiplicador === undefined;
  return {
    enfermedad,
    idEnfermedad,
    multiplicador: desconocida ? 1 : multiplicador,
    indiceResistencia: desconocida ? 0 : ratingToResistanceIndex(rating),
    perfil: desconocida ? 'DESCONOCIDA' : norm(rating),
    estado: desconocida ? 'desconocida' : metadata.estado || 'observada',
    confianza: desconocida ? 'sin_datos' : metadata.confianza || 'alta',
    fuente: metadata.fuente,
    campaniaFuente: metadata.campaniaFuente,
    fechaFuente: metadata.fechaFuente,
    observaciones:
      metadata.observaciones ||
      (desconocida
        ? 'La fuente no informa este perfil específico; no equivale a susceptible observado.'
        : undefined),
  };
}

function readWorkbook(crop, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontro el Excel de ${crop}: ${filePath}`);
  }
  const code = `
import json
import math
import pandas as pd

path = r'''${filePath.replace(/\\/g, '\\\\')}'''
xl = pd.ExcelFile(path)
sheet = xl.sheet_names[0]
df = pd.read_excel(path, sheet_name=sheet)
df.columns = [str(c).strip() for c in df.columns]

def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if text.endswith('.0'):
        text = text[:-2]
    return text or None

out = []
for row in df.to_dict(orient='records'):
    cleaned = {str(k).strip(): clean(v) for k, v in row.items()}
    if any(cleaned.values()):
        out.append(cleaned)
print(json.dumps(out))
`;
  const result = spawnSync(PYTHON, ['-c', code], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 1024 * 1024 * 20,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Error leyendo ${filePath}:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function inferResistance(crop, row) {
  const base = {
    fuente: `${path.basename(WORKBOOKS[crop] || 'base no identificada')} / hoja principal`,
    campaniaFuente: cleanText(row.campania) || CAMPAIGN_BY_CROP[crop],
    fechaFuente: '2026-06-11',
  };
  if (crop === 'Vid') {
    return [
      resistance('Oidio', 'vid.oidio', row.OIDIO, base),
      resistance('Botritis', 'vid.botritis', row.BOTRITIS, base),
      resistance('Mildiu', 'vid.mildiu', row.MILDIU, base),
    ];
  }
  if (crop === 'Papa') {
    return [
      resistance('Tizon Tardio', 'papa.tizon_tardio', row.Resistencia_a_P_infestans, base),
      resistance('Rhizoctonia', 'papa.rhizoctonia', row.Resistencia_a_Rhizoctonia_solani, base),
      resistance('Tizon Temprano', 'papa.tizon_temprano', undefined, base),
    ];
  }
  if (crop === 'Manzano') {
    const inferida = {
      ...base,
      estado: 'inferida',
      confianza: 'baja',
      observaciones: 'La columna resistencia es genérica; se conserva como inferencia y no como evidencia específica por enfermedad.',
    };
    return [
      resistance('Sarna del Manzano', 'manzano.sarna', row.resistencia, inferida),
      resistance('Oidio del Manzano', 'manzano.oidio', row.resistencia, inferida),
      resistance('Fuego Bacteriano', 'frutales.fuego_bacteriano', row.resistencia, inferida),
      resistance('Carpocapsa', 'manzano.carpocapsa', undefined, base),
    ];
  }
  if (crop === 'Peral') {
    const inferida = {
      ...base,
      estado: 'inferida',
      confianza: 'baja',
      observaciones: 'La columna resistencia es genérica; se conserva como inferencia y no como evidencia específica por enfermedad.',
    };
    return [
      resistance('Sarna del Peral', 'peral.sarna', row.resistencia, inferida),
      resistance('Fuego Bacteriano', 'frutales.fuego_bacteriano', row.resistencia, inferida),
      resistance('Psila del Peral', 'peral.psila', undefined, base),
    ];
  }
  if (crop === 'Pecan') {
    const inferida = {
      ...base,
      estado: 'inferida',
      confianza: 'baja',
      observaciones: 'La columna resistencia es genérica; se conserva como inferencia y no como evidencia específica por enfermedad.',
    };
    return [
      resistance('Sarna del Pecan', 'pecan.sarna', row.resistencia, inferida),
      resistance('Bacteriosis del Pecan', 'pecan.bacteriosis', row.resistencia, inferida),
    ];
  }
  return [];
}

function seedFromRow(expectedCrop, row) {
  const crop = titleCaseCrop(row.cultivo || expectedCrop);
  const ciclo = cleanText(row.ciclo) || 'GENERAL';
  const template = CROP_STAGE_TEMPLATES[crop] || {};
  const tipoCultivo = ['Vid', 'Peral', 'Pecan', 'Manzano'].includes(crop) ? 'Perenne' : 'Anual';
  const frio = numberOrUndefined(row.ciclo);
  const semillero = cleanText(row.semillero) || 'Base Chaman';
  const variedad = cleanText(row.variedad);

  if (!crop || !variedad) return undefined;

  return {
    codigoCarga: stableKey('CHAMAN2026', crop, semillero, variedad, ciclo, row.campania || CAMPAIGN_BY_CROP[crop]),
    fuenteBase: 'CHAMAN2026 cultivos ampliados',
    semillero,
    cultivo: crop,
    variedad,
    ciclo: norm(ciclo),
    campania: cleanText(row.campania) || CAMPAIGN_BY_CROP[crop],
    resistencia: inferResistance(crop, row),
    tipoCultivo,
    requerimientoFrio:
      tipoCultivo === 'Perenne'
        ? {
            horasFrio: frio,
            modelo: 'HF + Dynamic Model',
            modeloRector: 'sin_calibrar',
            estado: 'requiere_calibracion',
            fuente: `${path.basename(WORKBOOKS[crop] || '')}: columna ciclo`,
            confianza: 'estimada',
            observaciones:
              crop === 'Pecan'
                ? 'El valor numerico original es atipico para HF de pecan y no se usa como requisito rector hasta validar su unidad y fuente varietal. CP solo se calcula con el Dynamic Model horario.'
                : 'HF declarado en la base original. HFE no se deriva y CP solo se calcula con el Dynamic Model horario; validar fuente y unidad antes de usarlo como requisito rector.',
          }
        : undefined,
    fenologiaReferencia: template.fenologiaReferencia,
    observaciones:
      tipoCultivo === 'Perenne'
        ? 'Base inicial editable por tecnico; ajustar por zona, edad de planta, pie y manejo.'
        : 'Base inicial editable por tecnico; ajustar por destino, zona y manejo.',
  };
}

function buildSeeds() {
  const seeds = [];
  for (const [crop, filePath] of Object.entries(WORKBOOKS)) {
    const rows = readWorkbook(crop, filePath);
    for (const row of rows) {
      const seed = seedFromRow(crop, row);
      if (seed) seeds.push(seed);
    }
  }

  const unique = new Map();
  for (const seed of seeds) {
    const key = [seed.cultivo, norm(seed.semillero), norm(seed.variedad), norm(seed.ciclo), seed.campania].join('|');
    unique.set(key, seed);
  }
  return [...unique.values()];
}

function buildCronos(seeds) {
  const cyclesByCrop = new Map();
  for (const seed of seeds) {
    const key = `${seed.cultivo}|${seed.ciclo}`;
    if (!cyclesByCrop.has(key)) {
      cyclesByCrop.set(key, {
        cultivo: seed.cultivo,
        ciclo: seed.ciclo,
        diaSiembra: seed.cultivo === 'Papa' ? 1 : undefined,
        mesSiembra: seed.cultivo === 'Papa' ? 9 : undefined,
        etapas: CROP_STAGE_TEMPLATES[seed.cultivo]?.etapas || {},
      });
    }
  }
  return [...cyclesByCrop.values()].filter((crono) => Object.keys(crono.etapas).length);
}

function buildSeedOps(seeds) {
  return seeds.map((doc) => ({
    updateOne: {
      // Debe coincidir con el indice unico real. `codigoCarga` pudo cambiar
      // entre versiones del importador y no es una identidad suficiente.
      filter: {
        cultivo: doc.cultivo,
        semillero: doc.semillero,
        variedad: doc.variedad,
        ciclo: doc.ciclo,
        campania: doc.campania,
      },
      update: { $set: doc },
      upsert: true,
    },
  }));
}

function buildCronoOps(cronos) {
  return cronos.map((doc) => ({
    updateOne: {
      filter: {
        cultivo: doc.cultivo,
        ciclo: doc.ciclo,
        idDepartamento: { $exists: false },
      },
      update: { $set: doc, $unset: { idDepartamento: '' } },
      upsert: true,
    },
  }));
}

function buildDiseaseOps() {
  return DISEASES.map((doc) => ({
    updateOne: {
      filter: { nombre: doc.nombre, cultivo: doc.cultivo },
      update: { $set: doc },
      upsert: true,
    },
  }));
}

function buildAgrochemicalOps() {
  return PRINCIPIOS_SANITARIOS.map((doc) => ({
    updateOne: {
      filter: { nombre: doc.nombre },
      update: {
        $set: {
          ...doc,
          segmento: 'Agroquimico',
          subsegmentos: ['Base sanitaria ampliada'],
          fuente: 'CHAMAN2026 base ampliada de cultivos; validar marbete y registro antes de aplicar.',
          fuentePrescripcion: 'Matriz inicial CHAMAN2026. Uso orientativo sujeto a validacion de marbete, cultivo, plaga/enfermedad, zona y asesor tecnico.',
        },
      },
      upsert: true,
    },
  }));
}

async function main() {
  const seeds = buildSeeds();
  const cronos = buildCronos(seeds);

  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          workbooks: WORKBOOKS,
          seeds: seeds.length,
          cronos: cronos.length,
          diseases: DISEASES.length,
          agrochemicals: PRINCIPIOS_SANITARIOS.length,
          seedsByCrop: seeds.reduce((acc, seed) => {
            acc[seed.cultivo] = (acc[seed.cultivo] || 0) + 1;
            return acc;
          }, {}),
          samples: seeds.slice(0, 8),
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
    const semillasRes = await db.collection('semillas').bulkWrite(buildSeedOps(seeds), { ordered: false });
    const cronosRes = await db.collection('cronos').bulkWrite(buildCronoOps(cronos), { ordered: false });
    const enfermedadesRes = await db.collection('enfermedads').bulkWrite(buildDiseaseOps(), { ordered: false });
    const agroquimicosRes = await db.collection('agroquimicos').bulkWrite(buildAgrochemicalOps(), { ordered: false });

    const counts = {
      semillas: await db.collection('semillas').countDocuments(),
      cronos: await db.collection('cronos').countDocuments(),
      enfermedads: await db.collection('enfermedads').countDocuments(),
      agroquimicos: await db.collection('agroquimicos').countDocuments(),
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          imported: {
            semillas: seeds.length,
            cronos: cronos.length,
            enfermedades: DISEASES.length,
            agroquimicos: PRINCIPIOS_SANITARIOS.length,
          },
          results: {
            semillas: {
              upserted: semillasRes.upsertedCount,
              modified: semillasRes.modifiedCount,
              matched: semillasRes.matchedCount,
            },
            cronos: {
              upserted: cronosRes.upsertedCount,
              modified: cronosRes.modifiedCount,
              matched: cronosRes.matchedCount,
            },
            enfermedades: {
              upserted: enfermedadesRes.upsertedCount,
              modified: enfermedadesRes.modifiedCount,
              matched: enfermedadesRes.matchedCount,
            },
            agroquimicos: {
              upserted: agroquimicosRes.upsertedCount,
              modified: agroquimicosRes.modifiedCount,
              matched: agroquimicosRes.matchedCount,
            },
          },
          counts,
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
