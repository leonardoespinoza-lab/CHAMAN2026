import {
  IResistencia,
  TEnfermedad,
  TEnfermedadId,
  TEstadoResistencia,
} from "../entidades/semilla";
import { ICalidadDatoMotor } from "../compartidos/calidad-datos";

export interface IDefinicionEnfermedad {
  id: TEnfermedadId;
  nombre: TEnfermedad;
  cultivo: string;
  aliases: string[];
  motor: "operativo" | "experimental" | "sin_modelo";
}

/**
 * Versión funcional del motor sanitario de trigo aprobada en julio de 2026.
 * La versión forma parte del dato: nunca deben continuarse acumuladores de una
 * versión anterior después de cambiar una fórmula o su ventana de cálculo.
 */
export const TRIGO_MOTOR_SANITARIO_VERSION = 5;
/**
 * Version 2 incorpora el proxy diario conservador de mojado foliar cuando la
 * fuente canonica no dispone de resolucion horaria. Sigue siendo un screening
 * experimental y nunca habilita alertas automaticas.
 */
export const ARVEJA_MOTOR_SANITARIO_VERSION = 2;
export const TRIGO_GDD_BASE_0_INICIO_MIN = 800;
export const TRIGO_GDD_BASE_0_INICIO_CONSERVADOR = 850;
export const TRIGO_GDD_COBERTURA_MINIMA = 0.9;
export const TRIGO_FUSARIUM_GDD_BASE_0_MAX = 530;
export const ROYA_AMARILLA_VENTANA_HORAS = 10 * 24;
export const ROYA_AMARILLA_COBERTURA_HORARIA_MINIMA = 0.9;
export const ROYA_AMARILLA_RACHA_MINIMA_HORAS = 4;
export const ROYA_AMARILLA_UMBRAL_TEMPRANO_PCT = 5;
export const ROYA_AMARILLA_UMBRAL_FUERTE_PCT = 15;
export const ROYA_AMARILLA_UMBRAL_MUY_FUERTE_PCT = 20;

export interface IContextoVentanaSanitariaTrigo {
  gddBase0DesdeSiembra: number;
  coberturaGdd: number;
  etapa: number;
  fenologiaObservada: boolean;
  calidadClima?: ICalidadDatoMotor;
}

export interface IResultadoVentanaSanitariaTrigo {
  activa: boolean;
  inicioPorFenologiaObservada: boolean;
  umbralGddAplicado: number;
  coberturaSuficiente: boolean;
}

export const ENFERMEDADES_CANONICAS: IDefinicionEnfermedad[] = [
  {
    id: "trigo.mancha_amarilla",
    nombre: "Mancha Amarilla",
    cultivo: "Trigo",
    aliases: ["MA", "Drechslera tritici"],
    motor: "operativo",
  },
  {
    id: "trigo.mancha_hoja",
    nombre: "Mancha de la Hoja",
    cultivo: "Trigo",
    aliases: ["MH", "SH", "Septoria", "Septoriosis"],
    motor: "operativo",
  },
  {
    id: "trigo.roya_hoja",
    nombre: "Roya de la Hoja",
    cultivo: "Trigo",
    aliases: ["RH", "Puccinia triticina", "Roya anaranjada de la hoja"],
    motor: "operativo",
  },
  {
    id: "trigo.roya_tallo",
    nombre: "Roya del Tallo",
    cultivo: "Trigo",
    aliases: ["RT", "Puccinia graminis"],
    motor: "sin_modelo",
  },
  {
    id: "trigo.roya_anaranjada",
    nombre: "Roya Amarilla/Estriada",
    cultivo: "Trigo",
    aliases: [
      "RA",
      "Roya Anaranjada",
      "Roya Amarilla",
      "Roya Amarilla o Estriada",
      "Puccinia striiformis",
    ],
    // El identificador se conserva por compatibilidad. P. striiformis es roya
    // amarilla/estriada. La ecuación propietaria de Chaman permanece en sombra
    // hasta completar cobertura horaria y calibración operativa específica.
    motor: "experimental",
  },
  {
    id: "trigo.fusarium_espiga",
    nombre: "Fusarium de la Espiga",
    cultivo: "Trigo",
    aliases: ["FE", "Fusarium", "Fusariosis"],
    motor: "operativo",
  },
  {
    id: "cebada.mancha_red",
    nombre: "Mancha en Red",
    cultivo: "Cebada",
    aliases: ["Drechslera teres", "Net blotch"],
    motor: "operativo",
  },
  {
    id: "cebada.escaldadura",
    nombre: "Escaldadura de la Cebada",
    cultivo: "Cebada",
    aliases: ["Escaldadura", "Rhynchosporium"],
    motor: "operativo",
  },
  {
    id: "cebada.roya_hoja",
    nombre: "Roya de la Hoja de Cebada",
    cultivo: "Cebada",
    aliases: ["Roya cebada"],
    motor: "operativo",
  },
  {
    id: "cebada.fusariosis_espiga",
    nombre: "Fusariosis de la Espiga de Cebada",
    cultivo: "Cebada",
    aliases: ["Fusariosis cebada"],
    motor: "operativo",
  },
  {
    id: "soja.fin_ciclo",
    nombre: "Fin de Ciclo",
    cultivo: "Soja",
    aliases: ["Fin de Ciclo Soja", "EFC"],
    motor: "operativo",
  },
  {
    id: "soja.cancro_tallo",
    nombre: "Cancro del Tallo de la Soja",
    cultivo: "Soja",
    aliases: ["Cancro del tallo", "CAN", "Diaporthe phaseolorum"],
    motor: "sin_modelo",
  },
  {
    id: "soja.phytophthora",
    nombre: "Podredumbre de Raiz y Tallo por Phytophthora",
    cultivo: "Soja",
    aliases: ["Phytophthora", "PH", "Phytophthora sojae"],
    motor: "sin_modelo",
  },
  {
    id: "soja.muerte_repentina",
    nombre: "Sindrome de Muerte Repentina",
    cultivo: "Soja",
    aliases: ["Muerte subita", "SMR", "Fusarium virguliforme"],
    motor: "sin_modelo",
  },
  {
    id: "soja.mancha_ojo_rana",
    nombre: "Mancha Ojo de Rana",
    cultivo: "Soja",
    aliases: ["MOR", "Cercospora sojina"],
    motor: "sin_modelo",
  },
  {
    id: "maiz.roya",
    nombre: "Roya del Maiz",
    cultivo: "Maiz",
    aliases: ["Roya del Maíz", "Roya maiz"],
    motor: "operativo",
  },
  {
    id: "maiz.tizon_foliar",
    nombre: "Tizon Foliar del Maiz",
    cultivo: "Maiz",
    aliases: ["Tizon foliar", "Tizón foliar", "Tizon"],
    motor: "sin_modelo",
  },
  {
    id: "arveja.ascochyta",
    nombre: "Complejo Ascochyta de la Arveja",
    cultivo: "Arveja",
    aliases: ["Ascochyta", "Tizon de la arveja", "Mancha negra de la arveja"],
    motor: "experimental",
  },
  {
    id: "arveja.mildiu",
    nombre: "Mildiu de la Arveja",
    cultivo: "Arveja",
    aliases: ["Peronospora viciae", "Mildiu arveja"],
    motor: "experimental",
  },
  {
    id: "arveja.oidio",
    nombre: "Oidio de la Arveja",
    cultivo: "Arveja",
    aliases: ["Erysiphe pisi", "Oidio arveja"],
    motor: "experimental",
  },
  {
    id: "vid.oidio",
    nombre: "Oidio",
    cultivo: "Vid",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "vid.botritis",
    nombre: "Botritis",
    cultivo: "Vid",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "vid.mildiu",
    nombre: "Mildiu",
    cultivo: "Vid",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "papa.tizon_tardio",
    nombre: "Tizon Tardio",
    cultivo: "Papa",
    aliases: ["Phytophthora infestans"],
    motor: "sin_modelo",
  },
  {
    id: "papa.tizon_temprano",
    nombre: "Tizon Temprano",
    cultivo: "Papa",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "papa.rhizoctonia",
    nombre: "Rhizoctonia",
    cultivo: "Papa",
    aliases: ["Rhizoctonia solani"],
    motor: "sin_modelo",
  },
  {
    id: "manzano.sarna",
    nombre: "Sarna del Manzano",
    cultivo: "Manzano",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "manzano.oidio",
    nombre: "Oidio del Manzano",
    cultivo: "Manzano",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "frutales.fuego_bacteriano",
    nombre: "Fuego Bacteriano",
    cultivo: "Frutales",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "manzano.carpocapsa",
    nombre: "Carpocapsa",
    cultivo: "Manzano",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "peral.sarna",
    nombre: "Sarna del Peral",
    cultivo: "Peral",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "peral.psila",
    nombre: "Psila del Peral",
    cultivo: "Peral",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "pecan.sarna",
    nombre: "Sarna del Pecan",
    cultivo: "Pecan",
    aliases: [],
    motor: "sin_modelo",
  },
  {
    id: "pecan.bacteriosis",
    nombre: "Bacteriosis del Pecan",
    cultivo: "Pecan",
    aliases: [],
    motor: "sin_modelo",
  },
];

