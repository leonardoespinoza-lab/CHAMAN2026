import {
  IClimaEstacionMeteorologica,
  ILote,
  IPronosticoEstacionMeteorologica,
  ISiembra,
  IValores,
} from 'modelos/src';

export const PROFUNDIDADES_SENTEK_CM = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
] as const;
export const MAX_ANTIGUEDAD_SENTEK_HORAS = 6;

export interface PerfilSentekSeguro {
  reportesCompletos: IClimaEstacionMeteorologica[];
  ultimoReporte?: IClimaEstacionMeteorologica;
  fechaUltimoReporte?: string;
  coberturaUltimoReporte: number;
  completo: boolean;
  fresco: boolean;
  motivo?: string;
}

export interface EvaluacionSeguridadRiego {
  accionable: boolean;
  motivo: string;
  limitaciones: string[];
}

/**
 * El decoder actual persiste humedad Sentek en porcentaje. El motor no debe
 * adivinar escalas (0-3, 0-300 o x10): una lectura fuera de 0..100 se rechaza.
 */
export function normalizarHumedadSueloPct(
  value?: number | null,
): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return undefined;
  return redondear(raw, 2);
}

/**
 * Mantiene la profundidad fisica como clave y prioriza el ultimo valor del
 * ciclo. Nunca reemplaza una profundidad faltante con el promedio de otra.
 */
export function adaptarPerfilSueloLoRaWAN(
  reportes: any[] = [],
): IClimaEstacionMeteorologica[] {
  return reportes
    .map((reporte) => {
      const humedadSuelo: Record<number, IValores> = {};
      for (const [profundidadRaw, valores] of Object.entries(
        reporte?.humedadSuelo || {},
      )) {
        const profundidad = Number(profundidadRaw);
        if (!Number.isFinite(profundidad) || profundidad <= 0) continue;
        const dato = valores as IValores;
        const last = normalizarHumedadSueloPct(dato?.last ?? dato?.result);
        if (last == null) continue;
        humedadSuelo[profundidad] = { last };
      }
      return {
        ...reporte,
        humedadSuelo,
      } as IClimaEstacionMeteorologica;
    })
    .filter(
      (reporte) =>
        !!reporte.fecha && Object.keys(reporte.humedadSuelo || {}).length > 0,
    )
    .sort(
      (a, b) =>
        new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime(),
    );
}

/** Selecciona ciclos horarios 12/12; el ultimo parcial nunca pisa al completo. */
export function seleccionarPerfilSentekSeguro(
  reportes: IClimaEstacionMeteorologica[] = [],
  ahora: Date = new Date(),
  maxAntiguedadHoras = MAX_ANTIGUEDAD_SENTEK_HORAS,
): PerfilSentekSeguro {
  const ordenados = [...reportes]
    .filter((reporte) => !!reporte?.fecha)
    .sort(
      (a, b) =>
        new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime(),
    );
  const reportesCompletos = ordenados.filter((reporte) =>
    PROFUNDIDADES_SENTEK_CM.every((profundidad) =>
      lecturaValida(reporte, profundidad),
    ),
  );
  const ultimoRecibido = ordenados[ordenados.length - 1];
  const ultimoReporte = reportesCompletos[reportesCompletos.length - 1];
  const coberturaUltimoReporte = ultimoRecibido
    ? PROFUNDIDADES_SENTEK_CM.filter((profundidad) =>
        lecturaValida(ultimoRecibido, profundidad),
      ).length / PROFUNDIDADES_SENTEK_CM.length
    : 0;
  const fechaUltimoReporte = ultimoReporte?.fecha;
  const fechaMs = fechaUltimoReporte
    ? new Date(fechaUltimoReporte).getTime()
    : Number.NaN;
  const antiguedadMs = ahora.getTime() - fechaMs;
  const fresco =
    Number.isFinite(antiguedadMs) &&
    antiguedadMs >= -15 * 60 * 1000 &&
    antiguedadMs <= maxAntiguedadHoras * 60 * 60 * 1000;

  let motivo: string | undefined;
  if (!ordenados.length) motivo = 'No hay lecturas horarias del perfil Sentek.';
  else if (!ultimoReporte)
    motivo = 'No hay ningun ciclo Sentek completo con 12 profundidades.';
  else if (!fresco)
    motivo = `El ultimo ciclo Sentek 12/12 supera ${maxAntiguedadHoras} horas.`;

  return {
    reportesCompletos,
    ultimoReporte,
    fechaUltimoReporte,
    coberturaUltimoReporte: redondear(coberturaUltimoReporte, 2),
    completo: !!ultimoReporte,
    fresco,
    motivo,
  };
}

