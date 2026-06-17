import {
  Cultivo,
  ICalculoRaices,
  IClimaEstacionMeteorologica,
  ICrono,
  IValores,
  ILote,
  INivelCapacidadCampo,
  INivelLecturaSensor,
  IPronosticoEstacionMeteorologica,
  IPronosticoRiego,
  ISiembra,
  ISuelo,
} from 'modelos/src';
import { HelperService } from '../../auxiliares/helper';

const SENTEK_RAW_HUMIDITY_MAX = 3;
const SENTEK_SCALED_HUMIDITY_MAX = 300;

type EstadoCalculo = 'calculado' | 'estimado' | 'no_disponible' | 'fallida';
type FuenteCapacidadCampo = 'auto' | 'manual' | 'textura';

interface CapacidadCampoEstimacion {
  capacidadCampo: number;
  fuenteCapacidadCampo: FuenteCapacidadCampo;
  confianzaCapacidadCampo: number;
  muestras: number;
}

interface VentanaDiaNoche {
  registros: IClimaEstacionMeteorologica[];
  primerDia?: IClimaEstacionMeteorologica;
  ultimoDia?: IClimaEstacionMeteorologica;
  primerNoche?: IClimaEstacionMeteorologica;
  ultimoNoche?: IClimaEstacionMeteorologica;
  horasDia: number;
  horasNoche: number;
  lluvia24h: number;
}

interface NivelDiagnostico {
  nivel: number;
  profundidad?: number;
  humedadActual?: number;
  capacidadCampo?: number;
  puntoMarchitez?: number;
  fuenteCapacidadCampo?: FuenteCapacidadCampo;
  confianzaCapacidadCampo?: number;
  hayRaices?: boolean;
  deficitMm?: number;
  aguaUtilActualMm?: number;
  aguaTotalDisponibleMm?: number;
  aguaUtilPct?: number;
  trazas: string[];
}

export interface ResultadoRiegoV12 {
  nivelesCapacidadCampo: INivelCapacidadCampo[];
  nivelesLecturaSensor: INivelLecturaSensor[];
  calculoRaices: ICalculoRaices[];
  pronosticosRiego: IPronosticoRiego[];
  et0Promedio: number;
  umbralDeRiego: number;
  capacidadRetencionTotal: number;
  aguaUtilFacilmenteDisponiblePotencial: number;
  aguaUtilFacilmenteDisponibleReal: number;
  aguaUtilPct: number;
  deficitMm: number;
  demanda3Dias: number;
  lluviaEfectiva72h: number;
  recomendacionHoyMm: number;
  estadoCalculoAguaUtil: EstadoCalculo;
  motivoCalculoAguaUtil: string;
  nivelesConRaicesDetectadas: number;
  nivelesConDatosDisponibles: number;
  trazas: string[];
  estadoCapacidadCampo: EstadoCalculo;
  motivoCapacidadCampo: string;
}

