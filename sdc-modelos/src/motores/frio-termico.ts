/**
 * Motor puro de frio termico para series de temperatura horaria.
 *
 * Modelos incluidos:
 * - Horas de frio: una hora cuando 0 <= T <= 7.2 grados C.
 * - Utah: ponderaciones horarias de Richardson et al. (1974), incluidas
 *   las unidades negativas por temperaturas altas.
 * - Dynamic Model: Chill Portions de Fishman, Erez y Couvillon (1987) con
 *   la parametrizacion difundida por Erez et al. (1990). Las porciones se
 *   calculan mediante el precursor dinamico de dos pasos; nunca mediante
 *   una conversion de HFE/28.
 *
 * Convencion temporal:
 * cada observacion normalizada representa la temperatura media de una hora
 * completa. Varias muestras de la misma fuente dentro de una hora se
 * promedian. Si hay varias fuentes, se elige una de forma determinista.
 * Las horas faltantes no se interpolan ni acumulan frio.
 */

export const FRIO_TERMICO_ENGINE_VERSION = "frio-termico-1.1.0";

export const HORA_FRIO_MIN_C = 0;
export const HORA_FRIO_MAX_C = 7.2;

const HORA_MS = 60 * 60 * 1000;
const FUENTE_DESCONOCIDA = "sin_fuente";

export type TCalidadObservacionFrio =
  | "observada"
  | "importada"
  | "interpolada"
  | "estimada";

export interface IObservacionTemperaturaFrio {
  fecha: string | Date;
  temperaturaC?: number | null;
  fuente?: string;
  calidad?: TCalidadObservacionFrio;
}

export interface IParametrosModeloDinamicoFrio {
  E0: number;
  E1: number;
  A0: number;
  A1: number;
  pendiente: number;
  temperaturaTransicionK: number;
}

/**
 * Parametros de referencia del Dynamic Model usados por la implementacion
 * de Erez y por chillR. El desplazamiento Celsius-Kelvin se conserva en 273
 * porque forma parte de esa parametrizacion calibrada.
 */
export const PARAMETROS_MODELO_DINAMICO_FRIO: Readonly<
  IParametrosModeloDinamicoFrio
> = Object.freeze({
  E0: 4153.5,
  E1: 12888.8,
  A0: 139500,
  A1: 2.567e18,
  pendiente: 1.6,
  temperaturaTransicionK: 277,
});

export interface IEstadoDinamicoFrio {
  /**
   * Cantidad remanente del precursor PDBF. Es necesaria para continuar una
   * serie en otro proceso sin reiniciar el modelo.
   */
  precursor: number;
  porcionesAcumuladas: number;
}

export interface IAcumuladosFrioTermico {
  horasFrio: number;
  unidadesFrioUtah: number;
  porcionesFrioDinamicas: number;
}

export interface IEstadoInicialFrioTermico
  extends Partial<IAcumuladosFrioTermico> {
  precursorDinamico?: number;
}

export interface IObservacionHorariaFrio {
  fecha: string;
  horaEpochMs: number;
  dia: string;
  temperaturaC: number;
  fuente: string;
  calidad: TCalidadObservacionFrio;
  cantidadMuestras: number;
  muestrasDescartadas: number;
}

export interface ISerieHorariaFrioNormalizada {
  observaciones: IObservacionHorariaFrio[];
  observacionesRecibidas: number;
  observacionesInvalidas: number;
  muestrasColapsadas: number;
}

export interface IContribucionHorariaFrio {
  fecha: string;
  dia: string;
  temperaturaC: number;
  fuente: string;
  calidad: TCalidadObservacionFrio;
  cantidadMuestras: number;
  intervaloDesdeAnteriorHoras?: number;
  continuaConAnterior: boolean;
  incremento: IAcumuladosFrioTermico;
  acumulado: IAcumuladosFrioTermico;
  estadoDinamico: IEstadoDinamicoFrio;
}

export interface IBrechaFrioTermico {
  desde: string;
  hasta: string;
  horasFaltantes: number;
}

export interface IContinuidadFrioTermico {
  fechaInicio?: string;
  fechaFin?: string;
  horasEsperadas: number;
  horasConDato: number;
  horasFaltantes: number;
  coberturaPct: number;
  coberturaMinimaPct: number;
  coberturaSuficiente: boolean;
  esContinua: boolean;
  mayorBrechaHoras: number;
  rachaContinuaMaximaHoras: number;
  brechas: IBrechaFrioTermico[];
}

