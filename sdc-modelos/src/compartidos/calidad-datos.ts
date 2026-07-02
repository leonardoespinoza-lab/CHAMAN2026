export type NivelCalidadDato = 'alta' | 'media' | 'baja' | 'sin_datos';

export type FuenteCalidadDato =
  | 'sensor_campo'
  | 'estacion_asignada'
  | 'estacion_cercana'
  | 'open_meteo'
  | 'meteosource'
  | 'satelite'
  | 'catalogo'
  | 'manual'
  | 'estimado'
  | 'mixto'
  | 'desconocida';

export interface ICalidadDatoMotor {
  nivel: NivelCalidadDato;
  fuente: FuenteCalidadDato;
  cobertura?: number;
  distanciaKm?: number;
  fechaActualizacion?: string;
  fallback?: boolean;
  resumen?: string;
  limitaciones?: string[];
}

export function crearCalidadDatoMotor(
  data: Partial<ICalidadDatoMotor> = {},
): ICalidadDatoMotor {
  return {
    nivel: data.nivel || 'sin_datos',
    fuente: data.fuente || 'desconocida',
    cobertura: data.cobertura,
    distanciaKm: data.distanciaKm,
    fechaActualizacion: data.fechaActualizacion,
    fallback: data.fallback,
    resumen: data.resumen,
    limitaciones: data.limitaciones || [],
  };
}
