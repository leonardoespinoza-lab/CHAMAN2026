import { EstadoConexionEstacion } from 'modelos/src';
import { FIELDCLIMATE_MAX_DATA_AGE_HOURS } from '../env';

export interface FieldClimateStatus {
  ultimaLectura?: string;
  reportando: boolean;
  conexion: EstadoConexionEstacion;
}

export function parseFieldClimateDate(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const iso = normalized.includes('T')
    ? normalized
    : normalized.replace(' ', 'T');
  const parsed = new Date(hasTimezone ? iso : `${iso}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function fieldClimateStatus(
  ultimaLectura?: string,
  now = new Date(),
  maxAgeHours = FIELDCLIMATE_MAX_DATA_AGE_HOURS,
): FieldClimateStatus {
  const parsed = parseFieldClimateDate(ultimaLectura);
  if (!parsed) {
    return { ultimaLectura, reportando: false, conexion: 'sin_datos' };
  }
  const ageHours = Math.max(0, now.getTime() - parsed.getTime()) / 3_600_000;
  if (ageHours <= maxAgeHours) {
    return { ultimaLectura, reportando: true, conexion: 'reportando' };
  }
  if (ageHours <= 24) {
    return { ultimaLectura, reportando: false, conexion: 'demorada' };
  }
  return { ultimaLectura, reportando: false, conexion: 'sin_datos' };
}