export interface IResumenFuenteFrio extends IAcumuladosFrioTermico {
  fuente: string;
  horasConDato: number;
  coberturaVentanaPct: number;
  participacionDatosPct: number;
}

export interface IResumenFuenteDiaFrio extends IAcumuladosFrioTermico {
  fuente: string;
  horasConDato: number;
  participacionDiaPct: number;
}

export interface IResumenDiarioFrio extends IAcumuladosFrioTermico {
  dia: string;
  horasEsperadas: number;
  horasConDato: number;
  horasFaltantes: number;
  coberturaPct: number;
  fuentes: IResumenFuenteDiaFrio[];
}

export interface IOpcionesCalculoFrioTermico {
  /**
   * Ventana explicita de cobertura. Si se omite, se usa desde la primera hasta
   * la ultima hora valida, ambas inclusive.
   */
  fechaInicio?: string | Date;
  fechaFin?: string | Date;
  /**
   * Zona horaria IANA usada para agrupar horas y dias civiles. Tiene
   * prioridad sobre el desfase fijo y permite representar correctamente
   * dias de 23 o 25 horas durante cambios de horario estacional.
   */
  zonaHoraria?: string;
  /**
   * Desfase fijo respecto de UTC para agrupar horas y dias locales. Se
   * conserva como compatibilidad y fallback cuando no hay una zona IANA
   * valida. Argentina continental: -180.
   */
  desfaseHorarioMinutos?: number;
  /**
   * Orden de preferencia cuando dos fuentes cubren la misma hora.
   */
  prioridadFuentes?: string[];
  coberturaMinimaPct?: number;
  estadoInicial?: IEstadoInicialFrioTermico;
  parametrosDinamicos?: Partial<IParametrosModeloDinamicoFrio>;
  /**
   * Por defecto el precursor se conserva al atravesar una brecha, pero no se
   * acumula nada durante las horas faltantes. Activar esta opcion reinicia
   * solamente el precursor luego de cada corte.
   */
  reiniciarPrecursorEnBrecha?: boolean;
}

export interface IDiagnosticoFrioTermico {
  observacionesRecibidas: number;
  observacionesInvalidas: number;
  muestrasColapsadas: number;
  observacionesFueraVentana: number;
  advertencias: string[];
}

export interface IResultadoFrioTermico {
  versionMotor: string;
  incrementoPeriodo: IAcumuladosFrioTermico;
  acumulado: IAcumuladosFrioTermico;
  estadoDinamicoFinal: IEstadoDinamicoFrio;
  continuidad: IContinuidadFrioTermico;
  horas: IContribucionHorariaFrio[];
  porDia: IResumenDiarioFrio[];
  porFuente: IResumenFuenteFrio[];
  diagnostico: IDiagnosticoFrioTermico;
}

interface ICandidatoHora {
  horaEpochMs: number;
  temperaturaC: number;
  fuente: string;
  calidad: TCalidadObservacionFrio;
  indiceOriginal: number;
}

interface IGrupoCandidatos {
  fuente: string;
  calidad: TCalidadObservacionFrio;
  candidatos: ICandidatoHora[];
}

interface IResumenMutable extends IAcumuladosFrioTermico {
  horasConDato: number;
}

interface IResumenDiarioMutable extends IResumenMutable {
  dia: string;
  horasEsperadas: number;
  fuentes: Map<string, IResumenMutable>;
}

interface IContextoTemporalFrio {
  zonaHoraria?: string;
  zonaHorariaInvalida?: string;
  desfaseHorarioMinutos: number;
}

const formateadoresZonaHoraria = new Map<string, Intl.DateTimeFormat>();

/**
 * Una hora de frio simple. Los limites son inclusivos.
 */
export function calcularHoraFrio(temperaturaC: number): number {
  if (!Number.isFinite(temperaturaC)) return 0;
  return temperaturaC >= HORA_FRIO_MIN_C &&
    temperaturaC <= HORA_FRIO_MAX_C
    ? 1
    : 0;
}

/**
 * Aporte de una hora al modelo Utah original.
 *
 * T <= 1.4: 0
 * 1.4 < T <= 2.4: 0.5
 * 2.4 < T <= 9.1: 1
 * 9.1 < T <= 12.4: 0.5
 * 12.4 < T <= 15.9: 0
 * 15.9 < T <= 18: -0.5
 * T > 18: -1
 */
