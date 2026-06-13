import { IReporte, SensoresV2 } from 'modelos/src';

export interface MedicionSensorProfundidad {
  actual: number;
  unidad: string;
}
export interface MedicionProfundidad {
  profundidad: number;
  humedad?: MedicionSensorProfundidad;
  salinidad?: MedicionSensorProfundidad;
  temperatura?: MedicionSensorProfundidad;
}

const SENSOR_KEY: Record<
  'humedad' | 'salinidad' | 'temperatura',
  SensoresV2
> = {
  humedad: 'Humedad Suelo Profundidad',
  salinidad: 'Salinidad Suelo',
  temperatura: 'Temperatura Suelo',
};

function getMetricByDepth(
  reporte: IReporte | undefined,
  sensor: SensoresV2,
): Map<number, MedicionSensorProfundidad> {
  const result = new Map<number, MedicionSensorProfundidad>();
  const rows = reporte?.datos?.valores?.[sensor];

  if (!Array.isArray(rows)) {
    return result;
  }

  rows.forEach((row) => {
    const depth = row.profundidad;
    const value = row.valores?.actual;
    if (
      depth === undefined ||
      value === undefined ||
      value === null ||
      !row.unidad
    ) {
      return;
    }

    result.set(depth, {
      actual: value,
      unidad: row.unidad,
    });
  });

  return result;
}

export function buildSentekProfile(
  reporte: IReporte | undefined,
): MedicionProfundidad[] {
  const humedad = getMetricByDepth(reporte, SENSOR_KEY.humedad);
  const salinidad = getMetricByDepth(reporte, SENSOR_KEY.salinidad);
  const temperatura = getMetricByDepth(reporte, SENSOR_KEY.temperatura);
  const depths = [...new Set([
    ...humedad.keys(),
    ...salinidad.keys(),
    ...temperatura.keys(),
  ])].sort((a, b) => a - b);

  return depths.map((profundidad) => ({
    profundidad,
    humedad: humedad.get(profundidad),
    salinidad: salinidad.get(profundidad),
    temperatura: temperatura.get(profundidad),
  }));
}