export function calcularRiegoV12(params: {
  siembra: ISiembra;
  lote: ILote;
  cultivo: Cultivo;
  crono: ICrono;
  suelo: ISuelo[];
  humedadSuelo: IClimaEstacionMeteorologica[];
  lluviaHistorica: IClimaEstacionMeteorologica[];
  pronostico7Dias: IPronosticoEstacionMeteorologica[];
}): ResultadoRiegoV12 {
  const trazas: string[] = [];
  const humedadSuelo = ordenarPorFecha(params.humedadSuelo || []);
  const lluviaHistorica = ordenarPorFecha(params.lluviaHistorica || []);
  const pronostico7Dias = (params.pronostico7Dias || []).slice(0, 7);
  const sueloBase = normalizarSuelos(params.suelo, humedadSuelo);

  if (!humedadSuelo.length) {
    return resultadoFallido('No hay lecturas de lanza/sonda de humedad de suelo.');
  }
  if (!pronostico7Dias.length) {
    return resultadoFallido('No hay pronostico con ET0 para proyectar demanda.');
  }

  const et0Promedio = HelperService.getEt0Promedio(pronostico7Dias);
  const umbralDeRiego = HelperService.getUmbralDeRiego(params.cultivo, et0Promedio);
  const ventana = construirVentanaDiaNoche(humedadSuelo, lluviaHistorica);
  const ultimo = humedadSuelo[humedadSuelo.length - 1];
  const diagnosticos: NivelDiagnostico[] = [];
  const calculoRaices: ICalculoRaices[] = [];
  let nivelesConDatosDisponibles = 0;
  let nivelesConRaicesDetectadas = 0;

  for (const suelo of sueloBase) {
    const nivel = suelo.numeroDeSensor || suelo.profundidad || 0;
    const profundidad = suelo.profundidad || inferirProfundidadCm(nivel);
    const humedadActual = leerHumedad(ultimo, suelo);
    const candidato = estimarCapacidadCampoPorNivel(
      humedadSuelo,
      lluviaHistorica,
      suelo,
      params.lote,
    );
    const capacidadCampo = candidato.capacidadCampo;
    const puntoMarchitez = normalizarPct(
      suelo.puntoMarchitez ?? params.lote.puntoMarchitez ?? capacidadCampo * 0.45,
    );
    const raiz = detectarRaicesPorNivelV12(ventana, suelo, capacidadCampo, puntoMarchitez);

    calculoRaices.push(raiz);

    if (humedadActual != null) {
      nivelesConDatosDisponibles += 1;
    }
    if (raiz.hayRaices === true || suelo.hayRaices === true) {
      nivelesConRaicesDetectadas += 1;
    }

    diagnosticos.push(
      calcularNivel(
        suelo,
        profundidad,
        humedadActual,
        capacidadCampo,
        puntoMarchitez,
        raiz,
        candidato,
        params.lote,
      ),
    );
  }

  const nivelesActivos = diagnosticos.filter((nivel) => nivel.hayRaices === true);
  const nivelesParaBalance = nivelesActivos.length ? nivelesActivos : diagnosticos.filter((nivel) => nivel.humedadActual != null);

  const aguaUtilFacilmenteDisponibleReal = redondear(
    sumar(nivelesParaBalance.map((nivel) => nivel.aguaUtilActualMm || 0)),
    2,
  );
  const aguaUtilFacilmenteDisponiblePotencial = redondear(
    sumar(nivelesParaBalance.map((nivel) => nivel.aguaTotalDisponibleMm || 0)) * umbralDeRiego,
    2,
  );
  const capacidadRetencionTotal = redondear(
    sumar(nivelesParaBalance.map((nivel) => calcularMm(nivel.capacidadCampo || 0, nivel.profundidad || 10, params.lote))),
    2,
  );
  const deficitMm = redondear(sumar(nivelesParaBalance.map((nivel) => nivel.deficitMm || 0)), 2);
  const aguaTotalDisponible = sumar(nivelesParaBalance.map((nivel) => nivel.aguaTotalDisponibleMm || 0));
  const aguaUtilPct = redondear(aguaTotalDisponible > 0 ? (aguaUtilFacilmenteDisponibleReal / aguaTotalDisponible) * 100 : 0, 1);

  const { pronosticosRiego, demanda3Dias, lluviaEfectiva72h, recomendacionHoyMm } = calcularPronosticoRiegoV12({
    pronostico7Dias,
    siembra: params.siembra,
    cultivo: params.cultivo,
    crono: params.crono,
    aguaUtilActualMm: aguaUtilFacilmenteDisponibleReal,
    aguaTotalDisponibleMm: Math.max(aguaTotalDisponible, aguaUtilFacilmenteDisponiblePotencial),
    deficitMm,
    capacidadDeRiego: params.lote.capacidadDeRiego || 6,
    umbralAguaUtilPct: Math.max(20, Math.min(65, umbralDeRiego * 100)),
  });

  const nivelesCapacidadCampo: INivelCapacidadCampo[] = diagnosticos.map((nivel) => ({
    profundidad: nivel.profundidad,
    capacidadCampo: redondear(nivel.capacidadCampo || 0, 2),
    aguaUtil: redondear(nivel.aguaTotalDisponibleMm || 0, 2),
    fraccionDeConsumo: redondear((nivel.aguaTotalDisponibleMm || 0) * umbralDeRiego, 2),
    capacidadDeRetencion: redondear(calcularMm(nivel.capacidadCampo || 0, nivel.profundidad || 10, params.lote), 2),
    aguaUtilFacilmenteDisponible: redondear((nivel.aguaTotalDisponibleMm || 0) * umbralDeRiego, 2),
    humedadSueloLeida: nivel.humedadActual,
    puntoMarchitez: nivel.puntoMarchitez,
    fuenteCapacidadCampo: nivel.fuenteCapacidadCampo,
    confianzaCapacidadCampo: nivel.confianzaCapacidadCampo,
  }));

  const nivelesLecturaSensor: INivelLecturaSensor[] = diagnosticos.map((nivel) => ({
    numeroDeSensor: nivel.nivel,
    humedad: nivel.humedadActual,
    profundidad: nivel.profundidad,
    aguaUtil: redondear(nivel.aguaUtilActualMm || 0, 2),
    fraccionDeConsumo: redondear((nivel.aguaTotalDisponibleMm || 0) * umbralDeRiego, 2),
    capacidadDeRetencion: redondear(calcularMm(nivel.capacidadCampo || 0, nivel.profundidad || 10, params.lote), 2),
    aguaUtilFacilmenteDisponible: redondear(nivel.aguaUtilActualMm || 0, 2),
    humedadSueloLeida: nivel.humedadActual,
    capacidadCampo: nivel.capacidadCampo,
    puntoMarchitez: nivel.puntoMarchitez,
    aguaUtilPct: nivel.aguaUtilPct,
    deficitMm: nivel.deficitMm,
    hayRaices: nivel.hayRaices,
    fuenteCapacidadCampo: nivel.fuenteCapacidadCampo,
    confianzaCapacidadCampo: nivel.confianzaCapacidadCampo,
  }));

  trazas.push('V12: prioridad lanza/sonda de humedad; clima y pronostico se usan para lluvia, ET0 y balance.');
  trazas.push('Raices: ventana dia/noche, radiacion > 1, lluvia < 1 mm, pendientes y relacion dia/noche del Excel.');
  trazas.push('Capacidad de campo automatica: candidatos sin lluvia, drenaje claro, relacion dia/noche alta y pendiente nocturna negativa.');
  trazas.push('Agua util real: (humedad actual - PMP) por profundidad efectiva y area mojada; se limita entre 0 y CC-PMP.');

  const estadoCapacidadCampo = diagnosticos.some((nivel) => nivel.fuenteCapacidadCampo === 'auto')
    ? 'calculado'
    : diagnosticos.some((nivel) => nivel.fuenteCapacidadCampo === 'manual')
      ? 'estimado'
      : 'no_disponible';

  return {
    nivelesCapacidadCampo,
    nivelesLecturaSensor,
    calculoRaices,
    pronosticosRiego,
    et0Promedio,
    umbralDeRiego,
    capacidadRetencionTotal,
    aguaUtilFacilmenteDisponiblePotencial,
    aguaUtilFacilmenteDisponibleReal,
    aguaUtilPct,
    deficitMm,
    demanda3Dias,
    lluviaEfectiva72h,
    recomendacionHoyMm,
    estadoCalculoAguaUtil: nivelesConDatosDisponibles ? (nivelesActivos.length ? 'calculado' : 'estimado') : 'fallida',
    motivoCalculoAguaUtil: nivelesConDatosDisponibles
      ? nivelesActivos.length
        ? 'Calculado con niveles donde se detecta consumo compatible con raices.'
        : 'Estimado con humedad disponible; no se detecto raiz activa en la ventana dia/noche.'
      : 'No hay humedad de suelo disponible.',
    nivelesConRaicesDetectadas,
    nivelesConDatosDisponibles,
    trazas,
    estadoCapacidadCampo,
    motivoCapacidadCampo:
      estadoCapacidadCampo === 'calculado'
        ? 'Capacidad de campo estimada automaticamente con eventos validos.'
        : 'Usa capacidad de campo cargada o valor tecnico por textura hasta tener eventos validos.',
  };
}

