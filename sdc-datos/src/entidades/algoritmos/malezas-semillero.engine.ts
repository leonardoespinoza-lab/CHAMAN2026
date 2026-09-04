import {
  FuenteMeteorologicaNormalizada,
  IContextoSatelitalMalezas,
  IPrediccionMalezaDia,
  IReporteNDVI,
  ISeguimientoMalezasLote,
  SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT,
  TTemporadaEmergenciaMaleza,
} from 'modelos/src';

export type FuenteSemilleroMalezas =
  | 'Open-Meteo · semillero 0-5 cm'
  | 'Chaman-Meteo · suelo 0-7 cm';

export interface HoraClimaMalezas {
  timestamp: string;
  temperaturaSuelo?: number;
  humedadSuelo?: number;
  lluviaMm?: number;
  et0Mm?: number;
}

export interface DiaClimaMalezas {
  fecha: string;
  tipo: 'historico' | 'pronostico';
  temperaturaMedia?: number;
  temperaturaSuelo?: number;
  humedadSuelo?: number;
  lluviaMm?: number;
  et0Mm?: number;
  fuente?: FuenteSemilleroMalezas | string;
  profundidadReferenciaCm?: string;
  coberturaHorariaPct?: number;
  horas?: HoraClimaMalezas[];
}

export type ContextoSatelitalMalezas = IContextoSatelitalMalezas;

export interface ResultadoHidrotermalMalezas {
  serie: IPrediccionMalezaDia[];
  httHistorico: number;
  httProyectado7d: number;
  httTotal: number;
  temperaturaReferencia?: number;
  humedadReferencia?: number;
}

export interface ContextoTemporalMalezas {
  seguimiento?: ISeguimientoMalezasLote;
  hoy: string;
  temporada?: Exclude<TTemporadaEmergenciaMaleza, 'todo_el_anio'>;
  reiniciar?: boolean;
}

export interface CampaniaMalezas {
  temporada: Exclude<TTemporadaEmergenciaMaleza, 'todo_el_anio'>;
  fechaInicio: string;
  fechaFin: string;
}

interface ParametrosHidrotermalesMalezas {
  temperaturaBase: number;
  humedadTheta50: number;
  humedadEscala: number;
  deltaHorasDiario: number;
  emergencia: (htt: number) => number;
}

const PROFUNDIDAD_TEMPERATURA_OBJETIVO_CM = 2.5;
const HORAS_ESPERADAS_DIA = 24;
export const MAX_DIAS_CAMPANIA_MALEZAS = 184;

/**
 * Define el biofix estacional del banco de semillas. La siembra no dispara la
 * germinacion: el ciclo se abre por temporada y acumula solo cuando temperatura
 * y humedad superficial son favorables. Un reinicio manual representa una
 * labranza, barbecho quimico u otro control que inicia una camada nueva.
 */
export function resolverSeguimientoMalezasLote(
  contexto: ContextoTemporalMalezas,
): ISeguimientoMalezasLote {
  const hoy =
    fechaValida(contexto.hoy) || new Date().toISOString().slice(0, 10);
  const campania = campaniaMalezasParaFecha(hoy, contexto.temporada);
  const existente = contexto.seguimiento;

  if (contexto.reiniciar) {
    return {
      fechaInicio: hoy,
      origen: 'reinicio_manual',
      temporada: campania.temporada,
      actualizadoEn: new Date().toISOString(),
    };
  }

  if (
    existente?.origen === 'reinicio_manual' &&
    existente.temporada === campania.temporada &&
    !!fechaValida(existente.fechaInicio) &&
    existente.fechaInicio >= campania.fechaInicio &&
    existente.fechaInicio <= hoy
  ) {
    return existente;
  }

  return {
    fechaInicio: campania.fechaInicio,
    origen:
      campania.temporada === 'estival'
        ? 'campania_estival'
        : 'campania_invernal',
    temporada: campania.temporada,
    actualizadoEn: new Date().toISOString(),
  };
}

export function temporadaMalezasActual(
  hoy: string,
): Exclude<TTemporadaEmergenciaMaleza, 'todo_el_anio'> {
  const fecha = fechaValida(hoy) || new Date().toISOString().slice(0, 10);
  const mes = Number(fecha.slice(5, 7));
  return mes >= 9 || mes <= 2 ? 'estival' : 'invernal';
}

