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

  if (params.estadoCalculoAguaUtil !== 'calculado') {
    const fallida = params.estadoCalculoAguaUtil === 'fallida';
    return {
      estado: fallida ? 'fallida' : 'no_disponible',
      motivo:
        params.calidadDatos?.resumen ||
        params.motivoCalculoAguaUtil ||
        'El balance hidrico no fue validado con datos operativos.',
    };
  }

  if (!tieneSerie) {
    return {
      estado: 'no_disponible',
      motivo:
        params.calidadDatos?.resumen ||
        params.motivoCalculoAguaUtil ||
        'No hay una serie de recomendacion de riego vigente.',
    };
  }

  const calidadOperativa =
    params.calidadDatos?.fallback === false &&
    params.calidadDatos?.nivel === 'alta' &&
    Number(params.calidadDatos?.cobertura) >= 1;
  if (!calidadOperativa) {
    return {
      estado: 'no_disponible',
      motivo:
        params.calidadDatos?.resumen ||
        'La cobertura o calidad de los datos no permite emitir una recomendacion operativa.',
    };
  }

  return {
    estado: 'calculada',
    fuente: 'sensor_suelo',
    motivo:
      params.calidadDatos?.resumen ||
      params.motivoCalculoAguaUtil ||
      'Recomendacion calculada con datos operativos de suelo.',
  };
}
