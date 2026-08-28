import {
  CodigoEtapaArveja,
  FuenteClima,
  FuenteMeteorologicaNormalizada,
  ICalidadDatoMotor,
  IClimaEstacionMeteorologica,
  IRespuestaAgrometeorologiaSiembra,
  ISerieAgrometeorologicaDia,
} from 'modelos/src';

export type CultivoSanitarioCanonico = 'Trigo' | 'Cebada' | 'Arveja';

export interface IDiaSanitarioCanonico {
  fecha: string;
  serie: ISerieAgrometeorologicaDia;
  clima: IClimaEstacionMeteorologica;
  calidadClima: ICalidadDatoMotor;
  etapaNumero?: number;
  etapaArveja?: CodigoEtapaArveja;
  etapaHabilitante: boolean;
  climaHabilitante: boolean;
  motivosNoHabilitante: string[];
}

const FUENTES_ETAPA_DECISION = new Set([
  'campo',
  'proyeccion_anclada_campo',
  'gdd_validado',
]);

const esFinito = (value: unknown): value is number =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  typeof value !== 'boolean' &&
  Number.isFinite(Number(value));

const numero = (...values: unknown[]): number | undefined => {
  const value = values.find(esFinito);
  return value === undefined ? undefined : Number(value);
};

const normalizar = (value?: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const fuenteClima = (
  source: FuenteMeteorologicaNormalizada,
): FuenteClima | undefined => {
  const value = String(source || '');
  if (value.includes('sensor')) return 'Dispositivo';
  if (value.includes('station')) return 'FieldClimate';
  if (value.includes('open_meteo') || value === 'gap_filled') {
    return 'OpenMeteo';
  }
  if (value.includes('chaman_meteo')) return 'ChamanMeteo';
  return undefined;
};

const fuenteCalidad = (
  source: FuenteMeteorologicaNormalizada,
): ICalidadDatoMotor['fuente'] => {
  const value = String(source || '');
  if (value.includes('sensor')) return 'sensor_campo';
  if (value.includes('station')) return 'estacion_asignada';
  if (value.includes('open_meteo') || value === 'gap_filled') {
    return 'open_meteo';
  }
  if (value.includes('chaman_meteo')) return 'chaman_meteo';
  return 'mixto';
};

function resolverEtapaNumero(
  cultivo: Exclude<CultivoSanitarioCanonico, 'Arveja'>,
  stage?: string,
): number | undefined {
  const value = normalizar(stage);
  if (!value) return undefined;
  const stages =
    cultivo === 'Trigo'
      ? [
          ['siembra'],
          ['emergencia', 'macollaje'],
          ['espiguilla terminal', 'primer nudo', 'encanado'],
          ['hoja bandera'],
          ['espigazon'],
          ['antesis', 'floracion'],
          ['llenado de granos', 'llenado'],
          ['madurez fisiologica', 'madurez'],
        ]
      : [
          ['siembra'],
          ['emergencia'],
          ['primer nudo', 'macollaje', 'encanado'],
          ['hoja bandera'],
          ['espigazon'],
          ['antesis', 'floracion'],
          ['llenado de granos', 'llenado'],
          ['madurez fisiologica', 'madurez'],
        ];
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (stages[index].some((label) => value.includes(label))) return index;
  }
  return undefined;
}

function resolverEtapaArveja(stage?: string): CodigoEtapaArveja | undefined {
  const value = normalizar(stage);
  if (!value) return undefined;
  if (/(^| )mf( |$)/.test(value) || value.includes('madurez fisiologica')) {
    return 'MF';
  }
  if (
    /(^| )r3( |$)/.test(value) ||
    value.includes('formacion de vainas') ||
    value.includes('fin de floracion')
  ) {
    return 'R3';
  }
  if (/(^| )r1( |$)/.test(value) || value.includes('inicio de floracion')) {
    return 'R1';
  }
  if (
    /(^| )e( |$)/.test(value) ||
    value.includes('emergencia') ||
    value.includes('desarrollo vegetativo')
  ) {
    return 'E';
  }
  if (/(^| )s( |$)/.test(value) || value.includes('siembra')) return 'S';
  return undefined;
}

function flagsClimaBloqueantes(serie: ISerieAgrometeorologicaDia): string[] {
  const flags = serie.qualityFlags || [];
  return flags.filter(
    (flag) =>
      flag === 'partial_hourly_daily_temperature' ||
      flag === 'insufficient_hourly_temperature_coverage_for_daily_aggregate' ||
      flag === 'insufficient_hourly_humidity_coverage_for_daily_aggregate' ||
      flag === 'insufficient_hourly_precipitation_coverage_for_daily_total',
  );
}

function crearCalidadClima(
  serie: ISerieAgrometeorologicaDia,
  response: IRespuestaAgrometeorologiaSiembra,
  climaHabilitante: boolean,
  faltantes: string[],
  bloqueos: string[],
): ICalidadDatoMotor {
  const completeness = Number(response.dataSource?.completenessPercentage);
  const cobertura = Number.isFinite(completeness)
    ? Math.max(0, Math.min(1, completeness / 100))
    : climaHabilitante
      ? 1
      : 0;
  const source = fuenteCalidad(serie.source);
  return {
    nivel: climaHabilitante
      ? source === 'sensor_campo'
        ? 'alta'
        : 'media'
      : 'sin_datos',
    fuente: source,
    cobertura,
    fallback: !climaHabilitante,
    resumen: climaHabilitante
      ? 'Serie diaria del motor agrometeorologico canonico de la siembra.'
      : 'El motor sanitario no calculo una salida alertable porque la serie canonica es incompleta.',
    limitaciones: [
      ...faltantes.map((item) => `Variable canonica faltante: ${item}.`),
      ...bloqueos.map((item) => `Bandera de calidad canonica: ${item}.`),
      ...(serie.warnings || []),
    ],
  };
}