export function normalizarHumedadSueloPct(value?: number | null): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return undefined;
  let actual = raw;
  if (raw > 100 && raw <= SENTEK_SCALED_HUMIDITY_MAX) {
    actual = (raw / SENTEK_SCALED_HUMIDITY_MAX) * 100;
  } else if (raw >= 0 && raw <= SENTEK_RAW_HUMIDITY_MAX) {
    actual = (raw / SENTEK_RAW_HUMIDITY_MAX) * 100;
  } else if (raw > SENTEK_SCALED_HUMIDITY_MAX && raw <= 1000) {
    actual = raw / 10;
  } else if (raw >= 0 && raw <= 1) {
    actual = raw * 100;
  }
  return redondear(clamp(actual, 0, 100), 2);
}

function resultadoFallido(motivo: string): ResultadoRiegoV12 {
  return {
    nivelesCapacidadCampo: [],
    nivelesLecturaSensor: [],
    calculoRaices: [],
    pronosticosRiego: [],
    et0Promedio: 0,
    umbralDeRiego: 0,
    capacidadRetencionTotal: 0,
    aguaUtilFacilmenteDisponiblePotencial: 0,
    aguaUtilFacilmenteDisponibleReal: 0,
    aguaUtilPct: 0,
    deficitMm: 0,
    demanda3Dias: 0,
    lluviaEfectiva72h: 0,
    recomendacionHoyMm: 0,
    estadoCalculoAguaUtil: 'fallida',
    motivoCalculoAguaUtil: motivo,
    nivelesConRaicesDetectadas: 0,
    nivelesConDatosDisponibles: 0,
    trazas: [motivo],
    estadoCapacidadCampo: 'fallida',
    motivoCapacidadCampo: motivo,
  };
}

