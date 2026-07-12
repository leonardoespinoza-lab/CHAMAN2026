import {
  IPrediccionEnfermedad,
  TEnfermedad,
  TEnfermedadId,
} from 'modelos/src';
import { IResistenciaResuelta } from 'modelos/src';

export function camposClimaticosFaltantes(
  clima: Record<string, unknown>,
  campos: string[],
): string[] {
  return campos.filter((campo) => !Number.isFinite(Number(clima[campo])));
}

export function crearPrediccionSinDatos(
  enfermedad: TEnfermedad,
  idEnfermedad: TEnfermedadId,
  faltantes: string[],
  fuenteModelo: string,
): IPrediccionEnfermedad {
  return {
    enfermedad,
    idEnfermedad,
    resultado: 0,
    estado: 'sin_datos',
    calidadDatos: {
      nivel: 'sin_datos',
      fuente: 'desconocida',
      cobertura: 0,
      resumen: 'Predicción no calculada por variables climáticas faltantes.',
      limitaciones: faltantes.map((campo) => `Falta ${campo}`),
    },
    modelo: {
      id: idEnfermedad,
      version: 3,
      fuente: fuenteModelo,
    },
    variables: { formulaVersion: 3 },
  };
}

export function metadataResistencia(resuelta: IResistenciaResuelta) {
  const resistencia = resuelta.resistencia;
  return {
    resistenciaUsada: resistencia
      ? {
          idEnfermedad: resistencia.idEnfermedad,
          enfermedad: resistencia.enfermedad,
          multiplicador: resistencia.multiplicador,
          indiceResistencia: resistencia.indiceResistencia,
          perfil: resistencia.perfil,
          estado: resistencia.estado,
          confianza: resistencia.confianza,
          fuente: resistencia.fuente,
          fuenteUrl: resistencia.fuenteUrl,
          campaniaFuente: resistencia.campaniaFuente,
        }
      : { estado: 'desconocida' as const },
    calidadDatos: {
      nivel: resuelta.desconocida
        ? ('baja' as const)
        : resistencia?.confianza === 'alta'
          ? ('alta' as const)
          : ('media' as const),
      fuente: 'catalogo' as const,
      cobertura: resuelta.desconocida ? 0 : 1,
      fallback: resuelta.desconocida,
      resumen: resuelta.desconocida
        ? 'Sin resistencia varietal específica; escenario conservador susceptible.'
        : `Resistencia varietal ${resistencia?.perfil || 'cargada'} de ${resistencia?.campaniaFuente || 'campaña no informada'}.`,
      limitaciones: resuelta.desconocida
        ? ['La ausencia de dato no equivale a susceptibilidad observada.']
        : [],
    },
  };
}
