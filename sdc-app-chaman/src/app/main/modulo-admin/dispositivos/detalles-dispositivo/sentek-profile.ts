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

/**
 * Las primeras versiones de Chaman rotularon la sonda de 1,2 m como
 * 5, 15, ..., 115 cm. El montaje real informado por campo es 10, 20,
 * ..., 120 cm. Esta normalizacion mantiene legibles los reportes
 * historicos sin reescribir la evidencia persistida.
 */
export function normalizarProfundidadSentek(profundidad: number): number {
  if (Number.isInteger(profundidad) && profundidad >= 5 && profundidad <= 115 && (profundidad - 5) % 10 === 0) {
    return profundidad + 5;
  }
  return profundidad;
}

function getMetricByDepth(
  reporte: IReporte | undefined,
  sensor: SensoresV2,
  normalizer?: (value: number, unidad: string) => MedicionSensorProfundidad | undefined
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

    const normalized = normalizer ? normalizer(value, row.unidad) : { actual: value, unidad: row.unidad };
    if (normalized) {
      result.set(normalizarProfundidadSentek(depth), normalized);
    }
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

function normalizarHumedad(value: number, unidad: string): MedicionSensorProfundidad | undefined {
  const unidadNormalizada = unidad.toLowerCase().replace(/\s/g, '');
  const esPorcentaje = unidadNormalizada.includes('%');
  const esVolumetrica = unidadNormalizada.includes('m3/m3') || unidadNormalizada.includes('vwc');
  const esMilimetrosPorCapa = unidadNormalizada.includes('mm/10cm');
  const actual = esVolumetrica && value >= 0 && value <= 1 ? value * 100 : value;

  // Sentek entrega una magnitud ya calibrada. No se adivinan escalas 0-3,
  // 0-300 ni x10: si la unidad/rango no es demostrable, la UI no publica el
  // punto y la trama cruda sigue disponible como evidencia.
  if ((!esPorcentaje && !esVolumetrica && !esMilimetrosPorCapa) || actual < 0 || actual > 100) {
    return undefined;
  }

  return {
    actual: redondear(actual, 1),
    unidad: '%',
    crudo: value,
    unidadCruda: unidad,
    nota: esMilimetrosPorCapa ? '1 mm/10 cm equivale numericamente a 1 % VWC.' : undefined,
  };
}

function normalizarTemperatura(value: number, unidad: string): MedicionSensorProfundidad | undefined {
  const unidadNormalizada = unidad.toLowerCase().replace(/\s|\u00b0/g, '');
  if (!['c', 'celsius'].includes(unidadNormalizada) || value < -40 || value > 60) return undefined;

  return {
    actual: redondear(value, 1),
    unidad: 'C',
    crudo: value,
    unidadCruda: unidad,
  };
}

function normalizarSalinidad(value: number, unidad: string): MedicionSensorProfundidad | undefined {
  if (value < 0 || !unidad.toLowerCase().includes('vic')) return undefined;

  return {
    actual: redondear(value, 1),
    unidad: 'VIC',
    crudo: value,
    unidadCruda: unidad,
    nota: 'Indice VIC de tendencia; no equivale a EC sin calibracion de suelo y humedad comparable.',
  };
}

function redondear(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