function ordenarPorFecha<T extends { fecha?: string }>(items: T[]): T[] {
  return [...items].filter((item) => item?.fecha).sort((a, b) => new Date(a.fecha!).getTime() - new Date(b.fecha!).getTime());
}

function normalizarSuelos(suelos: ISuelo[] = [], registros: IClimaEstacionMeteorologica[]): ISuelo[] {
  if (suelos.length) {
    return suelos.map((suelo, index) => ({
      ...suelo,
      numeroDeSensor: suelo.numeroDeSensor ?? index + 1,
      profundidad: suelo.profundidad ?? inferirProfundidadCm(suelo.numeroDeSensor ?? index + 1),
    }));
  }
  const ultimo = registros[registros.length - 1];
  const keys = Object.keys(ultimo?.humedadSuelo || {});
  return keys.map((key, index) => ({
    numeroDeSensor: index + 1,
    profundidad: Number(key) > 12 ? Number(key) : inferirProfundidadCm(index + 1),
  }));
}

function inferirProfundidadCm(nivel?: number): number {
  const n = Number(nivel || 1);
  return n > 12 ? n : n * 10;
}

function leerHumedad(registro: IClimaEstacionMeteorologica | undefined, suelo: ISuelo): number | undefined {
  if (!registro?.humedadSuelo) return undefined;
  const humedadPorNivel = registro.humedadSuelo as unknown as Record<string, IValores>;
  const keys = [
    suelo.numeroDeSensor != null ? String(suelo.numeroDeSensor) : undefined,
    suelo.profundidad != null ? String(suelo.profundidad) : undefined,
  ].filter((key) => key !== undefined && key !== null);

  for (const key of keys) {
    const value = humedadPorNivel[key];
    const humedad = normalizarHumedadSueloPct(value?.avg ?? value?.last ?? value?.result ?? value?.sum);
    if (humedad != null) return humedad;
  }
  return undefined;
}

function construirVentanaDiaNoche(
  humedadSuelo: IClimaEstacionMeteorologica[],
  lluviaHistorica: IClimaEstacionMeteorologica[],
): VentanaDiaNoche {
  const fin = humedadSuelo[humedadSuelo.length - 1]?.fecha
    ? new Date(humedadSuelo[humedadSuelo.length - 1].fecha!)
    : new Date();
  const inicio = new Date(fin);
  inicio.setHours(inicio.getHours() - 24);
  const registros = humedadSuelo.filter((item) => {
    const fecha = new Date(item.fecha!).getTime();
    return fecha >= inicio.getTime() && fecha <= fin.getTime();
  });
  return construirVentanaDesdeRegistros(registros, lluviaHistorica);
}