export function calcularUnidadFrioUtah(temperaturaC: number): number {
  if (!Number.isFinite(temperaturaC)) return 0;
  if (temperaturaC <= 1.4) return 0;
  if (temperaturaC <= 2.4) return 0.5;
  if (temperaturaC <= 9.1) return 1;
  if (temperaturaC <= 12.4) return 0.5;
  if (temperaturaC <= 15.9) return 0;
  if (temperaturaC <= 18) return -0.5;
  return -1;
}

export function crearEstadoDinamicoFrio(
  precursor = 0,
  porcionesAcumuladas = 0,
): IEstadoDinamicoFrio {
  return {
    precursor: numeroNoNegativo(precursor),
    porcionesAcumuladas: numeroNoNegativo(porcionesAcumuladas),
  };
}

/**
 * Ejecuta una hora del Dynamic Model.
 *
 * El precursor se forma/destruye mediante cinetica de Arrhenius. Cuando
 * supera el umbral 1, una fraccion se transforma irreversiblemente en Chill
 * Portions mediante la funcion sigmoidea del modelo. El remanente se conserva
 * como estado para la hora siguiente.
 */
export function calcularPasoPorcionesFrioDinamicas(
  temperaturaC: number,
  estado: IEstadoDinamicoFrio = crearEstadoDinamicoFrio(),
  parametros?: Partial<IParametrosModeloDinamicoFrio>,
): {
  porcionesHora: number;
  estado: IEstadoDinamicoFrio;
} {
  if (!Number.isFinite(temperaturaC) || temperaturaC <= -273) {
    return {
      porcionesHora: 0,
      estado: crearEstadoDinamicoFrio(
        estado.precursor,
        estado.porcionesAcumuladas,
      ),
    };
  }

  const p = resolverParametrosDinamicos(parametros);
  const temperaturaK = temperaturaC + 273;
  const estadoSeguro = crearEstadoDinamicoFrio(
    estado.precursor,
    estado.porcionesAcumuladas,
  );
  const equilibrio =
    (p.A0 / p.A1) * Math.exp((p.E1 - p.E0) / temperaturaK);
  const k1 = p.A1 * Math.exp(-p.E1 / temperaturaK);
  const precursorFormado =
    equilibrio -
    (equilibrio - estadoSeguro.precursor) * Math.exp(-k1);

  let porcionesHora = 0;
  let precursorFinal = Math.max(0, precursorFormado);
  if (precursorFinal >= 1) {
    const argumento =
      (p.pendiente *
        p.temperaturaTransicionK *
        (temperaturaK - p.temperaturaTransicionK)) /
      temperaturaK;
    porcionesHora = precursorFinal * sigmoideEstable(argumento);
    precursorFinal = Math.max(0, precursorFinal - porcionesHora);
  }

  const porcionesSeguras = numeroNoNegativo(porcionesHora);
  return {
    porcionesHora: porcionesSeguras,
    estado: {
      precursor: precursorFinal,
      porcionesAcumuladas:
        estadoSeguro.porcionesAcumuladas + porcionesSeguras,
    },
  };
}

/**
 * Colapsa muestras subhorarias a una observacion por hora.
 *
 * Se elige primero la fuente indicada en `prioridadFuentes`; luego se prioriza
 * observada > importada > interpolada > estimada, cantidad de muestras y
 * finalmente el nombre de fuente. Solo se promedian muestras del grupo elegido.
 */
export function normalizarObservacionesHorariasFrio(
  observaciones: IObservacionTemperaturaFrio[],
  opciones: Pick<
    IOpcionesCalculoFrioTermico,
    "zonaHoraria" | "desfaseHorarioMinutos" | "prioridadFuentes"
  > = {},
): ISerieHorariaFrioNormalizada {
  const recibidas = Array.isArray(observaciones) ? observaciones : [];
  const contextoTemporal = resolverContextoTemporal(opciones);
  const porHora = new Map<number, ICandidatoHora[]>();
  let invalidas = 0;

  recibidas.forEach((observacion, indiceOriginal) => {
    const fechaMs = fechaAMilisegundos(observacion?.fecha);
    const temperaturaC = numeroFinito(observacion?.temperaturaC);
    if (
      fechaMs === undefined ||
      temperaturaC === undefined ||
      temperaturaC <= -273
    ) {
      invalidas += 1;
      return;
    }
    const horaEpochMs = inicioHora(fechaMs, contextoTemporal);
    const candidato: ICandidatoHora = {
      horaEpochMs,
      temperaturaC,
      fuente: limpiarFuente(observacion.fuente),
      calidad: observacion.calidad || "observada",
      indiceOriginal,
    };
    const candidatos = porHora.get(horaEpochMs) || [];
    candidatos.push(candidato);
    porHora.set(horaEpochMs, candidatos);
  });

  let colapsadas = 0;
  const normalizadas = Array.from(porHora.entries())
    .sort(([a], [b]) => a - b)
    .map(([horaEpochMs, candidatos]) => {
      const grupos = agruparCandidatos(candidatos);
      grupos.sort((a, b) =>
        compararGrupos(a, b, opciones.prioridadFuentes || []),
      );
      const elegido = grupos[0];
      const temperaturaC =
        elegido.candidatos.reduce(
          (suma, candidato) => suma + candidato.temperaturaC,
          0,
        ) / elegido.candidatos.length;
      colapsadas += Math.max(0, candidatos.length - 1);
      return {
        fecha: new Date(horaEpochMs).toISOString(),
        horaEpochMs,
        dia: claveDia(horaEpochMs, contextoTemporal),
        temperaturaC,
        fuente: elegido.fuente,
        calidad: elegido.calidad,
        cantidadMuestras: elegido.candidatos.length,
        muestrasDescartadas:
          candidatos.length - elegido.candidatos.length,
      };
    });

  return {
    observaciones: normalizadas,
    observacionesRecibidas: recibidas.length,
    observacionesInvalidas: invalidas,
    muestrasColapsadas: colapsadas,
  };
}

