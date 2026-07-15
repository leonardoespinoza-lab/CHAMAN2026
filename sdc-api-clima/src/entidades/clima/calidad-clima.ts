import { IClimaEstacionMeteorologica } from 'modelos/src';

export type TGrupoClima = 'raw' | 'hourly' | 'daily' | 'monthly' | undefined;

export interface IResultadoFusionClima {
  datos: IClimaEstacionMeteorologica[];
  coberturaFieldClimate: number;
  coberturaFinal: number;
  diasEsperados: number;
  diasFieldClimate: number;
  diasFallback: number;
  diasFallbackHorario: number;
  diasFallbackDiario: number;
}

const dia = (fecha?: string): string => String(fecha || '').split('T')[0];
const RESOLUCION_OPEN_METEO = Symbol('resolucion-open-meteo');

type TResolucionOpenMeteo = 'hourly' | 'daily';
type IClimaOpenMeteoMarcado = IClimaEstacionMeteorologica & {
  [RESOLUCION_OPEN_METEO]?: TResolucionOpenMeteo;
};

/**
 * Marca internamente la resolucion de una fila Open-Meteo. El simbolo no es
 * enumerable, por lo que no se filtra al contrato HTTP ni modifica el modelo
 * compartido.
 */
export function marcarResolucionOpenMeteo(
  item: IClimaEstacionMeteorologica,
  resolucion: TResolucionOpenMeteo,
): IClimaEstacionMeteorologica {
  Object.defineProperty(item, RESOLUCION_OPEN_METEO, {
    value: resolucion,
    enumerable: false,
    configurable: false,
  });
  return item;
}

function resolucionOpenMeteo(
  item: IClimaEstacionMeteorologica,
): TResolucionOpenMeteo | undefined {
  return (item as IClimaOpenMeteoMarcado)[RESOLUCION_OPEN_METEO];
}

const finito = (value: unknown): boolean => {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return false;
  }
  return Number.isFinite(Number(value));
};

function puntajeCompletitud(item: IClimaEstacionMeteorologica): number {
  return [
    item.temperatura?.avg ?? item.temperatura?.last,
    item.humedad?.avg ?? item.humedad?.last,
    item.lluvia?.sum ?? item.lluvia?.last,
    item.velocidadViento?.avg ?? item.velocidadViento?.last,
  ].filter(finito).length;
}

/**
 * Conserva una sola observacion por instante real. Si la fuente repite una
 * marca horaria, se prioriza la fila con mas variables validas para no inflar
 * cobertura ni acumular dos veces lluvia u otras mediciones.
 */
function deduplicarPorInstante(
  filas: IClimaEstacionMeteorologica[],
): IClimaEstacionMeteorologica[] {
  const unicas = new Map<number, IClimaEstacionMeteorologica>();
  for (const fila of filas || []) {
    const instante = new Date(String(fila?.fecha || '')).getTime();
    if (!Number.isFinite(instante)) continue;
    const previa = unicas.get(instante);
    if (!previa || puntajeCompletitud(fila) > puntajeCompletitud(previa)) {
      unicas.set(instante, fila);
    }
  }
  return [...unicas.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, fila]) => fila);
}

function fechasEntre(minDate: string, maxDate: string): string[] {
  const inicio = new Date(minDate);
  const fin = new Date(maxDate);
  inicio.setUTCHours(0, 0, 0, 0);
  fin.setUTCHours(0, 0, 0, 0);
  const fechas: string[] = [];
  // Los motores recorren [minDate, maxDate): maxDate es el limite superior,
  // no un dia que deba tener observaciones.
  for (
    const actual = new Date(inicio);
    actual < fin;
    actual.setUTCDate(actual.getUTCDate() + 1)
  ) {
    fechas.push(actual.toISOString().split('T')[0]);
  }
  return fechas;
}

function tieneVariablesMinimas(item: IClimaEstacionMeteorologica): boolean {
  return (
    Number.isFinite(new Date(String(item.fecha || '')).getTime()) &&
    finito(item.temperatura?.avg ?? item.temperatura?.last) &&
    finito(item.humedad?.avg ?? item.humedad?.last) &&
    finito(item.lluvia?.sum ?? item.lluvia?.last)
  );
}

function cantidadHorasValidas(filas: IClimaEstacionMeteorologica[]): number {
  return new Set(
    deduplicarPorInstante(filas)
      .filter(tieneVariablesMinimas)
      .map((item) =>
        Math.floor(new Date(String(item.fecha)).getTime() / (60 * 60 * 1000)),
      ),
  ).size;
}

export function diaClimaticoCompleto(
  filas: IClimaEstacionMeteorologica[],
  dataGroup?: TGrupoClima,
): boolean {
  if (dataGroup === 'hourly' || dataGroup === 'raw') {
    return cantidadHorasValidas(filas) >= 18;
  }
  const validas = deduplicarPorInstante(filas).filter(tieneVariablesMinimas);
  return validas.length >= 1;
}

