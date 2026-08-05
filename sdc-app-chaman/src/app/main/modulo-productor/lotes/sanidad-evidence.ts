import {
  IPrediccionEnfermedad,
  ISiembra,
  TSemaforoSanitario,
  evaluarSanidadAgregada,
} from 'modelos/src';

export type TEstadoSanidadFrontend = 'sin_datos' | 'seguimiento' | 'operativo';

export interface IEvidenciaSanidadFrontend {
  estado: TEstadoSanidadFrontend;
  todas: IPrediccionEnfermedad[];
  operativas: IPrediccionEnfermedad[];
  alertables: IPrediccionEnfermedad[];
  noAgregables: IPrediccionEnfermedad[];
  principal?: IPrediccionEnfermedad;
  maximo?: number;
  semaforo: TSemaforoSanitario;
}

/**
 * Unifica el contrato sanitario de mapas, listados y resúmenes ejecutivos.
 * Las lecturas experimentales, provisionales, antiguas o incompletas siguen
 * visibles en el lote, pero nunca colorean mapas ni alteran rindes estimados.
 */
export function evaluarSanidadFrontend(siembra?: ISiembra): IEvidenciaSanidadFrontend {
  const todas = (siembra?.ultimaPrediccion?.enfermedades || []).filter(Boolean);
  const fecha = siembra?.ultimaPrediccion?.fechaPrediccion || siembra?.ultimaPrediccion?.fecha;
  const evaluacion = evaluarSanidadAgregada(todas, siembra?.semilla?.cultivo, fecha);
  const operativas = evaluacion.operativas as IPrediccionEnfermedad[];
  const alertables = evaluacion.alertables as IPrediccionEnfermedad[];
  const operativasSet = new Set(operativas);
  const noAgregables = todas.filter((item) => !operativasSet.has(item));
  const principal = evaluacion.principal as IPrediccionEnfermedad | undefined;

  return {
    estado: operativas.length ? 'operativo' : todas.length ? 'seguimiento' : 'sin_datos',
    todas,
    operativas,
    alertables,
    noAgregables,
    principal,
    maximo: evaluacion.maximo,
    semaforo: evaluacion.semaforo,
  };
}
