import { IReporte, SensoresV2 } from 'modelos/src';

export interface MedicionSensorProfundidad {
  actual: number;
  unidad: string;
  crudo?: number;
  unidadCruda?: string;
  nota?: string;
}

export interface MedicionProfundidad {
  profundidad: number;
  humedad?: MedicionSensorProfundidad;
  salinidad?: MedicionSensorProfundidad;
  temperatura?: MedicionSensorProfundidad;
}

const SENSOR_KEY: Record<'humedad' | 'salinidad' | 'temperatura', SensoresV2> = {
  humedad: 'Humedad Suelo Profundidad',
  salinidad: 'Salinidad Suelo',
  temperatura: 'Temperatura Suelo',
};

const SENTEK_RAW_HUMIDITY_MAX = 3;
const SENTEK_SCALED_HUMIDITY_MAX = 300;

function getMetricByDepth(
  reporte: IReporte | undefined,
  sensor: SensoresV2,
  normalizer?: (value: number, unidad: string) => MedicionSensorProfundidad,
): Map<number, MedicionSensorProfundidad> {
  const result = new Map<number, MedicionSensorProfundidad>();
  const rows = reporte?.datos?.valores?.[sensor];

  if (!Array.isArray(rows)) {
    return result;
  }

  rows.forEach((row) => {
    const depth = row.profundidad;
    const value = row.valores?.actual;
    if (depth === undefined || value === undefined || value === null || !row.unidad) {
      return;
    }

    result.set(
      depth,
      normalizer
        ? normalizer(value, row.unidad)
        : {
            actual: value,
            unidad: row.unidad,
          },
    );
  });

  return result;
}

export function buildSentekProfile(reporte: IReporte | undefined): MedicionProfundidad[] {
  const humedad = getMetricByDepth(reporte, SENSOR_KEY.humedad, normalizarHumedad);
  const salinidad = getMetricByDepth(reporte, SENSOR_KEY.salinidad, normalizarSalinidad);
  const temperatura = getMetricByDepth(reporte, SENSOR_KEY.temperatura, normalizarTemperatura);
  const depths = [...new Set([...humedad.keys(), ...salinidad.keys(), ...temperatura.keys()])].sort((a, b) => a - b);

  return depths.map((profundidad) => ({
    profundidad,
    humedad: humedad.get(profundidad),
    salinidad: salinidad.get(profundidad),
    temperatura: temperatura.get(profundidad),
  }));
}

function normalizarHumedad(value: number, unidad: string): MedicionSensorProfundidad {
  const unidadNormalizada = unidad.toLowerCase().replace(/\s/g, '');
  const esPorcentaje = unidadNormalizada.includes('%');
  const esVolumetrica = unidadNormalizada.includes('m3/m3') || unidadNormalizada.includes('vwc');
  let actual = value;
  let nota: string | undefined;

  if (value > 100 && value <= SENTEK_SCALED_HUMIDITY_MAX) {
    actual = (value / SENTEK_SCALED_HUMIDITY_MAX) * 100;
    nota = 'Lectura Sentek normalizada con escala cruda 0-300.';
  } else if (esPorcentaje) {
    actual = value;
  } else if (esVolumetrica && value >= 0 && value <= 1) {
    actual = value * 100;
  } else if (value >= 0 && value <= SENTEK_RAW_HUMIDITY_MAX) {
    actual = (value / SENTEK_RAW_HUMIDITY_MAX) * 100;
    nota = 'Lectura Sentek normalizada con escala cruda 0-3.';
  } else if (value > SENTEK_SCALED_HUMIDITY_MAX && value <= 1000) {
    actual = value / 10;
    nota = 'Lectura Sentek normalizada desde valor x10.';
  }

  return {
    actual: redondear(limitar(actual, 0, 100), 1),
    unidad: '%',
    crudo: value,
    unidadCruda: unidad,
    nota,
  };
}

function normalizarTemperatura(value: number, unidad: string): MedicionSensorProfundidad {
  let actual = value;
  let nota: string | undefined;

  if (Math.abs(value) > 80 && Math.abs(value) <= 800) {
    actual = value / 10;
    nota = 'Temperatura normalizada desde valor x10.';
  }

  return {
    actual: redondear(actual, 1),
    unidad: 'C',
    crudo: value,
    unidadCruda: unidad,
    nota,
  };
}

function normalizarSalinidad(value: number, unidad: string): MedicionSensorProfundidad {
  let actual = value;
  let nota: string | undefined;

  if (value > 2000 && value <= 20000) {
    actual = value / 10;
    nota = 'Salinidad normalizada desde valor x10.';
  }

  return {
    actual: redondear(Math.max(0, actual), 1),
    unidad: unidad || 'mS/m',
    crudo: value,
    unidadCruda: unidad,
    nota,
  };
}

function limitar(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function redondear(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
