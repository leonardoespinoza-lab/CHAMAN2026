import {
  ICalidadDatoMotor,
  IPronosticoRiego,
  TEstadoRecomendacionRiego,
  TFuenteRecomendacionRiego,
} from 'modelos/src';

export interface IEstadoRecomendacionRiegoResuelto {
  estado: TEstadoRecomendacionRiego;
  fuente?: TFuenteRecomendacionRiego;
  motivo: string;
}

export function resolverEstadoRecomendacionRiego(params: {
  pronosticosRiego?: IPronosticoRiego[];
  estadoCalculoAguaUtil?:
    | 'calculado'
    | 'estimado'
    | 'no_disponible'
    | 'fallida';
  motivoCalculoAguaUtil?: string;
  calidadDatos?: ICalidadDatoMotor;
}): IEstadoRecomendacionRiegoResuelto {
  const tieneSerie = Array.isArray(params.pronosticosRiego)
    ? params.pronosticosRiego.length > 0
    : false;

  if (!tieneSerie) {
    const fallida = params.estadoCalculoAguaUtil === 'fallida';
    return {
      estado: fallida ? 'fallida' : 'no_disponible',
      motivo:
        params.calidadDatos?.resumen ||
        params.motivoCalculoAguaUtil ||
        'No hay una serie de recomendacion de riego vigente.',
    };
  }

  const estimada = params.calidadDatos?.fallback === true;
  return {
    estado: estimada ? 'estimada' : 'calculada',
    fuente: estimada ? 'balance_climatico' : 'sensor_suelo',
    motivo:
      params.calidadDatos?.resumen ||
      params.motivoCalculoAguaUtil ||
      (estimada
        ? 'Balance estimado con clima y cultivo; validar a campo.'
        : 'Recomendacion calculada con datos operativos de suelo.'),
  };
}