export interface IResistenciaResuelta {
  resistencia?: IResistencia;
  multiplicador: number;
  indiceResistencia: number;
  estado: TEstadoResistencia;
  desconocida: boolean;
  limitaciones: string[];
}

export interface IHoraClimaEnfermedad {
  temperatura: number;
  humedadRelativa: number;
}

export interface IHoraRoyaAmarilla {
  fecha: string;
  temperatura?: number;
  humedadRelativa?: number;
  lluviaMm?: number;
}

export type TNivelOportunidadRoyaAmarilla =
  "sin_datos" | "sin_senal" | "senal_temprana" | "fuerte" | "muy_fuerte";

export interface IResultadoRoyaAmarillaElJarroudi {
  calculable: boolean;
  horasEsperadas: number;
  horasValidas: number;
  cobertura: number;
  horasFavorables: number;
  rachasFavorables: number;
  rachaMaximaHoras: number;
  frecuenciaAmbientalPct: number;
  nivel: TNivelOportunidadRoyaAmarilla;
}

/**
 * Oportunidad ambiental de infeccion de roya amarilla/estriada.
 *
 * Criterio horario publicado por El Jarroudi et al. (2017),
 * DOI 10.1094/PDIS-12-16-1766-RE: 4 < T < 16 C, HR > 92 % y lluvia
 * <= 0,1 mm durante, como minimo, cuatro horas consecutivas. Chaman aplica
 * el criterio a una ventana movil de diez dias (adaptacion declarada) y no lo
 * interpreta como presencia, incidencia ni severidad de enfermedad.
 */