export function campaniaMalezasParaFecha(
  hoy: string,
  temporada = temporadaMalezasActual(hoy),
): CampaniaMalezas {
  const fecha = fechaValida(hoy) || new Date().toISOString().slice(0, 10);
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const anioInicio =
    temporada === 'estival' ? (mes <= 2 ? anio - 1 : anio) : anio;
  const fechaInicio =
    temporada === 'estival' ? `${anioInicio}-09-01` : `${anioInicio}-03-01`;
  const fin = new Date(`${fechaInicio}T12:00:00.000Z`);
  fin.setUTCMonth(fin.getUTCMonth() + 6);
  fin.setUTCDate(fin.getUTCDate() - 1);
  return {
    temporada,
    fechaInicio,
    fechaFin: fin.toISOString().slice(0, 10),
  };
}

export function diasSemilleroDesdeOpenMeteo(
  data: any,
  hoy: string,
): DiaClimaMalezas[] {
  const hourly = data?.hourly || {};
  const times: unknown[] = Array.isArray(hourly.time) ? hourly.time : [];
  const porFecha = new Map<string, HoraClimaMalezas[]>();

  times.forEach((rawTime, index) => {
    const timestamp = String(rawTime || '');
    const fecha = timestamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;

    const temperaturaSuelo =
      temperaturaSemillero0a5(
        numero(hourly.soil_temperature_0cm?.[index]),
        numero(hourly.soil_temperature_6cm?.[index]),
      ) ?? numero(hourly.soil_temperature_0_to_7cm?.[index]);
    const humedadSuelo =
      humedadSemillero0a5(
        numero(hourly.soil_moisture_0_to_1cm?.[index]),
        numero(hourly.soil_moisture_1_to_3cm?.[index]),
        numero(hourly.soil_moisture_3_to_9cm?.[index]),
      ) ?? numero(hourly.soil_moisture_0_to_7cm?.[index]);
    const horas = porFecha.get(fecha) || [];
    horas.push({
      timestamp,
      temperaturaSuelo,
      humedadSuelo,
      lluviaMm: numero(hourly.precipitation?.[index]),
      et0Mm: numero(hourly.et0_fao_evapotranspiration?.[index]),
    });
    porFecha.set(fecha, horas);
  });

  return [...porFecha.entries()]
    .map(([fecha, horas]) => {
      const horasValidas = horas.filter(
        (hora) =>
          hora.temperaturaSuelo !== undefined &&
          hora.humedadSuelo !== undefined,
      );
      return {
        fecha,
        tipo: fecha < hoy ? 'historico' : 'pronostico',
        temperaturaSuelo: promedio(
          horasValidas.map((hora) => hora.temperaturaSuelo),
        ),
        humedadSuelo: promedio(horasValidas.map((hora) => hora.humedadSuelo)),
        lluviaMm: suma(horas.map((hora) => hora.lluviaMm)),
        et0Mm: suma(horas.map((hora) => hora.et0Mm)),
        fuente: 'Open-Meteo · semillero 0-5 cm',
        profundidadReferenciaCm: '0-5',
        coberturaHorariaPct: limitar(
          (horasValidas.length / HORAS_ESPERADAS_DIA) * 100,
          0,
          100,
        ),
        horas: horasValidas.length ? horasValidas : undefined,
      } satisfies DiaClimaMalezas;
    })
    .sort((left, right) => left.fecha.localeCompare(right.fecha));
}

/** Open-Meteo superficial manda; la serie canonica completa solo ausencias. */
export function combinarClimaSemillero(
  preferida: DiaClimaMalezas[],
  respaldo: DiaClimaMalezas[],
): DiaClimaMalezas[] {
  const porFecha = new Map(respaldo.map((dia) => [dia.fecha, { ...dia }]));
  for (const dia of preferida) {
    const anterior = porFecha.get(dia.fecha);
    porFecha.set(dia.fecha, {
      ...anterior,
      ...dia,
      temperaturaMedia: dia.temperaturaMedia ?? anterior?.temperaturaMedia,
      temperaturaSuelo: dia.temperaturaSuelo ?? anterior?.temperaturaSuelo,
      humedadSuelo: dia.humedadSuelo ?? anterior?.humedadSuelo,
      lluviaMm: dia.lluviaMm ?? anterior?.lluviaMm,
      et0Mm: dia.et0Mm ?? anterior?.et0Mm,
      fuente: dia.fuente || anterior?.fuente,
      horas: dia.horas?.length ? dia.horas : anterior?.horas,
    });
  }
  return [...porFecha.values()].sort((left, right) =>
    left.fecha.localeCompare(right.fecha),
  );
}

/**
 * Recupera solamente la capa modelada 0-7 cm de la serie canonica. Una sonda
 * Sentek publica profundidades numericas (10, 20, ...); nunca se usan aqui.
 * En una fila `mixed`, el overlay conserva la capa modelada bajo la clave
 * exacta `0-7`, por lo que esa capa sigue siendo segura para el semillero.
 */