/**
 * Adapta exclusivamente la respuesta canónica de la siembra. No consulta una
 * estación paralela, no recalcula GDD y no inventa una temperatura base.
 */
export function construirDiasSanitariosCanonicos(
  response: IRespuestaAgrometeorologiaSiembra | undefined,
  cultivo: CultivoSanitarioCanonico,
): IDiaSanitarioCanonico[] {
  if (!response?.series?.length) return [];
  return response.series
    .filter(
      (serie) =>
        !serie.isForecast &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(serie.date || '').slice(0, 10)),
    )
    .map((serie) => {
      const weather = serie.weather || {};
      const metrics = serie.metrics || {};
      const tavg = numero(
        weather.temperatureMeanC,
        weather.temperatureC,
        metrics.temperatureMeanC,
      );
      const tmin = numero(weather.temperatureMinC, metrics.temperatureMinC);
      const tmax = numero(weather.temperatureMaxC, metrics.temperatureMaxC);
      const hr = numero(
        weather.relativeHumidityMeanPct,
        weather.relativeHumidityPct,
        metrics.relativeHumidityMeanPct,
      );
      const precip = numero(
        weather.precipitationMm,
        weather.rainMm,
        metrics.precipitationMm,
      );
      const viento = numero(weather.windSpeedMs);
      const faltantes = [
        ['temperaturaMinC', tmin],
        ['temperaturaMeanC', tavg],
        ['temperaturaMaxC', tmax],
        ['relativeHumidityMeanPct', hr],
        ['precipitationMm', precip],
      ]
        .filter(([, value]) => !esFinito(value))
        .map(([name]) => String(name));
      const bloqueos = flagsClimaBloqueantes(serie);
      const climaHabilitante = faltantes.length === 0 && bloqueos.length === 0;
      const etapaNumero =
        cultivo === 'Arveja'
          ? undefined
          : resolverEtapaNumero(cultivo, serie.stage);
      const etapaArveja =
        cultivo === 'Arveja' ? resolverEtapaArveja(serie.stage) : undefined;
      const etapaReconocida =
        cultivo === 'Arveja'
          ? etapaArveja !== undefined
          : etapaNumero !== undefined;
      const fuenteEtapaHabilitante = FUENTES_ETAPA_DECISION.has(
        String(serie.stageSource || ''),
      );
      const acumulacionGddLista =
        serie.stageSource !== 'gdd_validado' ||
        (metrics.gddAccumulationComplete === true &&
          !serie.qualityFlags?.includes('incomplete_gdd_accumulation'));
      const etapaHabilitante =
        etapaReconocida &&
        fuenteEtapaHabilitante &&
        serie.stageConfidence !== 'referencia' &&
        acumulacionGddLista;
      const motivosNoHabilitante = [
        ...(!etapaReconocida
          ? ['Etapa canonica ausente o no reconocida para el cultivo.']
          : []),
        ...(!fuenteEtapaHabilitante
          ? [
              `La fuente de etapa ${serie.stageSource || 'sin fuente'} es solo de referencia y no abre alertas sanitarias.`,
            ]
          : []),
        ...(serie.stageConfidence === 'referencia'
          ? ['La confianza fenologica canonica es de referencia.']
          : []),
        ...(!acumulacionGddLista
          ? [
              'La acumulacion GDD canonica esta incompleta; las compuertas termicas permanecen cerradas.',
            ]
          : []),
        ...faltantes.map((item) => `Falta ${item} en la serie canonica.`),
        ...bloqueos.map((item) => `Calidad meteorologica bloqueante: ${item}.`),
      ];
      const calidadClima = crearCalidadClima(
        serie,
        response,
        climaHabilitante,
        faltantes,
        bloqueos,
      );
      const fecha = String(serie.date).slice(0, 10);
      return {
        fecha,
        serie,
        etapaNumero,
        etapaArveja,
        etapaHabilitante,
        climaHabilitante,
        motivosNoHabilitante,
        calidadClima,
        clima: {
          fecha: `${fecha}T12:00:00.000Z`,
          fuente: fuenteClima(serie.source),
          estacion:
            response.dataSource?.stationName ||
            `agrometeorologia:${response.dataSource?.type || serie.source}`,
          distancia: 0,
          temperatura: {
            min: tmin,
            avg: tavg,
            max: tmax,
          },
          humedad: { avg: hr },
          lluvia: { sum: precip },
          velocidadViento: { avg: viento },
          calidadDatos: calidadClima,
        },
      } satisfies IDiaSanitarioCanonico;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function indiceEtapaArveja(codigo: CodigoEtapaArveja): number {
  return ({ S: 0, E: 1, R1: 2, R3: 3, MF: 4 } as const)[codigo];
}

export function nombreEtapaArveja(codigo: CodigoEtapaArveja): string {
  return (
    {
      S: 'S - Siembra / preemergencia',
      E: 'E - Emergencia y desarrollo vegetativo',
      R1: 'R1 - Inicio de floracion',
      R3: 'R3 - Fin de floracion / formacion de vainas',
      MF: 'MF - Madurez fisiologica',
    } as const
  )[codigo];
}