export function calcularFrioTermico(
  observaciones: IObservacionTemperaturaFrio[],
  opciones: IOpcionesCalculoFrioTermico = {},
): IResultadoFrioTermico {
  const contextoTemporal = resolverContextoTemporal(opciones);
  const coberturaMinimaPct = limitar(
    numeroFinito(opciones.coberturaMinimaPct) ?? 90,
    0,
    100,
  );
  const serie = normalizarObservacionesHorariasFrio(observaciones, opciones);
  const limites = resolverVentana(
    serie.observaciones,
    opciones,
    contextoTemporal,
  );
  const observacionesVentana = limites
    ? serie.observaciones.filter(
        (item) =>
          item.horaEpochMs >= limites.inicio &&
          item.horaEpochMs <= limites.fin,
      )
    : [];
  const observacionesFueraVentana =
    serie.observaciones.length - observacionesVentana.length;
  const porHora = new Map(
    observacionesVentana.map((item) => [item.horaEpochMs, item]),
  );

  const continuidad = construirContinuidad(
    porHora,
    limites,
    coberturaMinimaPct,
  );
  const inicial = resolverAcumuladosIniciales(opciones.estadoInicial);
  const incrementoPeriodo = crearAcumulados();
  const acumulado = copiarAcumulados(inicial);
  let estadoDinamico = crearEstadoDinamicoFrio(
    opciones.estadoInicial?.precursorDinamico,
    inicial.porcionesFrioDinamicas,
  );
  let horaAnterior: number | undefined;
  const horas: IContribucionHorariaFrio[] = [];
  const porDia = new Map<string, IResumenDiarioMutable>();
  const porFuente = new Map<string, IResumenMutable>();

  if (limites) {
    for (
      let hora = limites.inicio;
      hora <= limites.fin;
      hora += HORA_MS
    ) {
      const dia = claveDia(hora, contextoTemporal);
      const resumenDia =
        porDia.get(dia) || crearResumenDiarioMutable(dia);
      resumenDia.horasEsperadas += 1;
      porDia.set(dia, resumenDia);
    }
  }

  for (const observacion of observacionesVentana) {
    const intervaloHoras =
      horaAnterior === undefined
        ? undefined
        : (observacion.horaEpochMs - horaAnterior) / HORA_MS;
    const continuaConAnterior =
      intervaloHoras === undefined || intervaloHoras === 1;

    if (
      !continuaConAnterior &&
      opciones.reiniciarPrecursorEnBrecha === true
    ) {
      estadoDinamico = crearEstadoDinamicoFrio(
        0,
        estadoDinamico.porcionesAcumuladas,
      );
    }

    const pasoDinamico = calcularPasoPorcionesFrioDinamicas(
      observacion.temperaturaC,
      estadoDinamico,
      opciones.parametrosDinamicos,
    );
    estadoDinamico = pasoDinamico.estado;
    const incremento: IAcumuladosFrioTermico = {
      horasFrio: calcularHoraFrio(observacion.temperaturaC),
      unidadesFrioUtah: calcularUnidadFrioUtah(observacion.temperaturaC),
      porcionesFrioDinamicas: pasoDinamico.porcionesHora,
    };
    sumarAcumulados(incrementoPeriodo, incremento);
    sumarAcumulados(acumulado, incremento);

    const resumenDia =
      porDia.get(observacion.dia) ||
      crearResumenDiarioMutable(observacion.dia);
    resumenDia.horasConDato += 1;
    sumarAcumulados(resumenDia, incremento);
    const fuenteDia =
      resumenDia.fuentes.get(observacion.fuente) || crearResumenMutable();
    fuenteDia.horasConDato += 1;
    sumarAcumulados(fuenteDia, incremento);
    resumenDia.fuentes.set(observacion.fuente, fuenteDia);
    porDia.set(observacion.dia, resumenDia);

    const resumenFuente =
      porFuente.get(observacion.fuente) || crearResumenMutable();
    resumenFuente.horasConDato += 1;
    sumarAcumulados(resumenFuente, incremento);
    porFuente.set(observacion.fuente, resumenFuente);

    horas.push({
      fecha: observacion.fecha,
      dia: observacion.dia,
      temperaturaC: observacion.temperaturaC,
      fuente: observacion.fuente,
      calidad: observacion.calidad,
      cantidadMuestras: observacion.cantidadMuestras,
      intervaloDesdeAnteriorHoras: intervaloHoras,
      continuaConAnterior,
      incremento: copiarAcumulados(incremento),
      acumulado: copiarAcumulados(acumulado),
      estadoDinamico: { ...estadoDinamico },
    });
    horaAnterior = observacion.horaEpochMs;
  }

  const advertencias: string[] = [];
  if (contextoTemporal.zonaHorariaInvalida) {
    advertencias.push(
      `La zona horaria IANA "${contextoTemporal.zonaHorariaInvalida}" no es valida; se uso el desfase fijo de ${contextoTemporal.desfaseHorarioMinutos} minutos.`,
    );
  }
  if (serie.observacionesInvalidas > 0) {
    advertencias.push(
      `${serie.observacionesInvalidas} observacion(es) sin fecha o temperatura valida fueron excluidas.`,
    );
  }
  if (serie.muestrasColapsadas > 0) {
    advertencias.push(
      `${serie.muestrasColapsadas} muestra(s) subhorarias o duplicadas fueron colapsadas por hora.`,
    );
  }
  if (continuidad.horasFaltantes > 0) {
    advertencias.push(
      "Hay horas faltantes: no se interpolaron temperaturas ni se acumulo frio durante esos huecos.",
    );
  }
  if (
    continuidad.horasFaltantes > 0 &&
    opciones.reiniciarPrecursorEnBrecha !== true
  ) {
    advertencias.push(
      "El precursor del Dynamic Model se conservo a traves de las brechas; la cobertura debe acompanarse al resultado.",
    );
  }
  if (!continuidad.coberturaSuficiente) {
    advertencias.push(
      `Cobertura ${continuidad.coberturaPct.toFixed(1)}%, inferior al minimo configurado de ${coberturaMinimaPct.toFixed(1)}%.`,
    );
  }

  return {
    versionMotor: FRIO_TERMICO_ENGINE_VERSION,
    incrementoPeriodo: copiarAcumulados(incrementoPeriodo),
    acumulado: copiarAcumulados(acumulado),
    estadoDinamicoFinal: { ...estadoDinamico },
    continuidad,
    horas,
    porDia: Array.from(porDia.values())
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map(convertirResumenDiario),
    porFuente: Array.from(porFuente.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fuente, resumen]) => ({
        fuente,
        horasConDato: resumen.horasConDato,
        horasFrio: resumen.horasFrio,
        unidadesFrioUtah: resumen.unidadesFrioUtah,
        porcionesFrioDinamicas: resumen.porcionesFrioDinamicas,
        coberturaVentanaPct: porcentaje(
          resumen.horasConDato,
          continuidad.horasEsperadas,
        ),
        participacionDatosPct: porcentaje(
          resumen.horasConDato,
          continuidad.horasConDato,
        ),
      })),
    diagnostico: {
      observacionesRecibidas: serie.observacionesRecibidas,
      observacionesInvalidas: serie.observacionesInvalidas,
      muestrasColapsadas: serie.muestrasColapsadas,
      observacionesFueraVentana,
      advertencias,
    },
  };
}

