import { IDispositivo, ILote, IResultadoPrediccionRiego, ISiembra } from 'modelos/src';

export type EstadoRecomendacionRiego = 'calculada' | 'estimada' | 'no_disponible' | 'fallida';
export type FuenteRecomendacionRiego = 'sensor_suelo' | 'balance_climatico';
export type OrigenEstadoRecomendacion = 'explicito' | 'legacy_v13' | 'legacy_sensor' | 'sin_estado';
export type EstadoAguaUtil = NonNullable<ISiembra['estadoCalculoAguaUtil']>;

type SiembraRiegoCompatible = ISiembra & {
  estadoRecomendacionRiego?: EstadoRecomendacionRiego;
  fuenteRecomendacionRiego?: FuenteRecomendacionRiego | null;
};

export interface EvaluacionRiegoFrontend {
  estado?: EstadoRecomendacionRiego;
  fuente?: FuenteRecomendacionRiego;
  origenEstado: OrigenEstadoRecomendacion;
  tieneSensor: boolean;
  serieDisponible: boolean;
  serie: IResultadoPrediccionRiego[];
  aportesPositivos: IResultadoPrediccionRiego[];
  cantidadHoy: number | null;
  sinDemanda: boolean;
  esEstimada: boolean;
  esCalculada: boolean;
  estadoAguaUtil: EstadoAguaUtil;
  aguaUtilValor: number | null;
  aguaUtilEstimada: boolean;
}

const ESTADOS_RECOMENDACION = new Set<EstadoRecomendacionRiego>(['calculada', 'estimada', 'no_disponible', 'fallida']);
const FUENTES_RECOMENDACION = new Set<FuenteRecomendacionRiego>(['sensor_suelo', 'balance_climatico']);

export function evaluarRiegoFrontend(siembra?: ISiembra, lote?: ILote): EvaluacionRiegoFrontend {
  const compatible = siembra as SiembraRiegoCompatible | undefined;
  const tieneSensor = tieneSensorHumedadSuelo(lote);
  const serieOriginal = Array.isArray(siembra?.ultimaPrediccionRiego) ? siembra.ultimaPrediccionRiego : [];
  const serieValida = serieOriginal.filter((item) => cantidadRiegoValida(item) !== null);
  const estadoExplicito = estadoRecomendacionValido(compatible?.estadoRecomendacionRiego);
  const fuenteExplicita = fuenteRecomendacionValida(compatible?.fuenteRecomendacionRiego);
  const legacyV13 =
    !estadoExplicito && serieValida.length > 0 && motivoIdentificaBalanceEstimado(siembra?.motivoCalculoAguaUtil);
  const legacySensor =
    !estadoExplicito &&
    !legacyV13 &&
    tieneSensor &&
    serieValida.length > 0 &&
    siembra?.estadoCalculoAguaUtil === 'calculado';

  const estado = estadoExplicito || (legacyV13 ? 'estimada' : legacySensor ? 'calculada' : undefined);
  const origenEstado: OrigenEstadoRecomendacion = estadoExplicito
    ? 'explicito'
    : legacyV13
      ? 'legacy_v13'
      : legacySensor
        ? 'legacy_sensor'
        : 'sin_estado';
  const fuente = resolverFuente(estado, fuenteExplicita, tieneSensor, legacyV13);
  const estadoHabilitaSerie = estado === 'calculada' || estado === 'estimada';
  const fuenteHabilitaSerie = fuente === 'sensor_suelo' || fuente === 'balance_climatico';
  const serieDisponible = estadoHabilitaSerie && fuenteHabilitaSerie && serieValida.length > 0;
  const serie = serieDisponible ? serieValida : [];
  const aportesPositivos = serie.filter((item) => {
    const cantidad = cantidadRiegoValida(item);
    return cantidad !== null && cantidad > 0;
  });
  const cantidadHoy = serieDisponible ? cantidadRiegoValida(serieOriginal[0]) : null;
  const esEstimada = estado === 'estimada';
  const estadoAguaUtil = siembra?.estadoCalculoAguaUtil || 'no_disponible';
  const aguaUtil = siembra?.aguaUtilReal;
  const aguaUtilValor =
    (estadoAguaUtil === 'calculado' || estadoAguaUtil === 'estimado') &&
    typeof aguaUtil === 'number' &&
    Number.isFinite(aguaUtil) &&
    aguaUtil >= 0
      ? aguaUtil
      : null;

  return {
    estado,
    fuente,
    origenEstado,
    tieneSensor,
    serieDisponible,
    serie,
    aportesPositivos,
    cantidadHoy,
    sinDemanda: serieDisponible && aportesPositivos.length === 0,
    esEstimada,
    esCalculada: estado === 'calculada' && !esEstimada,
    estadoAguaUtil,
    aguaUtilValor,
    aguaUtilEstimada: estadoAguaUtil === 'estimado' && aguaUtilValor !== null,
  };
}

export function cantidadRiegoValida(item?: IResultadoPrediccionRiego): number | null {
  const value = item?.cantidad;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function tieneSensorHumedadSuelo(lote?: ILote): boolean {
  if (lote?.sondaSuelo || lote?.idSondaSuelo) return true;
  return !!lote?.dispositivos?.some((item: IDispositivo) => {
    const tipo = normalizarTexto(item.tipo);
    return tipo.includes('sensor') && tipo.includes('humedad') && tipo.includes('suelo');
  });
}

export function motivoIdentificaBalanceEstimado(motivo?: string): boolean {
  const normalizado = normalizarTexto(motivo);
  return normalizado.includes('recomendacion') && normalizado.includes('estimad') && normalizado.includes('balance');
}

function estadoRecomendacionValido(value?: string): EstadoRecomendacionRiego | undefined {
  return ESTADOS_RECOMENDACION.has(value as EstadoRecomendacionRiego) ? (value as EstadoRecomendacionRiego) : undefined;
}

function fuenteRecomendacionValida(value?: string | null): FuenteRecomendacionRiego | undefined {
  return FUENTES_RECOMENDACION.has(value as FuenteRecomendacionRiego) ? (value as FuenteRecomendacionRiego) : undefined;
}

function resolverFuente(
  estado: EstadoRecomendacionRiego | undefined,
  fuenteExplicita: FuenteRecomendacionRiego | undefined,
  tieneSensor: boolean,
  legacyV13: boolean
): FuenteRecomendacionRiego | undefined {
  if (estado === 'fallida' || estado === 'no_disponible') return undefined;
  if (legacyV13 || estado === 'estimada') return 'balance_climatico';
  if (
    estado === 'calculada' &&
    (fuenteExplicita === 'sensor_suelo' || tieneSensor)
  ) {
    return 'sensor_suelo';
  }
  return undefined;
}

function normalizarTexto(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