export function evaluarCoberturaClimatica(
  datos: IClimaEstacionMeteorologica[],
  minDate: string,
  maxDate: string,
  dataGroup?: TGrupoClima,
): { cobertura: number; diasEsperados: number; diasCompletos: number } {
  const esperadas = fechasEntre(minDate, maxDate);
  const diasCompletos = esperadas.filter((fecha) =>
    diaClimaticoCompleto(
      datos.filter((item) => dia(item.fecha) === fecha),
      dataGroup,
    ),
  ).length;
  return {
    cobertura: esperadas.length ? diasCompletos / esperadas.length : 0,
    diasEsperados: esperadas.length,
    diasCompletos,
  };
}

export function fusionarClimaConFallback(
  fieldClimate: IClimaEstacionMeteorologica[],
  fallback: IClimaEstacionMeteorologica[],
  minDate: string,
  maxDate: string,
  dataGroup?: TGrupoClima,
  fuenteFieldClimate:
    | 'estacion_cercana'
    | 'estacion_asignada' = 'estacion_cercana',
): IResultadoFusionClima {
  const esperadas = fechasEntre(minDate, maxDate);
  const resultado: IClimaEstacionMeteorologica[] = [];
  let diasFieldClimate = 0;
  let diasFallback = 0;
  let diasFallbackHorario = 0;
  let diasFallbackDiario = 0;

  for (const fecha of esperadas) {
    const fieldRows = deduplicarPorInstante(
      fieldClimate.filter((item) => dia(item.fecha) === fecha),
    );
    if (diaClimaticoCompleto(fieldRows, dataGroup)) {
      diasFieldClimate += 1;
      const solicitaHorario = dataGroup === 'hourly' || dataGroup === 'raw';
      const registrosValidos = solicitaHorario
        ? cantidadHorasValidas(fieldRows)
        : fieldRows.filter(tieneVariablesMinimas).length;
      const coberturaHoraria = solicitaHorario
        ? Math.min(1, registrosValidos / 24)
        : 1;
      const serieCompleta = !solicitaHorario || registrosValidos >= 24;
      resultado.push(
        ...fieldRows.map((item) => ({
          ...item,
          calidadDatos: {
            nivel: serieCompleta ? ('alta' as const) : ('media' as const),
            fuente: fuenteFieldClimate,
            score: Math.round(coberturaHoraria * 100),
            cobertura: coberturaHoraria,
            fallback: false,
            resumen: solicitaHorario
              ? `Dia cubierto con ${registrosValidos} de 24 horas validas de FieldClimate.`
              : 'Dia completo desde FieldClimate.',
            limitaciones: serieCompleta
              ? []
              : [
                  `Serie horaria parcial de FieldClimate: ${registrosValidos} de 24 horas validas; se acepta por superar el minimo operativo de 18 horas.`,
                ],
          },
        })),
      );
      continue;
    }

    const fallbackRows = fallback.filter((item) => dia(item.fecha) === fecha);
    const solicitaHorario = dataGroup === 'hourly' || dataGroup === 'raw';
    const fallbackHorario = solicitaHorario
      ? deduplicarPorInstante(
          fallbackRows.filter((item) => resolucionOpenMeteo(item) === 'hourly'),
        )
      : [];
    const fallbackDiario = deduplicarPorInstante(
      fallbackRows.filter((item) => resolucionOpenMeteo(item) !== 'hourly'),
    );

    if (solicitaHorario && diaClimaticoCompleto(fallbackHorario, 'hourly')) {
      diasFallback += 1;
      diasFallbackHorario += 1;
      const registrosValidos = fallbackHorario.filter(tieneVariablesMinimas);
      const horasValidas = cantidadHorasValidas(registrosValidos);
      const coberturaHoraria = Math.min(1, horasValidas / 24);
      resultado.push(
        ...registrosValidos.map((item) => ({
          ...item,
          calidadDatos: {
            nivel: 'media' as const,
            fuente: 'open_meteo' as const,
            score: Math.round(coberturaHoraria * 85),
            cobertura: coberturaHoraria,
            fallback: true,
            resumen: `Dia completado con ${horasValidas} horas validas de Open-Meteo.`,
            limitaciones: [
              'Fuente meteorologica modelada; no sustituye una medicion de la central del lote.',
            ],
          },
        })),
      );
      continue;
    }

    if (diaClimaticoCompleto(fallbackDiario, 'daily')) {
      diasFallback += 1;
      diasFallbackDiario += 1;
      resultado.push(
        ...fallbackDiario.map((item) => ({
          ...item,
          calidadDatos: {
            nivel: 'media' as const,
            fuente: 'open_meteo' as const,
            score: solicitaHorario ? 55 : 75,
            cobertura: 1,
            fallback: true,
            resumen: 'Dia completado con el agregado diario de Open-Meteo.',
            limitaciones: solicitaHorario
              ? [
                  'La serie horaria de Open-Meteo no estuvo disponible o no alcanzo 18 horas validas; se usa el agregado diario.',
                ]
              : [],
          },
        })),
      );
    }
  }

  const diasFinales = diasFieldClimate + diasFallback;
  return {
    datos: resultado.sort((a, b) =>
      String(a.fecha).localeCompare(String(b.fecha)),
    ),
    coberturaFieldClimate: esperadas.length
      ? diasFieldClimate / esperadas.length
      : 0,
    coberturaFinal: esperadas.length ? diasFinales / esperadas.length : 0,
    diasEsperados: esperadas.length,
    diasFieldClimate,
    diasFallback,
    diasFallbackHorario,
    diasFallbackDiario,
  };
}