function construirVentanaDesdeRegistros(
  registrosOriginales: IClimaEstacionMeteorologica[],
  lluviaHistorica: IClimaEstacionMeteorologica[],
): VentanaDiaNoche {
  const registros = ordenarPorFecha(registrosOriginales);
  const dia = registros.filter((registro) => esDia(registro));
  const noche = registros.filter((registro) => !esDia(registro));
  const desde = registros[0]?.fecha;
  const hasta = registros[registros.length - 1]?.fecha;
  return {
    registros,
    primerDia: dia[0],
    ultimoDia: dia[dia.length - 1],
    primerNoche: noche[0],
    ultimoNoche: noche[noche.length - 1],
    horasDia: dia.length,
    horasNoche: noche.length,
    lluvia24h: sumarLluvia(lluviaHistorica, desde, hasta),
  };
}

function esDia(registro: IClimaEstacionMeteorologica): boolean {
  const radiacion = Number(
    registro.radiacionSolar?.avg ??
      registro.radiacionSolar?.last ??
      registro.radiacionSolar?.result ??
      registro.intensidadLuminica?.avg ??
      registro.intensidadLuminica?.last ??
      0,
  );
  if (Number.isFinite(radiacion) && radiacion > 1) return true;
  const diaNoche = String(registro.diaNoche || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return diaNoche.startsWith('d');
}

function sumarLluvia(registros: IClimaEstacionMeteorologica[], desde?: string, hasta?: string): number {
  if (!desde || !hasta) return 0;
  const from = new Date(desde).getTime();
  const to = new Date(hasta).getTime();
  return redondear(
    registros.reduce((total, registro) => {
      const time = new Date(registro.fecha || '').getTime();
      if (!Number.isFinite(time) || time < from || time > to) return total;
      return total + Number(registro.lluvia?.sum ?? registro.lluvia?.last ?? registro.lluvia?.avg ?? 0);
    }, 0),
    2,
  );
}

function detectarRaicesPorNivelV12(
  ventana: VentanaDiaNoche,
  suelo: ISuelo,
  capacidadCampo?: number,
  puntoMarchitez?: number,
): ICalculoRaices {
  const nivel = suelo.numeroDeSensor || suelo.profundidad || 0;
  const inicioDia = leerHumedad(ventana.primerDia, suelo);
  const finDia = leerHumedad(ventana.ultimoDia, suelo);
  const inicioNoche = leerHumedad(ventana.primerNoche, suelo);
  const finNoche = leerHumedad(ventana.ultimoNoche, suelo);
  const humedadMaxima = maximo(
    ventana.registros.map((registro) => leerHumedad(registro, suelo)).filter((value): value is number => value != null),
  );
  const response: ICalculoRaices = {
    nivel: Number(nivel),
    profundidad: suelo.profundidad,
    capacidadCampo,
    precipitaciones: ventana.lluvia24h,
    humedadMaxima,
    inicioDia: { fecha: ventana.primerDia?.fecha, humedad: inicioDia },
    finDia: { fecha: ventana.ultimoDia?.fecha, humedad: finDia },
    inicioNoche: { fecha: ventana.primerNoche?.fecha, humedad: inicioNoche },
    finNoche: { fecha: ventana.ultimoNoche?.fecha, humedad: finNoche },
    horasDia: ventana.horasDia,
    horasNoche: ventana.horasNoche,
  };

  if ([inicioDia, finDia, inicioNoche, finNoche].some((value) => value == null) || !ventana.horasDia || !ventana.horasNoche) {
    response.condicion = 'Rechazado';
    response.hayRaices = suelo.hayRaices ?? null;
    return response;
  }

  response.deltaDiario = redondear((finNoche! - inicioDia!) / 100, 6);
  response.deltaDia = redondear((finDia! - inicioDia!) / 100, 6);
  response.pendienteDia = redondear(response.deltaDia / ventana.horasDia, 6);
  response.deltaNoche = redondear((finNoche! - inicioNoche!) / 100, 6);
  response.pendienteNoche = redondear(response.deltaNoche / ventana.horasNoche, 6);
  response.relacionDiaNoche =
    response.pendienteNoche === 0 ? 0 : redondear(response.pendienteDia / response.pendienteNoche, 4);
  response.condicion = response.deltaDiario <= -0.0005 || response.deltaDiario > 0.1 ? 'Aceptado' : 'Rechazado';

  if (ventana.lluvia24h > 1) {
    response.hayRaices = null;
  } else if (capacidadCampo && humedadMaxima >= capacidadCampo) {
    response.hayRaices = null;
  } else {
    response.hayRaices = response.condicion === 'Aceptado' && response.relacionDiaNoche > 0.1;
  }

  response.ascensoCapilar =
    ventana.lluvia24h <= 0.2 && response.pendienteDia >= 0.0001 ? true : false;
  response.puntoMarchitez = puntoMarchitez;
  return response;
}

function estimarCapacidadCampoPorNivel(
  humedadSuelo: IClimaEstacionMeteorologica[],
  lluviaHistorica: IClimaEstacionMeteorologica[],
  suelo: ISuelo,
  lote: ILote,
): CapacidadCampoEstimacion {
  const candidatos: number[] = [];
  const sorted = ordenarPorFecha(humedadSuelo);
  for (let end = 23; end < sorted.length; end += 1) {
    const registros = sorted.slice(Math.max(0, end - 23), end + 1);
    const ventana = construirVentanaDesdeRegistros(registros, lluviaHistorica);
    const raiz = detectarRaicesPorNivelV12(ventana, suelo, undefined, undefined);
    const humedadReferencia = leerHumedad(ventana.primerNoche || ventana.ultimoDia, suelo);
    if (
      humedadReferencia != null &&
      ventana.lluvia24h < 1 &&
      (raiz.deltaDiario || 0) < -0.0002 &&
      (raiz.relacionDiaNoche || 0) > 2.99 &&
      (raiz.pendienteDia || 0) < -0.003 &&
      (raiz.pendienteNoche || 0) < 0
    ) {
      candidatos.push(humedadReferencia);
    }
  }

  if (candidatos.length) {
    return {
      capacidadCampo: redondear(percentil(candidatos, 0.75), 2),
      fuenteCapacidadCampo: 'auto',
      confianzaCapacidadCampo: clamp(candidatos.length / 5, 0.25, 1),
      muestras: candidatos.length,
    };
  }

  const manual = normalizarPct(suelo.capacidadDeCampo ?? lote.capacidadDeCampo);
  if (manual) {
    return {
      capacidadCampo: manual,
      fuenteCapacidadCampo: 'manual',
      confianzaCapacidadCampo: 0.65,
      muestras: 0,
    };
  }

  return {
    capacidadCampo: capacidadCampoPorTextura(suelo.textura),
    fuenteCapacidadCampo: 'textura',
    confianzaCapacidadCampo: 0.35,
    muestras: 0,
  };
}

function calcularNivel(
  suelo: ISuelo,
  profundidad: number,
  humedadActual: number | undefined,
  capacidadCampo: number,
  puntoMarchitez: number,
  raiz: ICalculoRaices,
  candidato: CapacidadCampoEstimacion,
  lote: ILote,
): NivelDiagnostico {
  const hayRaices = raiz.hayRaices === true || suelo.hayRaices === true;
  const aguaTotalDisponibleMm = calcularMm(Math.max(capacidadCampo - puntoMarchitez, 0), profundidad, lote);
  const aguaUtilActualMm =
    humedadActual == null ? 0 : calcularMm(clamp(humedadActual - puntoMarchitez, 0, capacidadCampo - puntoMarchitez), profundidad, lote);
  const deficitMm = humedadActual == null ? 0 : calcularMm(clamp(capacidadCampo - humedadActual, 0, capacidadCampo), profundidad, lote);
  const aguaUtilPct = aguaTotalDisponibleMm > 0 ? (aguaUtilActualMm / aguaTotalDisponibleMm) * 100 : 0;

  return {
    nivel: suelo.numeroDeSensor || profundidad,
    profundidad,
    humedadActual,
    capacidadCampo,
    puntoMarchitez,
    fuenteCapacidadCampo: candidato.fuenteCapacidadCampo,
    confianzaCapacidadCampo: redondear((candidato.confianzaCapacidadCampo || 0) * 100, 0),
    hayRaices,
    deficitMm: redondear(deficitMm, 2),
    aguaUtilActualMm: redondear(aguaUtilActualMm, 2),
    aguaTotalDisponibleMm: redondear(aguaTotalDisponibleMm, 2),
    aguaUtilPct: redondear(aguaUtilPct, 1),
    trazas: [`Nivel ${suelo.numeroDeSensor || profundidad}: CC ${capacidadCampo}%, PMP ${puntoMarchitez}%.`],
  };
}

function calcularPronosticoRiegoV12(params: {
  pronostico7Dias: IPronosticoEstacionMeteorologica[];
  siembra: ISiembra;
  cultivo: Cultivo;
  crono: ICrono;
  aguaUtilActualMm: number;
  aguaTotalDisponibleMm: number;
  deficitMm: number;
  capacidadDeRiego: number;
  umbralAguaUtilPct: number;
}) {
  let saldo = params.aguaUtilActualMm;
  const pronosticosRiego: IPronosticoRiego[] = [];
  const consumo = params.pronostico7Dias.map((pronostico) => {
    const fecha = new Date(pronostico.fecha || new Date().toISOString());
    const fechaSiembra = new Date(params.siembra.fechaSiembra || new Date().toISOString());
    const diasDesdeEmergencia = HelperService.getDiasDesdeEmergencia(params.crono, fechaSiembra, fecha);
    const kc = HelperService.getKc(diasDesdeEmergencia, params.cultivo, params.crono);
    const et0 = Number(pronostico.et0 || 0);
    const lluvia = Number(pronostico.probabilidadLluvia || 0) >= 70 ? Number(pronostico.lluvia || 0) : 0;
    return {
      fecha: pronostico.fecha,
      et0,
      kc,
      consumoAgua: redondear(kc * et0, 2),
      lluvias: redondear(lluvia, 2),
    };
  });

  const demanda3Dias = redondear(sumar(consumo.slice(0, 3).map((item) => item.consumoAgua)), 2);
  const lluviaEfectiva72h = redondear(sumar(consumo.slice(0, 3).map((item) => item.lluvias)), 2);
  const umbralMm = (params.aguaTotalDisponibleMm * params.umbralAguaUtilPct) / 100;
  let recomendacionHoyMm = 0;

  for (let i = 0; i < Math.min(5, consumo.length); i += 1) {
    const item = consumo[i];
    const previsionConsumo3Dias = redondear(sumar(consumo.slice(i, i + 3).map((c) => c.consumoAgua)), 2);
    const afd = redondear(saldo, 2);
    saldo = redondear(saldo - item.consumoAgua + item.lluvias, 2);
    const ccPorcentual = params.aguaTotalDisponibleMm > 0 ? redondear(saldo / params.aguaTotalDisponibleMm, 3) : 0;
    const necesitaRiego = saldo < umbralMm && previsionConsumo3Dias > Math.max(params.capacidadDeRiego * 0.7, 1);
    const cantidad = necesitaRiego ? redondear(Math.min(params.deficitMm, params.capacidadDeRiego), 1) : 0;
    if (i === 0) {
      recomendacionHoyMm = cantidad;
    }
    if (necesitaRiego) {
      saldo = redondear(saldo + cantidad, 2);
    }
    pronosticosRiego.push({
      fecha: item.fecha,
      et0: item.et0,
      kc: item.kc,
      consumoAgua: item.consumoAgua,
      lluvias: item.lluvias,
      afd,
      saldoDiario: saldo,
      ccPorcentual,
      previsionConsumo3Dias,
      regar: necesitaRiego,
    });
  }

  return {
    pronosticosRiego,
    demanda3Dias,
    lluviaEfectiva72h,
    recomendacionHoyMm,
  };
}

function calcularMm(pct: number, profundidadCm: number, lote: ILote): number {
  const anchoBulbo = Number(lote.anchoDeBulbo || 1);
  const metrosLinealesHa = Number(lote.metrosLinealesHas || 10000);
  const factorAreaMojada = clamp((anchoBulbo * metrosLinealesHa) / 10000, 0.05, 1.5);
  return redondear((pct / 100) * profundidadCm * 10 * factorAreaMojada, 2);
}

function capacidadCampoPorTextura(textura?: string): number {
  const key = String(textura || '').toLowerCase();
  if (key.includes('arcilloso') && key.includes('franco')) return 38;
  if (key.includes('arcilloso')) return 42;
  if (key.includes('arenoso') && key.includes('franco')) return 24;
  if (key.includes('arenoso')) return 16;
  return 34;
}

function normalizarPct(value?: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return redondear(raw <= 1 ? raw * 100 : raw, 2);
}

function percentil(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function sumar(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function maximo(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function redondear(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) || 0) * factor) / factor;
}