export function evaluarRoyaAmarillaElJarroudi2017(
  horas: IHoraRoyaAmarilla[],
): IResultadoRoyaAmarillaElJarroudi {
  const unicas = new Map<number, IHoraRoyaAmarilla>();
  for (const hora of horas || []) {
    const instante = new Date(hora?.fecha).getTime();
    if (Number.isFinite(instante)) unicas.set(instante, hora);
  }
  const todasOrdenadas = [...unicas.entries()].sort(([a], [b]) => a - b);
  const ultimoInstante = todasOrdenadas[todasOrdenadas.length - 1]?.[0];
  const primerInstante = Number.isFinite(ultimoInstante)
    ? Number(ultimoInstante) -
      (ROYA_AMARILLA_VENTANA_HORAS - 1) * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const ordenadas = todasOrdenadas.filter(
    ([instante]) => instante >= primerInstante && instante <= ultimoInstante,
  );

  let horasValidas = 0;
  let horasFavorables = 0;
  let rachasFavorables = 0;
  let rachaActual = 0;
  let rachaMaximaHoras = 0;
  let instanteAnterior: number | undefined;

  const cerrarRacha = () => {
    if (rachaActual >= ROYA_AMARILLA_RACHA_MINIMA_HORAS) {
      horasFavorables += rachaActual;
      rachasFavorables += 1;
      rachaMaximaHoras = Math.max(rachaMaximaHoras, rachaActual);
    }
    rachaActual = 0;
  };

  for (const [instante, hora] of ordenadas) {
    const temperatura = Number(hora.temperatura);
    const humedad = Number(hora.humedadRelativa);
    const lluvia = Number(hora.lluviaMm);
    const valida =
      Number.isFinite(temperatura) &&
      Number.isFinite(humedad) &&
      Number.isFinite(lluvia) &&
      temperatura >= -60 &&
      temperatura <= 60 &&
      humedad >= 0 &&
      humedad <= 100 &&
      lluvia >= 0;
    const consecutiva =
      instanteAnterior !== undefined &&
      Math.abs(instante - instanteAnterior - 60 * 60 * 1000) <= 60 * 1000;
    if (!consecutiva && instanteAnterior !== undefined) cerrarRacha();

    if (!valida) {
      cerrarRacha();
      instanteAnterior = instante;
      continue;
    }
    horasValidas += 1;
    const favorable =
      temperatura > 4 && temperatura < 16 && humedad > 92 && lluvia <= 0.1;
    if (favorable) rachaActual += 1;
    else cerrarRacha();
    instanteAnterior = instante;
  }
  cerrarRacha();

  const cobertura = Math.min(1, horasValidas / ROYA_AMARILLA_VENTANA_HORAS);
  const calculable = cobertura >= ROYA_AMARILLA_COBERTURA_HORARIA_MINIMA;
  const frecuenciaAmbientalPct =
    (horasFavorables / ROYA_AMARILLA_VENTANA_HORAS) * 100;
  const nivel: TNivelOportunidadRoyaAmarilla = !calculable
    ? "sin_datos"
    : frecuenciaAmbientalPct >= ROYA_AMARILLA_UMBRAL_MUY_FUERTE_PCT
      ? "muy_fuerte"
      : frecuenciaAmbientalPct >= ROYA_AMARILLA_UMBRAL_FUERTE_PCT
        ? "fuerte"
        : frecuenciaAmbientalPct >= ROYA_AMARILLA_UMBRAL_TEMPRANO_PCT
          ? "senal_temprana"
          : "sin_senal";

  return {
    calculable,
    horasEsperadas: ROYA_AMARILLA_VENTANA_HORAS,
    horasValidas,
    cobertura: +cobertura.toFixed(4),
    horasFavorables,
    rachasFavorables,
    rachaMaximaHoras,
    frecuenciaAmbientalPct: +frecuenciaAmbientalPct.toFixed(2),
    nivel,
  };
}

export type TNivelScreeningArveja = "bajo" | "medio" | "alto";

export interface IScreeningEnfermedadArveja {
  nivel: TNivelScreeningArveja;
  indiceAmbiental: number;
  fundamentos: string[];
}

/**
 * Screening ambiental, no probabilidad de infeccion. Los indices 20/50/80
 * permiten ordenar la UI sin presentar una precision epidemiologica falsa.
 */
function screeningArveja(
  nivel: TNivelScreeningArveja,
  fundamentos: string[],
): IScreeningEnfermedadArveja {
  return {
    nivel,
    indiceAmbiental: nivel === "alto" ? 80 : nivel === "medio" ? 50 : 20,
    fundamentos,
  };
}

export function evaluarAscochytaArveja(input: {
  temperatura: number;
  horasMojado: number;
  lluviaMm: number;
}): IScreeningEnfermedadArveja {
  const temperatura = Number(input.temperatura);
  const horasMojado = Number(input.horasMojado);
  const lluviaMm = Number(input.lluviaMm);
  if (![temperatura, horasMojado, lluviaMm].every(Number.isFinite)) {
    return screeningArveja("bajo", ["Variables climaticas incompletas"]);
  }
  if (
    temperatura >= 15 &&
    temperatura <= 25 &&
    horasMojado >= 8 &&
    lluviaMm > 0
  ) {
    return screeningArveja("alto", [
      "Temperatura proxima al optimo experimental de 20 C",
      "Al menos 8 h de mojado y lluvia con potencial de dispersion",
    ]);
  }
  if (temperatura >= 5 && temperatura <= 30 && horasMojado >= 6) {
    return screeningArveja("medio", [
      "Temperatura compatible y mojado foliar sostenido",
    ]);
  }
  return screeningArveja("bajo", ["Ambiente poco favorable en esta lectura"]);
}

export function evaluarMildiuArveja(input: {
  temperatura: number;
  horasMojado: number;
  humedadRelativa: number;
}): IScreeningEnfermedadArveja {
  const temperatura = Number(input.temperatura);
  const horasMojado = Number(input.horasMojado);
  const humedadRelativa = Number(input.humedadRelativa);
  if (![temperatura, horasMojado, humedadRelativa].every(Number.isFinite)) {
    return screeningArveja("bajo", ["Variables climaticas incompletas"]);
  }
  if (
    temperatura >= 8 &&
    temperatura <= 20 &&
    horasMojado >= 6 &&
    humedadRelativa >= 91
  ) {
    return screeningArveja("alto", [
      "6 h o mas de mojado entre 8 y 20 C",
      "HR compatible con esporulacion (91% o superior)",
    ]);
  }
  if (temperatura >= 1 && temperatura <= 24 && horasMojado >= 4) {
    return screeningArveja("medio", [
      "Se alcanza el minimo experimental de 4 h de mojado",
    ]);
  }
  return screeningArveja("bajo", [
    "No se alcanza la ventana minima de infeccion",
  ]);
}

export function evaluarOidioArveja(input: {
  temperatura: number;
  lluviaMm: number;
  etapaReproductiva: boolean;
}): IScreeningEnfermedadArveja {
  const temperatura = Number(input.temperatura);
  const lluviaMm = Number(input.lluviaMm);
  if (![temperatura, lluviaMm].every(Number.isFinite)) {
    return screeningArveja("bajo", ["Variables climaticas incompletas"]);
  }
  if (!input.etapaReproductiva) {
    return screeningArveja("bajo", [
      "Fuera de la ventana desde floracion a vainas",
    ]);
  }
  if (temperatura >= 18 && temperatura <= 28 && lluviaMm < 1) {
    return screeningArveja("alto", [
      "Etapa reproductiva con ambiente templado-calido y seco",
    ]);
  }
  if (temperatura >= 12 && temperatura <= 30 && lluviaMm < 5) {
    return screeningArveja("medio", [
      "Etapa reproductiva con ambiente compatible para monitoreo",
    ]);
  }
  return screeningArveja("bajo", [
    "Prioridad de monitoreo reducida en esta lectura",
  ]);
}