function construirContinuidad(
  porHora: Map<number, IObservacionHorariaFrio>,
  limites: { inicio: number; fin: number } | undefined,
  coberturaMinimaPct: number,
): IContinuidadFrioTermico {
  if (!limites) {
    return {
      horasEsperadas: 0,
      horasConDato: 0,
      horasFaltantes: 0,
      coberturaPct: 0,
      coberturaMinimaPct,
      coberturaSuficiente: false,
      esContinua: false,
      mayorBrechaHoras: 0,
      rachaContinuaMaximaHoras: 0,
      brechas: [],
    };
  }

  const brechas: IBrechaFrioTermico[] = [];
  let horasEsperadas = 0;
  let horasConDato = 0;
  let rachaActual = 0;
  let rachaMaxima = 0;
  let inicioBrecha: number | undefined;
  let horasBrecha = 0;

  for (
    let hora = limites.inicio;
    hora <= limites.fin;
    hora += HORA_MS
  ) {
    horasEsperadas += 1;
    if (porHora.has(hora)) {
      horasConDato += 1;
      rachaActual += 1;
      rachaMaxima = Math.max(rachaMaxima, rachaActual);
      if (inicioBrecha !== undefined) {
        brechas.push({
          desde: new Date(inicioBrecha).toISOString(),
          hasta: new Date(hora - HORA_MS).toISOString(),
          horasFaltantes: horasBrecha,
        });
        inicioBrecha = undefined;
        horasBrecha = 0;
      }
    } else {
      rachaActual = 0;
      if (inicioBrecha === undefined) inicioBrecha = hora;
      horasBrecha += 1;
    }
  }
  if (inicioBrecha !== undefined) {
    brechas.push({
      desde: new Date(inicioBrecha).toISOString(),
      hasta: new Date(limites.fin).toISOString(),
      horasFaltantes: horasBrecha,
    });
  }

  const horasFaltantes = horasEsperadas - horasConDato;
  const coberturaPct = porcentaje(horasConDato, horasEsperadas);
  return {
    fechaInicio: new Date(limites.inicio).toISOString(),
    fechaFin: new Date(limites.fin).toISOString(),
    horasEsperadas,
    horasConDato,
    horasFaltantes,
    coberturaPct,
    coberturaMinimaPct,
    coberturaSuficiente: coberturaPct >= coberturaMinimaPct,
    esContinua: horasFaltantes === 0,
    mayorBrechaHoras: brechas.reduce(
      (maximo, brecha) => Math.max(maximo, brecha.horasFaltantes),
      0,
    ),
    rachaContinuaMaximaHoras: rachaMaxima,
    brechas,
  };
}

