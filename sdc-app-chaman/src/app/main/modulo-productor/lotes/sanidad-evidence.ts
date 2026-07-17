import {
  IPrediccionEnfermedad,
  ISiembra,
  esFechaPrediccionSanitariaReciente,
  esLecturaSanitariaOperativa,
} from 'modelos/src';

export type TEstadoSanidadFrontend = 'sin_datos' | 'seguimiento' | 'operativo';

export interface IEvidenciaSanidadFrontend {
  estado: TEstadoSanidadFrontend;
  todas: IPrediccionEnfermedad[];
  operativas: IPrediccionEnfermedad[];
  noAgregables: IPrediccionEnfermedad[];
  principal?: IPrediccionEnfermedad;
  maximo?: number;
}

/**
 * Unifica el contrato sanitario de mapas, listados y resúmenes ejecutivos.
 * Las lecturas experimentales, provisionales, antiguas o incompletas siguen
 * visibles en el lote, pero nunca colorean mapas ni alteran rindes estimados.
 */
export function evaluarSanidadFrontend(siembra?: ISiembra): IEvidenciaSanidadFrontend {
  const todas = (siembra?.ultimaPrediccion?.enfermedades || []).filter(Boolean);
  const fecha = siembra?.ultimaPrediccion?.fechaPrediccion || siembra?.ultimaPrediccion?.fecha;
  const reciente = esFechaPrediccionSanitariaReciente(fecha);
  const operativas = reciente ? todas.filter((item) => esLecturaSanitariaOperativa(item)) : [];
  const operativasSet = new Set(operativas);
  const noAgregables = todas.filter((item) => !operativasSet.has(item));
  const principal = operativas.reduce<IPrediccionEnfermedad | undefined>(
    (max, item) => (!max || Number(item.resultado) > Number(max.resultado) ? item : max),
    undefined
  );

  return {
    estado: operativas.length ? 'operativo' : todas.length ? 'seguimiento' : 'sin_datos',
    todas,
    operativas,
    noAgregables,
    principal,
    maximo: principal ? Number(principal.resultado) : undefined,
  };
}
