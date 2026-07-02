import {
  Cultivo,
  IClimaEstacionMeteorologica,
  ICrono,
  ILote,
  IPronosticoEstacionMeteorologica,
  IPronosticoRiego,
  ISiembra,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';
import { ResultadoRiegoV12 } from './riego-v12.engine';

export function calcularRiegoV13Estimado(params: {
  siembra: ISiembra;
  lote: ILote;
  cultivo: Cultivo;
  crono: ICrono;
  lluviaHistorica: IClimaEstacionMeteorologica[];
  pronostico7Dias: IPronosticoEstacionMeteorologica[];
}): ResultadoRiegoV12 {
  const pronostico7Dias = (params.pronostico7Dias || []).slice(0, 7);
  const lluviaHistorica = params.lluviaHistorica || [];
  const et0Promedio = HelperService.getEt0Promedio(pronostico7Dias);
  const umbralDeRiego = HelperService.getUmbralDeRiego(params.cultivo, et0Promedio);
  const diasDesdeSiembra = diasDesde(params.siembra.fechaSiembra);

  const consumo = pronostico7Dias.map((pronostico, index) => {
    const kc = getKcSeguro(diasDesdeSiembra + index, params.cultivo, params.crono);
    const et0 = Number(pronostico.et0 || et0Promedio || 0);
    const lluvia = lluviaProbable(pronostico);
    const consumoAgua = redondear(et0 * kc, 2);
    return {
      fecha: pronostico.fecha?.slice(0, 10) || fechaDesdeHoy(index),
      et0: redondear(et0, 2),
      kc,
      consumoAgua,
      lluvias: lluvia,
    };
  });

  const demanda3Dias = redondear(sum(consumo.slice(0, 3).map((item) => item.consumoAgua)), 2);
  const lluviaEfectiva72h = redondear(sum(consumo.slice(0, 3).map((item) => item.lluvias)), 2);
  const lluviaReciente7d = redondear(sumarLluviaReciente(lluviaHistorica, 7), 2);
  const deficitMm = redondear(Math.max(0, demanda3Dias - lluviaEfectiva72h - lluviaReciente7d * 0.2), 2);
  const capacidadDiaria = Math.max(0, Number(params.lote.capacidadDeRiego || 6));
  const recomendacionHoyMm = deficitMm >= 6 ? redondear(Math.min(deficitMm, capacidadDiaria), 1) : 0;

  let saldoEstimado = redondear(lluviaReciente7d * 0.35, 2);
  const pronosticosRiego: IPronosticoRiego[] = consumo.map((item, index) => {
    saldoEstimado = redondear(saldoEstimado - item.consumoAgua + item.lluvias, 2);
    const regar = index === 0 ? recomendacionHoyMm > 0 : saldoEstimado < -6;
    return {
      fecha: item.fecha,
      regar,
      afd: undefined,
      et0: item.et0,
      kc: item.kc,
      consumoAgua: item.consumoAgua,
      lluvias: item.lluvias,
      saldoDiario: saldoEstimado,
      previsionConsumo3Dias: demanda3Dias,
    };
  });

  const cobertura = pronostico7Dias.length / 7;
  const nivel = pronostico7Dias.length >= 5 && lluviaHistorica.length >= 24 ? 'media' : 'baja';

  return {
    nivelesCapacidadCampo: [],
    nivelesLecturaSensor: [],
    calculoRaices: [],
    pronosticosRiego,
    et0Promedio,
    umbralDeRiego,
    capacidadRetencionTotal: 0,
    aguaUtilFacilmenteDisponiblePotencial: 0,
    aguaUtilFacilmenteDisponibleReal: 0,
    aguaUtilPct: 0,
    deficitMm,
    demanda3Dias,
    lluviaEfectiva72h,
    recomendacionHoyMm,
    estadoCalculoAguaUtil: 'no_disponible',
    motivoCalculoAguaUtil:
      'Sin lanza/sonda de humedad: recomendacion estimada por balance ET0, Kc, lluvia reciente y pronostico.',
    nivelesConRaicesDetectadas: 0,
    nivelesConDatosDisponibles: 0,
    estadoCapacidadCampo: 'no_disponible',
    motivoCapacidadCampo:
      'No se estima capacidad de campo sin lecturas de humedad de suelo por profundidad.',
    trazas: [
      'V13 estimado: se activa cuando el lote no tiene lanza/sonda con datos recientes.',
      'No calcula agua util real: proyecta deficit potencial con ET0, Kc, lluvia reciente y pronostico.',
      'La recomendacion debe mostrarse como estimada y no reemplaza la medicion de suelo.',
    ],
    calidadDatos: {
      nivel,
      fuente: 'mixto',
      cobertura: redondear(cobertura, 2),
      fallback: true,
      resumen:
        nivel === 'media'
          ? 'Estimacion climatica sin sensor de suelo; cobertura suficiente de pronostico y lluvia.'
          : 'Estimacion climatica de baja confianza; faltan sensor de suelo o cobertura climatica completa.',
      limitaciones: [
        'No hay humedad de suelo real por profundidad.',
        'No detecta raices activas ni ascenso capilar.',
        'Usar como orientacion operativa hasta instalar o reasignar una lanza/sonda.',
      ],
    },
  };
}

function getKcSeguro(dias: number, cultivo: Cultivo, crono: ICrono): number {
  try {
    const kc = HelperService.getKc(dias, cultivo, crono);
    return Number.isFinite(kc) ? redondear(kc, 2) : 0.85;
  } catch (_error) {
    return 0.85;
  }
}

function lluviaProbable(pronostico: IPronosticoEstacionMeteorologica): number {
  const prob = Number(pronostico.probabilidadLluvia || 0);
  const lluvia = Number(pronostico.lluvia || 0);
  if (!Number.isFinite(lluvia) || lluvia <= 0) {
    return 0;
  }
  if (prob >= 70) {
    return redondear(lluvia * 0.85, 2);
  }
  if (prob >= 45) {
    return redondear(lluvia * 0.5, 2);
  }
  return 0;
}

function sumarLluviaReciente(
  historico: IClimaEstacionMeteorologica[],
  dias: number,
): number {
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  return sum(
    historico
      .filter((item) => new Date(item.fecha || 0).getTime() >= desde)
      .map((item) => Number(item.lluvia?.sum ?? item.lluvia?.last ?? item.lluvia?.avg ?? 0)),
  );
}

function diasDesde(fecha?: string): number {
  const desde = fecha ? new Date(fecha).getTime() : Date.now();
  if (!Number.isFinite(desde)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - desde) / (24 * 60 * 60 * 1000)));
}

function fechaDesdeHoy(offset: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + offset);
  return fecha.toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function redondear(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