function convertirResumenDiario(
  resumen: IResumenDiarioMutable,
): IResumenDiarioFrio {
  return {
    dia: resumen.dia,
    horasEsperadas: resumen.horasEsperadas,
    horasConDato: resumen.horasConDato,
    horasFaltantes: resumen.horasEsperadas - resumen.horasConDato,
    coberturaPct: porcentaje(
      resumen.horasConDato,
      resumen.horasEsperadas,
    ),
    horasFrio: resumen.horasFrio,
    unidadesFrioUtah: resumen.unidadesFrioUtah,
    porcionesFrioDinamicas: resumen.porcionesFrioDinamicas,
    fuentes: Array.from(resumen.fuentes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fuente, fuenteResumen]) => ({
        fuente,
        horasConDato: fuenteResumen.horasConDato,
        horasFrio: fuenteResumen.horasFrio,
        unidadesFrioUtah: fuenteResumen.unidadesFrioUtah,
        porcionesFrioDinamicas: fuenteResumen.porcionesFrioDinamicas,
        participacionDiaPct: porcentaje(
          fuenteResumen.horasConDato,
          resumen.horasConDato,
        ),
      })),
  };
}

function resolverVentana(
  observaciones: IObservacionHorariaFrio[],
  opciones: IOpcionesCalculoFrioTermico,
  contextoTemporal: IContextoTemporalFrio,
): { inicio: number; fin: number } | undefined {
  const inicioConfigurado = fechaAMilisegundos(opciones.fechaInicio);
  const finConfigurado = fechaAMilisegundos(opciones.fechaFin);
  const inicio =
    inicioConfigurado !== undefined
      ? inicioHora(inicioConfigurado, contextoTemporal)
      : observaciones[0]?.horaEpochMs;
  const fin =
    finConfigurado !== undefined
      ? inicioHora(finConfigurado, contextoTemporal)
      : observaciones[observaciones.length - 1]?.horaEpochMs;

  if (inicio === undefined || fin === undefined) return undefined;
  if (fin < inicio) {
    throw new RangeError("fechaFin debe ser igual o posterior a fechaInicio");
  }
  return { inicio, fin };
}