export function capaSuperficialModelada(
  capas: unknown,
  fuente: FuenteMeteorologicaNormalizada | string | undefined,
): number | undefined {
  if (
    ['sensor', 'station', 'derived_sensor', 'derived_station'].includes(
      String(fuente || ''),
    )
  ) {
    return undefined;
  }
  if (!capas || typeof capas !== 'object' || Array.isArray(capas)) {
    return undefined;
  }
  return numero((capas as Record<string, unknown>)['0-7']);
}

/**
 * Open-Meteo publica temperatura a 0 y 6 cm. Se interpola a 2,5 cm, centro
 * de la zona de semillas 0-5 cm, sin mezclar temperatura de aire.
 */
export function temperaturaSemillero0a5(
  temperatura0Cm?: number,
  temperatura6Cm?: number,
): number | undefined {
  if (temperatura0Cm === undefined) return temperatura6Cm;
  if (temperatura6Cm === undefined) return temperatura0Cm;
  const proporcion = PROFUNDIDAD_TEMPERATURA_OBJETIVO_CM / 6;
  return temperatura0Cm + (temperatura6Cm - temperatura0Cm) * proporcion;
}

/**
 * Promedio volumetrico de 0-5 cm: 1 cm de 0-1, 2 cm de 1-3 y los primeros
 * 2 cm de la capa 3-9. Exige al menos 3 cm representados para no fabricar una
 * humedad superficial con una unica capa aislada.
 */
export function humedadSemillero0a5(
  humedad0a1?: number,
  humedad1a3?: number,
  humedad3a9?: number,
): number | undefined {
  const capas = [
    { value: humedad0a1, peso: 1 },
    { value: humedad1a3, peso: 2 },
    { value: humedad3a9, peso: 2 },
  ].filter(
    (item): item is { value: number; peso: number } =>
      item.value !== undefined && item.value >= 0 && item.value <= 1,
  );
  const peso = capas.reduce((total, item) => total + item.peso, 0);
  if (peso < 3) return undefined;
  return (
    capas.reduce((total, item) => total + item.value * item.peso, 0) / peso
  );
}

export function calcularSerieHidrotermalMalezas(
  clima: DiaClimaMalezas[],
  parametros: ParametrosHidrotermalesMalezas,
): ResultadoHidrotermalMalezas {
  let httAcumulado = 0;
  let httHistorico = 0;
  let httProyectado7d = 0;
  let temperaturaReferencia: number | undefined;
  let humedadReferencia: number | undefined;

  const serie = clima.map((dia) => {
    const pasos = pasosHidrotermales(dia, parametros.deltaHorasDiario);
    let httDia = 0;
    const temperaturas: number[] = [];
    const humedades: number[] = [];

    for (const paso of pasos) {
      if (
        paso.temperaturaSuelo === undefined ||
        paso.humedadSuelo === undefined
      ) {
        continue;
      }
      temperaturas.push(paso.temperaturaSuelo);
      humedades.push(paso.humedadSuelo);
      const factorTermico = Math.max(
        0,
        paso.temperaturaSuelo - parametros.temperaturaBase,
      );
      const factorHidrico =
        1 /
        (1 +
          Math.exp(
            (parametros.humedadTheta50 - paso.humedadSuelo) /
              parametros.humedadEscala,
          ));
      httDia += factorTermico * factorHidrico * paso.deltaHoras;
    }

    httAcumulado += httDia;
    if (dia.tipo === 'historico') httHistorico += httDia;
    else httProyectado7d += httDia;

    const temperatura = promedio(temperaturas) ?? dia.temperaturaSuelo;
    const humedad = promedio(humedades) ?? dia.humedadSuelo;
    if (temperatura !== undefined) temperaturaReferencia = temperatura;
    if (humedad !== undefined) humedadReferencia = humedad;

    const factorHidricoDiario =
      humedad === undefined
        ? undefined
        : 1 /
          (1 +
            Math.exp(
              (parametros.humedadTheta50 - humedad) / parametros.humedadEscala,
            ));
    return {
      fecha: dia.fecha,
      tipo: dia.tipo,
      temperaturaMedia: redondear(temperatura, 1),
      lluviaMm: redondear(dia.lluviaMm ?? 0, 1),
      et0Mm: redondear(dia.et0Mm ?? 0, 1),
      humedadSueloPct:
        humedad === undefined ? undefined : redondear(humedad * 100, 0),
      factorHidrico: redondear(factorHidricoDiario, 3),
      httDia: redondear(httDia, 1),
      httAcumulado: redondear(httAcumulado, 1),
      emergenciaPct: parametros.emergencia(httAcumulado),
      fuente: dia.fuente,
    } satisfies IPrediccionMalezaDia;
  });

  return {
    serie,
    httHistorico,
    httProyectado7d,
    httTotal: httAcumulado,
    temperaturaReferencia,
    humedadReferencia,
  };
}