export function evaluarSeguridadRecomendacionRiego(params: {
  siembra: ISiembra;
  lote: ILote;
  cultivo?: unknown;
  tieneSentek: boolean;
  perfilSentek?: PerfilSentekSeguro;
  humedadLegacy?: IClimaEstacionMeteorologica[];
  lluviaHistorica?: IClimaEstacionMeteorologica[];
  pronostico?: IPronosticoEstacionMeteorologica[];
  fuentesConError?: string[];
  ahora?: Date;
}): EvaluacionSeguridadRiego {
  const faltantes: string[] = [];
  const ahora = params.ahora || new Date();

  if (!campaniaVigente(params.siembra, ahora)) {
    faltantes.push('campania vigente con fecha de siembra valida');
  }
  if (!params.cultivo) faltantes.push('cultivo configurado');

  if (params.tieneSentek) {
    if (!params.perfilSentek?.completo)
      faltantes.push('ciclo Sentek completo 12/12');
    else if (!params.perfilSentek.fresco)
      faltantes.push('ciclo Sentek fresco');
  } else if (!humedadLegacyFresca(params.humedadLegacy || [], ahora)) {
    faltantes.push('humedad de suelo fresca');
  }

  if (!calibracionHidricaValida(params.lote)) {
    faltantes.push('CC y PMP calibrados o confirmados para el perfil');
  }

  const capacidad = Number(params.lote.capacidadDeRiego);
  if (!Number.isFinite(capacidad) || capacidad <= 0)
    faltantes.push('capacidad real del sistema de riego');

  const anchoBulbo = Number(params.lote.anchoDeBulbo);
  const metrosLineales = Number(params.lote.metrosLinealesHas);
  const factorArea = (anchoBulbo * metrosLineales) / 10000;
  if (
    !Number.isFinite(anchoBulbo) ||
    anchoBulbo <= 0 ||
    !Number.isFinite(metrosLineales) ||
    metrosLineales <= 0 ||
    !Number.isFinite(factorArea) ||
    factorArea <= 0 ||
    factorArea > 1
  ) {
    faltantes.push('area mojada valida (ancho de bulbo y metros lineales)');
  }

  if (resolverEficienciaRiego(params.lote) == null) {
    faltantes.push('eficiencia de aplicacion del riego');
  }

  if (!Array.isArray(params.lluviaHistorica) || !params.lluviaHistorica.length) {
    faltantes.push('lluvia historica observada');
  }
  const et0Validos = (params.pronostico || [])
    .slice(0, 3)
    .filter((item) => {
      const et0 = Number(item?.et0);
      return Number.isFinite(et0) && et0 >= 0 && !!item?.fecha;
    }).length;
  if (et0Validos < 3) faltantes.push('pronostico ET0 de al menos 3 dias');

  for (const fuente of params.fuentesConError || []) {
    faltantes.push(`fuente ${fuente} no disponible`);
  }

  const limitaciones = [...new Set(faltantes)];
  return {
    accionable: limitaciones.length === 0,
    motivo: limitaciones.length
      ? `Recomendacion de riego no disponible: ${limitaciones.join('; ')}.`
      : 'Entradas agronomicas, sensor y clima validados para el calculo.',
    limitaciones,
  };
}

/** Convierte el porcentaje publico a fraccion y tolera el alias legado. */
export function resolverEficienciaRiego(lote: ILote): number | undefined {
  const raw = Number(
    (lote as ILote & {
      eficienciaRiego?: number;
      eficienciaDeRiego?: number;
    }).eficienciaRiego ??
      (lote as ILote & { eficienciaDeRiego?: number }).eficienciaDeRiego,
  );
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const normalizada = raw > 1 && raw <= 100 ? raw / 100 : raw;
  return normalizada >= 0.1 && normalizada <= 1 ? normalizada : undefined;
}

function lecturaValida(
  reporte: IClimaEstacionMeteorologica,
  profundidad: number,
): boolean {
  const lectura = (reporte.humedadSuelo as Record<string, IValores> | undefined)?.[
    String(profundidad)
  ];
  return (
    normalizarHumedadSueloPct(lectura?.last ?? lectura?.result) != null
  );
}

function campaniaVigente(siembra: ISiembra, ahora: Date): boolean {
  if (siembra.activa === false || !!siembra.fechaCosecha) return false;
  const fechaSiembra = new Date(siembra.fechaSiembra || '').getTime();
  if (!Number.isFinite(fechaSiembra) || fechaSiembra > ahora.getTime())
    return false;
  const limite = new Date(ahora);
  limite.setMonth(limite.getMonth() - 6);
  return fechaSiembra >= limite.getTime();
}

function humedadLegacyFresca(
  reportes: IClimaEstacionMeteorologica[],
  ahora: Date,
): boolean {
  const ultimo = [...reportes]
    .filter((item) => !!item?.fecha)
    .sort(
      (a, b) =>
        new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime(),
    )
    .pop();
  if (!ultimo?.fecha || !Object.keys(ultimo.humedadSuelo || {}).length)
    return false;
  const edad = ahora.getTime() - new Date(ultimo.fecha).getTime();
  return edad >= -15 * 60 * 1000 && edad <= 6 * 60 * 60 * 1000;
}

function calibracionHidricaValida(lote: ILote): boolean {
  const valorCapaValido = (capa: NonNullable<ILote['suelos']>[number]) => {
    const cc = normalizarPorcentaje(
      capa.capacidadDeCampo ?? lote.capacidadDeCampo,
    );
    const pmp = normalizarPorcentaje(
      capa.puntoMarchitez ?? lote.puntoMarchitez,
    );
    return cc != null && pmp != null && pmp >= 0 && cc > pmp && cc <= 100;
  };
  const capas = lote.suelos?.length ? lote.suelos : [{}];
  if (!capas.every(valorCapaValido)) return false;
  if (lote.sueloConfirmadoPorUsuario !== true) return false;

  // La confirmacion explicita y una calibracion completa/mapeada 12/12 son
  // condiciones acumulativas. Un perfil automatico (aunque tenga 12 capas) o
  // un 30/14 top-level quedan como diagnostico, nunca habilitan milimetros.
  return PROFUNDIDADES_SENTEK_CM.every((profundidad) => {
    const capa = capas.find(
      (item) =>
        Number(item.profundidad) === profundidad &&
        Number(item.numeroDeSensor) === profundidad / 10,
    );
    return !!capa && valorCapaValido(capa);
  });
}

function normalizarPorcentaje(value?: number): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  const normalizado = raw <= 1 ? raw * 100 : raw;
  return normalizado <= 100 ? normalizado : undefined;
}

function redondear(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