function resolverParametrosDinamicos(
  parametros?: Partial<IParametrosModeloDinamicoFrio>,
): IParametrosModeloDinamicoFrio {
  const base = PARAMETROS_MODELO_DINAMICO_FRIO;
  const resultado: IParametrosModeloDinamicoFrio = {
    E0: numeroPositivo(parametros?.E0, base.E0),
    E1: numeroPositivo(parametros?.E1, base.E1),
    A0: numeroPositivo(parametros?.A0, base.A0),
    A1: numeroPositivo(parametros?.A1, base.A1),
    pendiente: numeroPositivo(parametros?.pendiente, base.pendiente),
    temperaturaTransicionK: numeroPositivo(
      parametros?.temperaturaTransicionK,
      base.temperaturaTransicionK,
    ),
  };
  return resultado;
}

function resolverAcumuladosIniciales(
  estado?: IEstadoInicialFrioTermico,
): IAcumuladosFrioTermico {
  return {
    horasFrio: numeroNoNegativo(estado?.horasFrio),
    unidadesFrioUtah: numeroFinito(estado?.unidadesFrioUtah) ?? 0,
    porcionesFrioDinamicas: numeroNoNegativo(
      estado?.porcionesFrioDinamicas,
    ),
  };
}

function agruparCandidatos(
  candidatos: ICandidatoHora[],
): IGrupoCandidatos[] {
  const grupos = new Map<string, IGrupoCandidatos>();
  for (const candidato of candidatos) {
    const clave = `${candidato.fuente}\u0000${candidato.calidad}`;
    const grupo = grupos.get(clave) || {
      fuente: candidato.fuente,
      calidad: candidato.calidad,
      candidatos: [],
    };
    grupo.candidatos.push(candidato);
    grupos.set(clave, grupo);
  }
  return Array.from(grupos.values());
}

function compararGrupos(
  a: IGrupoCandidatos,
  b: IGrupoCandidatos,
  prioridadFuentes: string[],
): number {
  const prioridadA = indicePrioridad(a.fuente, prioridadFuentes);
  const prioridadB = indicePrioridad(b.fuente, prioridadFuentes);
  if (prioridadA !== prioridadB) return prioridadA - prioridadB;
  const calidadA = prioridadCalidad(a.calidad);
  const calidadB = prioridadCalidad(b.calidad);
  if (calidadA !== calidadB) return calidadA - calidadB;
  if (a.candidatos.length !== b.candidatos.length) {
    return b.candidatos.length - a.candidatos.length;
  }
  const fuente = a.fuente.localeCompare(b.fuente);
  if (fuente !== 0) return fuente;
  return (
    Math.min(...a.candidatos.map((item) => item.indiceOriginal)) -
    Math.min(...b.candidatos.map((item) => item.indiceOriginal))
  );
}

function indicePrioridad(fuente: string, prioridades: string[]): number {
  const indice = prioridades.indexOf(fuente);
  return indice >= 0 ? indice : prioridades.length + 1;
}

function prioridadCalidad(calidad: TCalidadObservacionFrio): number {
  switch (calidad) {
    case "observada":
      return 0;
    case "importada":
      return 1;
    case "interpolada":
      return 2;
    case "estimada":
      return 3;
    default:
      return 4;
  }
}

function crearResumenDiarioMutable(dia: string): IResumenDiarioMutable {
  return {
    dia,
    horasEsperadas: 0,
    horasConDato: 0,
    ...crearAcumulados(),
    fuentes: new Map<string, IResumenMutable>(),
  };
}

function crearResumenMutable(): IResumenMutable {
  return {
    horasConDato: 0,
    ...crearAcumulados(),
  };
}

function crearAcumulados(): IAcumuladosFrioTermico {
  return {
    horasFrio: 0,
    unidadesFrioUtah: 0,
    porcionesFrioDinamicas: 0,
  };
}

function copiarAcumulados(
  valor: IAcumuladosFrioTermico,
): IAcumuladosFrioTermico {
  return {
    horasFrio: valor.horasFrio,
    unidadesFrioUtah: valor.unidadesFrioUtah,
    porcionesFrioDinamicas: valor.porcionesFrioDinamicas,
  };
}

function sumarAcumulados(
  destino: IAcumuladosFrioTermico,
  incremento: IAcumuladosFrioTermico,
): void {
  destino.horasFrio += incremento.horasFrio;
  destino.unidadesFrioUtah += incremento.unidadesFrioUtah;
  destino.porcionesFrioDinamicas += incremento.porcionesFrioDinamicas;
}