export function contextoSatelitalMalezas(
  reporte?: IReporteNDVI,
  hoy = new Date().toISOString().slice(0, 10),
): ContextoSatelitalMalezas {
  const fecha = String(
    reporte?.fechaDeLaImagen || reporte?.fechaDelReporte || '',
  ).slice(0, 10);
  const ndvi = numero(reporte?.indices?.ndvi ?? reporte?.ndviPromedio);
  const ndmi = numero(reporte?.indices?.ndmi);
  const savi = numero(reporte?.indices?.savi);
  const evi = numero(reporte?.indices?.evi);
  const coberturaValidaPct = coberturaSatelital(reporte);
  const diasAntiguedad = fecha ? diferenciaDias(fecha, hoy) : undefined;
  const coberturaValida =
    coberturaValidaPct !== undefined &&
    coberturaValidaPct >= SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT;
  const vigente =
    diasAntiguedad !== undefined && diasAntiguedad >= 0 && diasAntiguedad <= 30;

  if (ndvi === undefined || !coberturaValida || !vigente) {
    return {
      estado: 'no_evaluable',
      etiqueta: 'Superficie sin escena reciente',
      fecha: fecha || undefined,
      confianza: 'baja',
      coberturaValidaPct,
      ndvi,
      ndmi,
      savi,
      evi,
      observacion:
        'El satelite no modifica la emergencia calculada hasta contar con una escena reciente y valida.',
    };
  }

  const estado: IContextoSatelitalMalezas['estado'] =
    ndvi < 0.2 && (savi === undefined || savi < 0.2)
      ? 'suelo_expuesto'
      : ndvi < 0.45
        ? 'vegetacion_incipiente'
        : 'cobertura_activa';
  const indicadores = [ndvi, ndmi, savi, evi].filter(
    (value) => value !== undefined,
  ).length;
  const confianza =
    coberturaValidaPct >= 80 && diasAntiguedad <= 12 && indicadores >= 2
      ? 'alta'
      : 'media';
  const etiqueta =
    estado === 'suelo_expuesto'
      ? 'Suelo mayormente expuesto'
      : estado === 'vegetacion_incipiente'
        ? 'Cobertura verde incipiente'
        : 'Cobertura vegetal activa';

  return {
    estado,
    etiqueta,
    fecha,
    confianza,
    coberturaValidaPct,
    ndvi,
    ndmi,
    savi,
    evi,
    observacion:
      'La serie satelital contextualiza cobertura y vigor; no identifica por si sola la especie ni confirma que la cobertura sea maleza.',
  };
}

function pasosHidrotermales(
  dia: DiaClimaMalezas,
  deltaHorasDiario: number,
): Array<{
  temperaturaSuelo?: number;
  humedadSuelo?: number;
  deltaHoras: number;
}> {
  if (dia.horas?.length) {
    return dia.horas.map((hora) => ({
      temperaturaSuelo: hora.temperaturaSuelo,
      humedadSuelo: hora.humedadSuelo,
      deltaHoras: 1,
    }));
  }
  return [
    {
      temperaturaSuelo: dia.temperaturaSuelo,
      humedadSuelo: dia.humedadSuelo,
      deltaHoras: deltaHorasDiario,
    },
  ];
}

function coberturaSatelital(reporte?: IReporteNDVI): number | undefined {
  const metadata = reporte?.metadataImagen;
  const values = [
    metadata?.renderQa?.ndvi?.validCoveragePct,
    metadata?.indicesStats?.ndvi?.validCoveragePct,
    metadata?.qualityMask?.validCoveragePct,
  ]
    .map(numero)
    .filter((value): value is number => value !== undefined);
  return values.length ? Math.min(...values) : undefined;
}

function diferenciaDias(desde: string, hasta: string): number | undefined {
  const inicio = new Date(`${desde}T00:00:00Z`).getTime();
  const fin = new Date(`${hasta}T00:00:00Z`).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return undefined;
  return Math.floor((fin - inicio) / 86_400_000);
}

function promedio(values: Array<number | undefined>): number | undefined {
  const valid = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  return valid.length
    ? valid.reduce((total, value) => total + value, 0) / valid.length
    : undefined;
}

function suma(values: Array<number | undefined>): number {
  return values.reduce<number>(
    (total, value) => total + (value !== undefined ? value : 0),
    0,
  );
}

function numero(value: unknown): number | undefined {
  const result = Number(value);
  return value !== null && value !== '' && Number.isFinite(result)
    ? result
    : undefined;
}

function fechaValida(value: unknown): string | undefined {
  const fecha = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return undefined;
  const parsed = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === fecha
    ? fecha
    : undefined;
}

function redondear(
  value: number | undefined,
  digits: number,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function limitar(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
