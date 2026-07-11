import { IClimaEstacionMeteorologica } from 'modelos/src';

export type TGrupoClima = 'raw' | 'hourly' | 'daily' | 'monthly' | undefined;

export interface IResultadoFusionClima {
  datos: IClimaEstacionMeteorologica[];
  coberturaFieldClimate: number;
  coberturaFinal: number;
  diasEsperados: number;
  diasFieldClimate: number;
  diasFallback: number;
}

const dia = (fecha?: string): string => String(fecha || '').split('T')[0];
const finito = (value: unknown): boolean => Number.isFinite(Number(value));

function fechasEntre(minDate: string, maxDate: string): string[] {
  const inicio = new Date(minDate);
  const fin = new Date(maxDate);
  inicio.setUTCHours(0, 0, 0, 0);
  fin.setUTCHours(0, 0, 0, 0);
  const fechas: string[] = [];
  // Los motores recorren [minDate, maxDate): maxDate es el limite superior,
  // no un dia que deba tener observaciones.
  for (const actual = new Date(inicio); actual < fin; actual.setUTCDate(actual.getUTCDate() + 1)) {
    fechas.push(actual.toISOString().split('T')[0]);
  }
  return fechas;
}

function tieneVariablesMinimas(item: IClimaEstacionMeteorologica): boolean {
  return (
    finito(item.temperatura?.avg ?? item.temperatura?.last) &&
    finito(item.humedad?.avg ?? item.humedad?.last) &&
    finito(item.lluvia?.sum ?? item.lluvia?.last)
  );
}

export function diaClimaticoCompleto(
  filas: IClimaEstacionMeteorologica[],
  dataGroup?: TGrupoClima,
): boolean {
  const validas = filas.filter(tieneVariablesMinimas);
  if (dataGroup === 'hourly' || dataGroup === 'raw') return validas.length >= 18;
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
): IResultadoFusionClima {
  const esperadas = fechasEntre(minDate, maxDate);
  const resultado: IClimaEstacionMeteorologica[] = [];
  let diasFieldClimate = 0;
  let diasFallback = 0;

  for (const fecha of esperadas) {
    const fieldRows = fieldClimate.filter((item) => dia(item.fecha) === fecha);
    if (diaClimaticoCompleto(fieldRows, dataGroup)) {
      diasFieldClimate += 1;
      resultado.push(
        ...fieldRows.map((item) => ({
          ...item,
          calidadDatos: {
            nivel: 'alta' as const,
            fuente: 'estacion_cercana' as const,
            cobertura: 1,
            fallback: false,
            resumen: 'Día completo desde FieldClimate.',
            limitaciones: [],
          },
        })),
      );
      continue;
    }

    const fallbackRows = fallback.filter((item) => dia(item.fecha) === fecha);
    if (diaClimaticoCompleto(fallbackRows, 'daily')) {
      diasFallback += 1;
      resultado.push(
        ...fallbackRows.map((item) => ({
          ...item,
          calidadDatos: {
            nivel: 'media' as const,
            fuente: 'open_meteo' as const,
            cobertura: 1,
            fallback: true,
            resumen: 'Día completado con Open-Meteo.',
            limitaciones:
              dataGroup === 'hourly' || dataGroup === 'raw'
                ? ['Fallback diario: no conserva resolución horaria.']
                : [],
          },
        })),
      );
    }
  }

  const diasFinales = diasFieldClimate + diasFallback;
  return {
    datos: resultado.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
    coberturaFieldClimate: esperadas.length ? diasFieldClimate / esperadas.length : 0,
    coberturaFinal: esperadas.length ? diasFinales / esperadas.length : 0,
    diasEsperados: esperadas.length,
    diasFieldClimate,
    diasFallback,
  };
}