function fechaAMilisegundos(
  valor?: string | Date,
): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  const tiempo = fecha.getTime();
  return Number.isFinite(tiempo) ? tiempo : undefined;
}

function inicioHora(
  fechaMs: number,
  contextoTemporal: IContextoTemporalFrio,
): number {
  const desfaseMinutos = contextoTemporal.zonaHoraria
    ? desfaseZonaHorariaMinutos(
        fechaMs,
        contextoTemporal.zonaHoraria,
      )
    : contextoTemporal.desfaseHorarioMinutos;
  const desfaseMs = desfaseMinutos * 60 * 1000;
  return (
    Math.floor((fechaMs + desfaseMs) / HORA_MS) * HORA_MS - desfaseMs
  );
}

function claveDia(
  fechaMs: number,
  contextoTemporal: IContextoTemporalFrio,
): string {
  if (contextoTemporal.zonaHoraria) {
    const partes = partesFechaZonaHoraria(
      fechaMs,
      contextoTemporal.zonaHoraria,
    );
    return `${partes.anio}-${rellenarDos(partes.mes)}-${rellenarDos(partes.dia)}`;
  }
  const local = new Date(
    fechaMs + contextoTemporal.desfaseHorarioMinutos * 60 * 1000,
  );
  return local.toISOString().slice(0, 10);
}

function resolverContextoTemporal(
  opciones: Pick<
    IOpcionesCalculoFrioTermico,
    "zonaHoraria" | "desfaseHorarioMinutos"
  >,
): IContextoTemporalFrio {
  const solicitada = String(opciones.zonaHoraria || "").trim();
  const desfaseHorarioMinutos =
    numeroFinito(opciones.desfaseHorarioMinutos) ?? 0;
  if (!solicitada) return { desfaseHorarioMinutos };
  try {
    formateadorZonaHoraria(solicitada).format(new Date(0));
    return {
      zonaHoraria: solicitada,
      desfaseHorarioMinutos,
    };
  } catch {
    return {
      zonaHorariaInvalida: solicitada,
      desfaseHorarioMinutos,
    };
  }
}

function desfaseZonaHorariaMinutos(
  fechaMs: number,
  zonaHoraria: string,
): number {
  const fechaRedondeadaSegundo =
    Math.floor(fechaMs / 1000) * 1000;
  const partes = partesFechaZonaHoraria(
    fechaRedondeadaSegundo,
    zonaHoraria,
  );
  const localInterpretadoComoUtc = Date.UTC(
    partes.anio,
    partes.mes - 1,
    partes.dia,
    partes.hora,
    partes.minuto,
    partes.segundo,
  );
  return Math.round(
    (localInterpretadoComoUtc - fechaRedondeadaSegundo) / 60000,
  );
}

function partesFechaZonaHoraria(
  fechaMs: number,
  zonaHoraria: string,
): {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
} {
  const valores: Record<string, number> = {};
  for (const parte of formateadorZonaHoraria(
    zonaHoraria,
  ).formatToParts(new Date(fechaMs))) {
    if (parte.type !== "literal") {
      valores[parte.type] = Number(parte.value);
    }
  }
  return {
    anio: valores["year"],
    mes: valores["month"],
    dia: valores["day"],
    hora: valores["hour"] === 24 ? 0 : valores["hour"],
    minuto: valores["minute"],
    segundo: valores["second"],
  };
}

function formateadorZonaHoraria(
  zonaHoraria: string,
): Intl.DateTimeFormat {
  const existente = formateadoresZonaHoraria.get(zonaHoraria);
  if (existente) return existente;
  const creado = new Intl.DateTimeFormat("en-GB", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  formateadoresZonaHoraria.set(zonaHoraria, creado);
  return creado;
}

function rellenarDos(valor: number): string {
  return String(valor).padStart(2, "0");
}

function limpiarFuente(fuente?: string): string {
  const valor = String(fuente || "").trim();
  return valor || FUENTE_DESCONOCIDA;
}

function sigmoideEstable(valor: number): number {
  if (valor >= 0) return 1 / (1 + Math.exp(-valor));
  const exponencial = Math.exp(valor);
  return exponencial / (1 + exponencial);
}

function porcentaje(parte: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return limitar((parte / total) * 100, 0, 100);
}

function numeroFinito(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === "") return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

function numeroNoNegativo(valor: unknown): number {
  return Math.max(0, numeroFinito(valor) ?? 0);
}

function numeroPositivo(valor: unknown, fallback: number): number {
  const numero = numeroFinito(valor);
  return numero !== undefined && numero > 0 ? numero : fallback;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