export const limitar = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function normalizarNombreEnfermedad(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function getEnfermedadCanonica(
  value?: string,
): IDefinicionEnfermedad | undefined {
  const normalizado = normalizarNombreEnfermedad(value);
  if (!normalizado) return undefined;
  return ENFERMEDADES_CANONICAS.find((item) =>
    [item.id, item.nombre, ...item.aliases]
      .map(normalizarNombreEnfermedad)
      .includes(normalizado),
  );
}

export function getEnfermedadPorId(
  id?: TEnfermedadId,
): IDefinicionEnfermedad | undefined {
  return ENFERMEDADES_CANONICAS.find((item) => item.id === id);
}

export function enfermedadCoincide(
  resistencia: Pick<IResistencia, "idEnfermedad" | "enfermedad">,
  disease: TEnfermedadId | TEnfermedad | string,
): boolean {
  const objetivo = getEnfermedadCanonica(disease);
  if (!objetivo) return false;
  if (resistencia.idEnfermedad) return resistencia.idEnfermedad === objetivo.id;
  return getEnfermedadCanonica(resistencia.enfermedad)?.id === objetivo.id;
}

export function campaniaAOrden(value?: string): number {
  const text = String(value || "").trim();
  const years: number[] = [];
  const pattern = /(?:20)?(\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const year = Number(match[1]);
    years.push(year >= 70 ? 1900 + year : 2000 + year);
  }
  if (!years.length) return 0;
  return years[0] * 10000 + (years[1] || years[0]);
}

function prioridadEstado(value?: TEstadoResistencia): number {
  if (value === "observada") return 4;
  if (value === "historica") return 3;
  if (value === "inferida") return 2;
  return 1;
}

export function seleccionarResistenciaMasReciente(
  resistencias: IResistencia[] | undefined,
  disease: TEnfermedadId | TEnfermedad | string,
): IResistencia | undefined {
  return [...(resistencias || [])]
    .filter((item) => enfermedadCoincide(item, disease))
    .sort((a, b) => {
      const byCampaign =
        campaniaAOrden(b.campaniaFuente) - campaniaAOrden(a.campaniaFuente);
      if (byCampaign) return byCampaign;
      const byDate = String(b.fechaFuente || "").localeCompare(
        String(a.fechaFuente || ""),
      );
      if (byDate) return byDate;
      return prioridadEstado(b.estado) - prioridadEstado(a.estado);
    })[0];
}

export function indiceResistenciaDesdeMultiplicador(
  multiplicador?: number,
): number {
  if (multiplicador === undefined || multiplicador === null) return 0;
  const value = Number(multiplicador);
  if (!Number.isFinite(value)) return 0;
  if (value <= 0.35) return 1;
  if (value <= 0.55) return 2 / 3;
  if (value <= 0.8) return 1 / 3;
  return 0;
}

export function resolverResistencia(
  resistencias: IResistencia[] | undefined,
  disease: TEnfermedadId | TEnfermedad | string,
  fallbackMultiplicador = 1,
): IResistenciaResuelta {
  const resistencia = seleccionarResistenciaMasReciente(resistencias, disease);
  const definicion = getEnfermedadCanonica(disease);
  const estadoTrazable = ["observada", "historica", "inferida"].includes(
    String(resistencia?.estado || ""),
  );
  const multiplicadorCargado =
    resistencia?.multiplicador !== undefined &&
    resistencia?.multiplicador !== null &&
    String(resistencia.multiplicador).trim() !== "" &&
    Number.isFinite(Number(resistencia.multiplicador));
  const factoresTrigo: Record<string, number> = {
    S: 1,
    MS: 0.75,
    MR: 0.5,
    R: 0.05,
  };
  const perfil = String(resistencia?.perfil || "")
    .trim()
    .toUpperCase();
  const factorEsperado = factoresTrigo[perfil];
  const perfilTrigoCoherente =
    definicion?.cultivo !== "Trigo" ||
    (factorEsperado !== undefined &&
      multiplicadorCargado &&
      Math.abs(Number(resistencia?.multiplicador) - factorEsperado) < 0.0001);
  const limitaciones = [
    ...(!resistencia ? ["Sin resistencia varietal para la enfermedad."] : []),
    ...(resistencia && !estadoTrazable
      ? ["Registro varietal sin estado trazable."]
      : []),
    ...(resistencia && !multiplicadorCargado
      ? ["Registro varietal sin factor numerico utilizable."]
      : []),
    ...(resistencia && !perfilTrigoCoherente
      ? [
          `Perfil/factor varietal inconsistente para trigo (${perfil || "sin perfil"}/${String(
            resistencia.multiplicador ?? "sin factor",
          )}).`,
        ]
      : []),
  ];
  // Los documentos legados pueden contener una etiqueta de enfermedad pero
  // no estado/fuente ni factor utilizable. Eso es dato desconocido, no una
  // observacion susceptible habilitada para emitir alertas.
  const desconocida =
    !resistencia ||
    !estadoTrazable ||
    !multiplicadorCargado ||
    !perfilTrigoCoherente;
  const multiplicadorUtilizable = desconocida
    ? fallbackMultiplicador
    : Number(resistencia?.multiplicador);
  const multiplicador = limitar(Number(multiplicadorUtilizable), 0.01, 1.4);
  const indiceCargado =
    resistencia?.indiceResistencia !== undefined &&
    resistencia?.indiceResistencia !== null &&
    String(resistencia.indiceResistencia).trim() !== "" &&
    Number.isFinite(Number(resistencia.indiceResistencia));
  // Una resistencia desconocida nunca debe reducir el riesgo sanitario. Si el
  // registro no es trazable, se deriva el indice desde el fallback susceptible
  // (multiplicador 1 => indice 0), aunque un documento legado traiga un IR alto.
  const indiceResistencia = limitar(
    Number(
      !desconocida && indiceCargado
        ? resistencia?.indiceResistencia
        : indiceResistenciaDesdeMultiplicador(multiplicadorUtilizable),
    ),
    0,
    1,
  );
  return {
    resistencia,
    multiplicador,
    indiceResistencia,
    estado: resistencia?.estado || "desconocida",
    desconocida,
    limitaciones,
  };
}

export interface ICandidatoAlertaSanitaria {
  idEnfermedad?: TEnfermedadId;
  enfermedad?: TEnfermedad;
  resultado: number;
  estado?: "calculado" | "sin_datos" | "fuera_ventana";
  modelo?: {
    version: number;
    validacion?: "operativo" | "operativo_provisional" | "experimental";
  };
  calidadDatos?: {
    nivel?: "alta" | "media" | "baja" | "sin_datos";
  };
  resistenciaUsada?: {
    estado?: TEstadoResistencia;
    confianza?: "alta" | "media" | "baja" | "sin_datos";
    campaniaFuente?: string;
    fechaFuente?: string;
  };
  variables?: unknown;
}

export const UMBRAL_ALERTA_SANITARIA = 15;
export const VIGENCIA_ALERTA_SANITARIA_HORAS = 72;

export type TNivelRiesgoSanitario = "bajo" | "medio" | "alto";

/**
 * Estado ejecutivo unico para mapas, listados, dashboards e informes.
 *
 * `rojo` significa que al menos una lectura satisface el contrato completo de
 * alerta del motor (ventana, calidad, resistencia, version y evidencia
 * ambiental). `amarillo` es seguimiento de una lectura operativa que aun no
 * satisface ese contrato. La ausencia de una lectura operativa nunca fabrica
 * una alarma: se informa por separado mediante `sinDatosOperativos`.
 */
export type TSemaforoSanitario = "verde" | "amarillo" | "rojo";

export interface IEvaluacionSanitariaAgregada {
  semaforo: TSemaforoSanitario;
  operativas: ICandidatoAlertaSanitaria[];
  alertables: ICandidatoAlertaSanitaria[];
  principal?: ICandidatoAlertaSanitaria;
  maximo?: number;
  sinDatosOperativos: boolean;
}

export interface IUmbralesRiesgoSanitario {
  medio: number;
  alto: number;
  escalaDirecta: boolean;
}

/**
 * Escala canónica de lectura sanitaria usada por tarjetas, alertas e informes.
 * Cebada conserva la escala directa histórica 35/60; el resto de los modelos
 * operativos usa 15/20. Los screenings experimentales se visualizan en su
 * escala ordinal 50/80, pero nunca se vuelven alertables por esta función.
 */
export function getUmbralesRiesgoSanitario(
  cultivo?: string,
  experimental = false,
): IUmbralesRiesgoSanitario {
  if (experimental) return { medio: 50, alto: 80, escalaDirecta: true };
  const cultivoCanonico = `${cultivo || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (cultivoCanonico === "cebada") {
    return { medio: 35, alto: 60, escalaDirecta: true };
  }
  return { medio: 15, alto: 20, escalaDirecta: false };
}

export function clasificarNivelRiesgoSanitario(
  resultado: number,
  cultivo?: string,
  experimental = false,
): TNivelRiesgoSanitario {
  const valor = Number(resultado);
  if (!Number.isFinite(valor)) return "bajo";
  const umbrales = getUmbralesRiesgoSanitario(cultivo, experimental);
  if (valor >= umbrales.alto) return "alto";
  if (valor >= umbrales.medio) return "medio";
  return "bajo";
}

export function evaluarSanidadAgregada(
  predicciones: ICandidatoAlertaSanitaria[] = [],
  cultivo?: string,
  fechaPrediccion?: string,
  ahoraMs = Date.now(),
): IEvaluacionSanitariaAgregada {
  const vigentes =
    fechaPrediccion &&
    !esFechaPrediccionSanitariaReciente(fechaPrediccion, ahoraMs)
      ? []
      : predicciones.filter(Boolean);
  const operativas = vigentes.filter((item) =>
    esLecturaSanitariaOperativa(item),
  );
  const alertables = operativas.filter((item) =>
    esPrediccionSanitariaAlertable(item),
  );
  const candidatasPrincipales = alertables.length ? alertables : operativas;
  const principal = candidatasPrincipales.reduce<
    ICandidatoAlertaSanitaria | undefined
  >(
    (max, item) =>
      !max || Number(item.resultado) > Number(max.resultado) ? item : max,
    undefined,
  );
  const maximo = principal ? Number(principal.resultado) : undefined;
  const umbralSeguimiento = getUmbralesRiesgoSanitario(cultivo).medio;
  const requiereSeguimiento = operativas.some(
    (item) => Number(item.resultado) >= umbralSeguimiento,
  );

  return {
    semaforo: alertables.length
      ? "rojo"
      : requiereSeguimiento
        ? "amarillo"
        : "verde",
    operativas,
    alertables,
    principal,
    maximo,
    sinDatosOperativos: operativas.length === 0,
  };
}

export function esFechaPrediccionSanitariaReciente(
  fecha?: string,
  ahoraMs = Date.now(),
): boolean {
  if (!fecha) return false;
  const fechaMs = new Date(fecha).getTime();
  if (!Number.isFinite(fechaMs)) return false;
  const edadHoras = (ahoraMs - fechaMs) / (1000 * 60 * 60);
  // Se tolera hasta un día futuro por diferencias de corte civil/UTC, pero un
  // backfill histórico nunca debe disparar una notificación actual.
  return edadHoras >= -24 && edadHoras <= VIGENCIA_ALERTA_SANITARIA_HORAS;
}

/**
 * Determina si una lectura sanitaria puede tratarse como un resultado
 * operativo, independientemente de su nivel de riesgo. Una lectura operativa
 * baja sigue siendo información válida para informes e historiales, aunque no
 * alcance el umbral necesario para generar una alerta.
 *
 * Los modelos experimentales o sin modelo, las salidas incompletas y las
 * lecturas de trigo sin versión y trazabilidad vigentes permanecen visibles
 * para auditoría, pero nunca se clasifican como operativas.
 */
export function esLecturaSanitariaOperativa(
  prediccion: ICandidatoAlertaSanitaria,
): boolean {
  const variables = (prediccion.variables || {}) as {
    resultadoCrudo?: number;
  };
  if (prediccion.estado !== "calculado") return false;
  if (!Number.isFinite(prediccion.resultado)) return false;
  if (prediccion.resultado < 0 || prediccion.resultado > 100) return false;
  // La ausencia de validacion no es compatibilidad retroactiva. Un registro
  // legado, provisional o incompleto puede permanecer visible para auditoria,
  // pero solo una declaracion positiva y explicita habilita uso operativo.
  if (prediccion.modelo?.validacion !== "operativo") return false;
  if (
    prediccion.calidadDatos?.nivel === "baja" ||
    prediccion.calidadDatos?.nivel === "sin_datos"
  ) {
    return false;
  }
  const estadoResistencia = prediccion.resistenciaUsada?.estado;
  if (
    estadoResistencia !== "observada" &&
    estadoResistencia !== "historica" &&
    estadoResistencia !== "inferida"
  ) {
    return false;
  }
  const definicion = getEnfermedadPorId(prediccion.idEnfermedad);
  if (!definicion || definicion.motor !== "operativo") return false;
  if (
    definicion.cultivo === "Trigo" &&
    Number(prediccion.modelo?.version || 0) < TRIGO_MOTOR_SANITARIO_VERSION
  ) {
    return false;
  }
  if (definicion.cultivo === "Trigo") {
    // Las ecuaciones contractuales se muestran y auditan, pero una salida
    // provisional no se transforma en alarma hasta completar validacion de
    // fuente, ventana, region y desempeño contra observaciones de campo.
    const confianza = prediccion.resistenciaUsada?.confianza;
    if (confianza !== "alta" && confianza !== "media") return false;
    const ordenCampania = campaniaAOrden(
      prediccion.resistenciaUsada?.campaniaFuente,
    );
    const anioCampania = ordenCampania % 10000;
    const anioActual = new Date().getUTCFullYear();
    if (!anioCampania || anioActual - anioCampania > 2) return false;
    const resultadoCrudo = Number(variables.resultadoCrudo);
    if (
      !Number.isFinite(resultadoCrudo) ||
      resultadoCrudo < 0 ||
      resultadoCrudo > 100
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Una lectura sanitaria puede alimentar una alerta sólo cuando, además de
 * ser operativa, supera el umbral general y satisface las reglas específicas
 * que evitan alertas basales sin evidencia ambiental suficiente.
 */
export function esPrediccionSanitariaAlertable(
  prediccion: ICandidatoAlertaSanitaria,
): boolean {
  if (!esLecturaSanitariaOperativa(prediccion)) return false;
  const definicion = getEnfermedadPorId(prediccion.idEnfermedad);
  const umbral = getUmbralesRiesgoSanitario(definicion?.cultivo).medio;
  if (prediccion.resultado < umbral) return false;
  const variables = (prediccion.variables || {}) as {
    PMoj?: number;
    formulaVersion?: number;
    coberturaVentana?: number;
    eventosCompatibles?: number;
    diasFavorablesVentana?: number;
  };
  // Mancha en Red V4 es anticipativa: una alerta exige evidencia horaria en
  // la ventana móvil y presión de infección alta. Los valores medios quedan
  // visibles para recorrida, pero no generan una alarma automática.
  if (prediccion.idEnfermedad === "cebada.mancha_red") {
    return (
      Number(variables.formulaVersion || 0) >=
        CEBADA_MANCHA_RED_MOTOR_VERSION &&
      Number(variables.coberturaVentana || 0) >=
        CEBADA_MANCHA_RED_COBERTURA_MINIMA &&
      Number(
        variables.diasFavorablesVentana ?? variables.eventosCompatibles ?? 0,
      ) >= 1 &&
      prediccion.resultado >= CEBADA_MANCHA_RED_UMBRAL_ALERTA
    );
  }
  // El intercepto del modelo de Fusarium supera por si solo el umbral general
  // de alerta. Sin al menos un periodo de mojado compatible no hay evidencia
  // ambiental suficiente para transformar esa salida basal en una alarma.
  if (
    prediccion.idEnfermedad === "trigo.fusarium_espiga" &&
    Number(variables.PMoj || 0) < 1
  ) {
    return false;
  }
  return true;
}

/**
 * Acumulación térmica diaria con temperatura base 0 °C.
 * Los valores negativos no pueden restar desarrollo térmico.
 */
export function gradosDiaBase0(temperaturaMedia: number): number {
  return Number.isFinite(temperaturaMedia) ? Math.max(temperaturaMedia, 0) : 0;
}

/**
 * Abre la ventana foliar al observar a campo el fin de macollaje/espiguilla
 * terminal, o de forma conservadora a los 850 GDD base 0 con al menos 90 % de
 * cobertura térmica desde siembra. El rango 800–850 GDD queda trazado sin
 * adelantar una alarma cuando sólo hay fenología estimada.
 */
export function resolverVentanaSanitariaFoliarTrigo(
  contexto: IContextoVentanaSanitariaTrigo,
): IResultadoVentanaSanitariaTrigo {
  const gdd = Math.max(Number(contexto.gddBase0DesdeSiembra) || 0, 0);
  const cobertura = limitar(Number(contexto.coberturaGdd) || 0, 0, 1);
  const coberturaSuficiente = cobertura >= TRIGO_GDD_COBERTURA_MINIMA;
  const inicioPorFenologiaObservada =
    Boolean(contexto.fenologiaObservada) && Number(contexto.etapa) >= 2;
  const activa =
    inicioPorFenologiaObservada ||
    (coberturaSuficiente && gdd >= TRIGO_GDD_BASE_0_INICIO_CONSERVADOR);

  return {
    activa,
    inicioPorFenologiaObservada,
    umbralGddAplicado: inicioPorFenologiaObservada
      ? TRIGO_GDD_BASE_0_INICIO_MIN
      : TRIGO_GDD_BASE_0_INICIO_CONSERVADOR,
    coberturaSuficiente,
  };
}

export function calcularManchaAmarilla(
  DPrHRT: number,
  DPr: number,
  multiplicador: number,
): number {
  return limitar(calcularManchaAmarillaCrudo(DPrHRT, DPr, multiplicador));
}

export function calcularManchaAmarillaCrudo(
  DPrHRT: number,
  DPr: number,
  multiplicador: number,
): number {
  return (-2.25 + 1.62 * DPrHRT + 1.3 * DPr) * multiplicador;
}

export function calcularManchaHoja(
  DHR: number,
  DPr: number,
  multiplicador: number,
): number {
  return limitar(calcularManchaHojaCrudo(DHR, DPr, multiplicador));
}

export function calcularManchaHojaCrudo(
  DHR: number,
  DPr: number,
  multiplicador: number,
): number {
  return (-6.41 + 0.59 * DHR + 2.79 * DPr) * multiplicador;
}

export function calcularRoyaHoja(
  GD: number,
  DHR: number,
  indiceResistencia: number,
): number {
  return limitar(4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * indiceResistencia);
}

/**
 * Contrato funcional trigo 2026. El valor varietal S=1, MS=.75, MR=.5,
 * R=.05 se comporta como factor de susceptibilidad, aunque la fuente recibida
 * lo rotule "índice de resistencia". Se mantiene el nombre correcto en código
 * para evitar una nueva inversión accidental.
 */
export function calcularRoyaHojaTrigo2026(
  GD: number,
  DHR: number,
  factorSusceptibilidad: number,
): number {
  return limitar(
    calcularRoyaHojaTrigo2026Crudo(GD, DHR, factorSusceptibilidad),
  );
}

export function calcularRoyaHojaTrigo2026Crudo(
  GD: number,
  DHR: number,
  factorSusceptibilidad: number,
): number {
  const factor = limitar(factorSusceptibilidad, 0, 1);
  return 4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * (1 - factor);
}

/**
 * @deprecated Formula historica conservada solo para compatibilidad y auditoria.
 * No usar en flujos productivos de trigo 2026.
 */
export function calcularRoyaAnaranjada(
  GD: number,
  DHR: number,
  DL: number,
  indiceResistencia: number,
): number {
  return limitar(
    5.15 + 0.72 * GD + 0.48 * DHR + 0.35 * DL - 35.2 * indiceResistencia,
  );
}

/**
 * Ecuación propietaria de Chaman para el registro legado "Roya Anaranjada".
 * Se conserva exacta para auditoría, pero el catálogo la mantiene experimental
 * hasta completar cobertura horaria y calibración operativa específica.
 */
export function calcularRoyaAnaranjadaTrigo2026(
  GD: number,
  DHR: number,
  DL: number,
  factorSusceptibilidad: number,
): number {
  return limitar(
    calcularRoyaAnaranjadaTrigo2026Crudo(GD, DHR, DL, factorSusceptibilidad),
  );
}

export function calcularRoyaAnaranjadaTrigo2026Crudo(
  GD: number,
  DHR: number,
  DL: number,
  factorSusceptibilidad: number,
): number {
  const factor = limitar(factorSusceptibilidad, 0, 1);
  return 5.15 + 0.72 * GD + 0.48 * DHR + 0.35 * DL - 35.2 * (1 - factor);
}

export function calcularFusariumEspiga(
  PMoj: number,
  GDN: number,
  multiplicador: number,
  activo = true,
): number {
  return activo
    ? limitar(calcularFusariumEspigaCrudo(PMoj, GDN, multiplicador))
    : 0;
}

export function calcularFusariumEspigaCrudo(
  PMoj: number,
  GDN: number,
  multiplicador: number,
): number {
  return (20.37 + 8.63 * PMoj - 0.49 * GDN) * multiplicador;
}

export function calcularFinCicloSoja(
  Lt7: number,
  multiplicador: number,
): number {
  return limitar(((8 * Lt7) / 600) * multiplicador);
}

export function factorTemperaturaManchaRed(temperatura: number): number {
  if (!Number.isFinite(temperatura) || temperatura < 5 || temperatura > 30)
    return 0;
  return ((temperatura - 5) * (30 - temperatura)) / 150;
}

export function factorHumedadManchaRed(humedadRelativa: number): number {
  if (!Number.isFinite(humedadRelativa)) return 0;
  if (humedadRelativa >= 90) return 1;
  if (humedadRelativa >= 80) return 0.5;
  return 0;
}

export function tasaDiariaManchaRedHoraria(
  horas: IHoraClimaEnfermedad[],
  multiplicador: number,
): number {
  const validas = horas.filter(
    (hora) =>
      Number.isFinite(hora.temperatura) &&
      Number.isFinite(hora.humedadRelativa),
  );
  if (!validas.length) return 0;
  return (
    (validas.reduce(
      (sum, hora) =>
        sum +
        factorTemperaturaManchaRed(hora.temperatura) *
          factorHumedadManchaRed(hora.humedadRelativa),
      0,
    ) /
      validas.length) *
    multiplicador
  );
}

export function acumularSeveridadManchaRed(
  severidadAnterior: number,
  tasaDiaria: number,
): number {
  const previa = limitar(severidadAnterior);
  if (tasaDiaria <= 0) return previa;
  if (previa <= 0) return tasaDiaria > 0.2 ? 0.1 : 0;
  return limitar(previa + tasaDiaria * previa * (1 - previa / 100));
}

/**
 * Motor predictivo de Mancha en Red de cebada.
 *
 * La versión 4 reemplaza la severidad acumulativa sin memoria finita por
 * episodios de infección dentro de una ventana móvil. El anclaje biológico es
 * la relación temperatura-tiempo de mojado descripta para Pyrenophora teres:
 * alrededor del 40 % de las infecciones finalmente observadas se establece a
 * las 100 °C-h después del mojado. La respuesta se combina con el perfil
 * varietal y con el rango térmico regional informado para cebada.
 *
 * El resultado es un índice predictivo de presión de infección, condicionado
 * a que exista inóculo. No es incidencia ni severidad observada en tejido.
 *
 * Fuentes:
 * - Shaw MW (1986), Plant Pathology 35:294-309, DOI 10.1111/j.1365-3059.1986.tb02018.x
 * - Petta & Lavilla (2023), Agronomía Mesoamericana 34(1), DOI 10.15517/am.v34i1.51028
 */
export const CEBADA_MANCHA_RED_MOTOR_VERSION = 4;
export const CEBADA_MANCHA_RED_AGREGACION_VERSION = 2;
export const CEBADA_MANCHA_RED_VENTANA_DIAS = 14;
export const CEBADA_MANCHA_RED_COBERTURA_MINIMA = 0.75;
export const CEBADA_MANCHA_RED_UMBRAL_ALERTA = 70;

export interface IEventoInfeccionManchaRed {
  horasMojadoContinuo: number;
  temperaturaMojado: number;
  multiplicadorVarietal: number;
}

export interface IResultadoEventoInfeccionManchaRed {
  riesgo: number;
  gradosHora: number;
  factorTermico: number;
  eventoCompatible: boolean;
}

export interface IResultadoCicloManchaRed {
  indice: number;
  intensidadPico: number;
  intensidadMedia: number;
  persistencia: number;
  diasFavorables: number;
  diasDesdeUltimoEvento: number | null;
}

export function calcularEventoInfeccionManchaRed(
  entrada: IEventoInfeccionManchaRed,
): IResultadoEventoInfeccionManchaRed {
  const horasMojadoContinuo = limitar(
    Number(entrada.horasMojadoContinuo) || 0,
    0,
    24,
  );
  const temperaturaMojado = Number(entrada.temperaturaMojado);
  const multiplicadorVarietal = limitar(
    Number(entrada.multiplicadorVarietal) || 0,
    0.05,
    1.2,
  );

  if (
    !Number.isFinite(temperaturaMojado) ||
    horasMojadoContinuo < 3 ||
    temperaturaMojado <= 2 ||
    temperaturaMojado >= 30
  ) {
    return {
      riesgo: 0,
      gradosHora: 0,
      factorTermico: 0,
      eventoCompatible: false,
    };
  }

  const gradosHora = horasMojadoContinuo * (temperaturaMojado - 2);
  // F(100 °C-h) = 0,40. La exponencial evita saltos artificiales y conserva
  // el significado biológico de la relación temperatura-tiempo de mojado.
  const fraccionEstablecida = 1 - Math.exp((Math.log(0.6) * gradosHora) / 100);
  // Petta & Lavilla sitúan el rango más favorable entre 15 y 25 °C. Por
  // encima de 25 °C se reduce linealmente hasta anularse a 30 °C.
  const factorTermico =
    temperaturaMojado <= 25 ? 1 : limitar((30 - temperaturaMojado) / 5, 0, 1);
  const riesgo = limitar(
    fraccionEstablecida * factorTermico * multiplicadorVarietal * 100,
  );

  return {
    riesgo,
    gradosHora,
    factorTermico,
    eventoCompatible: riesgo > 0,
  };
}

/**
 * Resume una ventana que representa un unico ciclo epidemiologico potencial.
 *
 * Los dias humedos consecutivos no son ensayos Bernoulli independientes: si
 * se multiplicaran sus probabilidades, el indice saturaria cerca de 100 por
 * la sola repeticion del rocio nocturno. La agregacion conserva cuatro
 * dimensiones auditables de la ventana: pico, intensidad media, persistencia
 * y recencia. Es un indice ambiental sobre 100, no una probabilidad de que el
 * cultivo este enfermo.
 */
export function calcularPresionCicloManchaRed(
  eventos: IResultadoEventoInfeccionManchaRed[],
  multiplicadorVarietal: number,
): IResultadoCicloManchaRed {
  if (!eventos.length) {
    return {
      indice: 0,
      intensidadPico: 0,
      intensidadMedia: 0,
      persistencia: 0,
      diasFavorables: 0,
      diasDesdeUltimoEvento: null,
    };
  }

  const favorables = eventos
    .map((evento, indice) => ({ evento, indice }))
    .filter(({ evento }) => evento.eventoCompatible && evento.riesgo > 0);
  if (!favorables.length) {
    return {
      indice: 0,
      intensidadPico: 0,
      intensidadMedia: 0,
      persistencia: 0,
      diasFavorables: 0,
      diasDesdeUltimoEvento: null,
    };
  }

  const riesgos = favorables.map(({ evento }) => limitar(evento.riesgo));
  const intensidadPico = Math.max(...riesgos);
  const intensidadMedia =
    riesgos.reduce((total, riesgo) => total + riesgo, 0) / riesgos.length;
  const persistencia = favorables.length / eventos.length;
  const ultimoIndice = favorables[favorables.length - 1].indice;
  const diasDesdeUltimoEvento = eventos.length - 1 - ultimoIndice;
  const recencia = 1 - limitar(diasDesdeUltimoEvento / 7, 0, 1);
  const kVar = limitar(Number(multiplicadorVarietal) || 0, 0.05, 1.2);

  // Ponderacion operacional explicita y versionada. El componente diario ya
  // incluye susceptibilidad; persistencia y recencia se escalan por el mismo
  // perfil para que una variedad resistente no se vuelva de alto riesgo solo
  // por acumular noches humedas.
  const indice = limitar(
    0.55 * intensidadPico +
      0.25 * intensidadMedia +
      0.15 * (persistencia * 100 * kVar) +
      0.05 * (recencia * 100 * kVar),
  );

  return {
    indice,
    intensidadPico,
    intensidadMedia,
    persistencia,
    diasFavorables: favorables.length,
    diasDesdeUltimoEvento,
  };
}

export function factorTemperaturaEscaldadura(temperatura: number): number {
  if (!Number.isFinite(temperatura) || temperatura < 4 || temperatura > 25)
    return 0;
  if (temperatura >= 10 && temperatura <= 18) return 1;
  if (temperatura < 10) return limitar((temperatura - 4) / 6, 0, 1);
  return limitar((25 - temperatura) / 7, 0, 1);
}

export function factorHorasMojado(horasMojado: number): number {
  if (!Number.isFinite(horasMojado) || horasMojado < 12) return 0;
  if (horasMojado >= 24) return 1;
  return limitar((horasMojado - 12) / 12, 0, 1);
}

export function factorPrecipitacionEscaldadura(lluviaMm: number): number {
  if (!Number.isFinite(lluviaMm)) return 0;
  if (lluviaMm < 1) return 0.2;
  if (lluviaMm >= 5) return 1;
  return limitar(0.2 + ((lluviaMm - 1) / 4) * 0.8, 0.2, 1);
}

export function calcularEscaldadura(
  temperatura: number,
  horasMojado: number,
  lluviaMm: number,
  multiplicador: number,
): number {
  return limitar(
    factorTemperaturaEscaldadura(temperatura) *
      factorHorasMojado(horasMojado) *
      factorPrecipitacionEscaldadura(lluviaMm) *
      multiplicador *
      100,
  );
}

export function gradosDiaRoya(hr: number, temperaturaMedia: number): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr <= 49 || temperaturaMedia < 12) return 0;
  return Math.max(Math.min(temperaturaMedia, 18) - 12, 0);
}

export function gradosDiaRoyaMaiz(
  hr: number,
  temperaturaMedia: number,
): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr < 95 || temperaturaMedia < 8) return 0;
  return Math.max(Math.min(temperaturaMedia, 17) - 8, 0);
}

export function gradosDiaRoyaAnaranjada(
  hr: number,
  temperaturaMedia: number,
): number {
  if (!Number.isFinite(hr) || !Number.isFinite(temperaturaMedia)) return 0;
  if (hr <= 60 || temperaturaMedia < 7 || temperaturaMedia > 14) return 0;
  return temperaturaMedia;
}
