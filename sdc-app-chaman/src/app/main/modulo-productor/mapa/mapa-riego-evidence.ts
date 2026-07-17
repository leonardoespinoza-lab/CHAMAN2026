import { ILote } from 'modelos/src';
import { evaluarRiegoFrontend } from '../lotes/riego-evidence';

export type EstadoRiegoMapa = 'hoy' | 'proximo' | 'sin_aporte' | 'sin_datos';

export interface EvidenciaRiegoMapa {
  estado: EstadoRiegoMapa;
  suma: number | null;
}

export function evaluarRiegoMapa(lote: ILote): EvidenciaRiegoMapa {
  const evaluacion = evaluarRiegoFrontend(lote.siembra, lote);
  if (!evaluacion.serieDisponible) {
    return { estado: 'sin_datos', suma: null };
  }
  const cantidades = evaluacion.serie.map((item) => Number(item.cantidad) || 0);
  const suma = cantidades.reduce((total, cantidad) => total + cantidad, 0);
  if ((cantidades[0] || 0) > 0) return { estado: 'hoy', suma };
  if (cantidades.some((cantidad) => cantidad > 0)) return { estado: 'proximo', suma };
  return { estado: 'sin_aporte', suma: 0 };
}
