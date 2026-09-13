import {
  esCultivoPerenne,
  IPronosticoEstacionMeteorologica,
  IRespuestaAgrometeorologiaSiembra,
  ISiembra,
} from 'modelos/src';

export interface DemandaRiegoDia {
  fecha: string;
  et0: number;
  kc: number;
  consumoAgua: number;
}

/** No interpola huecos ni reconstruye Kc por edad de la plantacion. */
export function demandaRiegoCanonica(
  siembra: ISiembra,
  pronostico: IPronosticoEstacionMeteorologica[],
  respuesta?: IRespuestaAgrometeorologiaSiembra,
): DemandaRiegoDia[] {
  const faltante = () => {
    throw new Error(
      'Demanda de riego no disponible: falta ETc canonica vigente para la ventana de pronostico.',
    );
  };
  if (!respuesta?.series?.length || !pronostico.length) return faltante();
  const ultimaEdicion = Math.max(
    0,
    ...(siembra.registrosFenologicos || []).map(
      (r) => Date.parse(r.actualizadoEn || r.creadoEn || '') || 0,
    ),
  );
  if (
    ultimaEdicion > 0 &&
    !(Date.parse(respuesta.dataSource?.lastCalculatedAt || '') >= ultimaEdicion)
  )
    return faltante();
  const fechas = new Set<string>();
  return pronostico.slice(0, 7).map((p) => {
    const fecha = p.fecha?.slice(0, 10);
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fechas.has(fecha))
      return faltante();
    fechas.add(fecha);
    const candidatos = respuesta.series.filter(
      (d) => d.date?.slice(0, 10) === fecha,
    );
    if (candidatos.length !== 1) return faltante();
    const dia = candidatos[0];
    if (
      esCultivoPerenne(siembra.semilla?.cultivo) &&
      !['campo', 'proyeccion_anclada_campo'].includes(dia.stageSource || '')
    )
      return faltante();
    const { et0Mm, kc, etcMm } = dia.metrics || {};
    if (!valido(et0Mm, 25) || !valido(kc, 2) || !valido(etcMm, 50))
      return faltante();
    return { fecha, et0: et0Mm, kc, consumoAgua: etcMm };
  });
}

function valido(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
  );
}
