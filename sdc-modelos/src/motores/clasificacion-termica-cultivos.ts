import { Cultivo } from "../entidades/crono";
import { IParametrosAgrometeorologicos } from "../entidades/agrometeorologia";
import { ISemilla } from "../entidades/semilla";

export type TProcesoTermicoPrincipal =
  | "dormancia_perenne"
  | "vernalizacion_cereal"
  | "termico_fotoperiodico";

export type TUnidadTermicaCientifica =
  | "HF"
  | "CP"
  | "VU"
  | "dias_ventana_calibrada"
  | "GDD"
  | "GDH"
  | "fotoperiodo_h";

export type TEstadoEvidenciaTermica =
  | "operativo_con_variedad"
  | "perfil_varietal_validado_requiere_biofix"
  | "requiere_calibracion_varietal";

export interface IFuenteClasificacionTermica {
  titulo: string;
  url: string;
  tipo: "estudio_primario" | "revision" | "extension_oficial";
}

export interface IClasificacionTermicaCultivo {
  cultivo: Cultivo;
  procesoPrincipal: TProcesoTermicoPrincipal;
  /**
   * Algunas variedades pueden responder a vernalización sin que ese sea el
   * proceso rector de toda la especie. Solo habilita una ficha varietal
   * explícita; nunca aplica un requisito genérico al cultivo.
   */
  respuestaVernalizacionOpcional?: boolean;
  descripcion: string;
  unidadesValidas: TUnidadTermicaCientifica[];
  parametrosVarietalesNecesarios: string[];
  noCalcular: string[];
  fuentes: IFuenteClasificacionTermica[];
}

export interface IEvaluacionEvidenciaTermicaVarietal {
  cultivo?: Cultivo;
  variedad?: string;
  procesoPrincipal?: TProcesoTermicoPrincipal;
  estado: TEstadoEvidenciaTermica;
  perfilVarietalValidado: boolean;
  requiereBiofixCampo: boolean;
  aptoParaPrediccionAutomatica: boolean;
  faltantes: string[];
  advertencias: string[];
}

const FUENTE_TRIGO_ARGENTINA: IFuenteClasificacionTermica = {
  titulo:
    "Gene-based model to predict heading date in wheat based on allelic characterization and environmental drivers",
  url: "https://academic.oup.com/jxb/article/76/8/2162/8005022",
  tipo: "estudio_primario",
};

const FUENTE_TRIGO_FOTOPERIODO: IFuenteClasificacionTermica = {
  titulo:
    "Photoperiod-sensitivity genes (Ppd-1): quantifying their effect on the photoperiod response model in wheat",
  url: "https://academic.oup.com/jxb/article/71/3/1185/5607826",
  tipo: "estudio_primario",
};

const FUENTE_CEBADA: IFuenteClasificacionTermica = {
  titulo:
    "Low-temperature acclimation of barley cultivars: response to photoperiod, vernalization and phenological development",
  url: "https://pubmed.ncbi.nlm.nih.gov/17245568/",
  tipo: "estudio_primario",
};

const FUENTE_CEBADA_ARGENTINA: IFuenteClasificacionTermica = {
  titulo:
    "A simple model to predict phenology in malting barley based on cultivar thermo-photoperiodic response",
  url: "https://ri.conicet.gov.ar/handle/11336/4181",
  tipo: "estudio_primario",
};

const FUENTE_SOJA: IFuenteClasificacionTermica = {
  titulo:
    "Combining Simple Phenotyping and Photothermal Algorithm for the Prediction of Soybean Phenology",
  url: "https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2019.01755/full",
  tipo: "estudio_primario",
};

const FUENTE_ARVEJA: IFuenteClasificacionTermica = {
  titulo:
    "Trait Expression and Environmental Responses of Pea Genetic Resources Targeting Cultivation in the Arctic",
  url: "https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2021.688067/full",
  tipo: "estudio_primario",
};

const FUENTE_ARVEJA_VERNALIZACION: IFuenteClasificacionTermica = {
  titulo:
    "Flowering in Pisum: the sites and possible mechanisms of the vernalization response",
  url: "https://doi.org/10.1093/jxb/26.6.860",
  tipo: "estudio_primario",
};

const FUENTE_PAPA: IFuenteClasificacionTermica = {
  titulo:
    "Targeted transcript mapping for agronomic traits in potato",
  url: "https://doi.org/10.1093/jxb/erm140",
  tipo: "estudio_primario",
};

const FUENTE_MANZANO: IFuenteClasificacionTermica = {
  titulo:
    "Chilling and heat requirements of apple cultivars: Future perspectives in a global climate change context",
  url: "https://www.sciencedirect.com/science/article/pii/S0304423825001839",
  tipo: "estudio_primario",
};

const FUENTE_MANZANO_MODELOS: IFuenteClasificacionTermica = {
  titulo:
    "Apple dormancy: regulatory mechanisms and agroclimatic requirements",
  url: "https://www.frontiersin.org/journals/horticulture/articles/10.3389/fhort.2023.1217689/full",
  tipo: "revision",
};

const FUENTE_PERAL: IFuenteClasificacionTermica = {
  titulo: "Chilling requirement for dormancy bud break in European pear",
  url: "https://www.actahort.org/books/909/909_7.htm",
  tipo: "estudio_primario",
};

const FUENTE_PERAL_MEDITERRANEO: IFuenteClasificacionTermica = {
  titulo:
    "Assessment of chilling requirement and threshold temperature of a low chill pear germplasm in the Mediterranean area",
  url: "https://doi.org/10.3390/horticulturae7030045",
  tipo: "estudio_primario",
};

const FUENTE_VID: IFuenteClasificacionTermica = {
  titulo:
    "Chilling Temperature and Duration Interact on the Budbreak of Perlette Grapevine Cuttings",
  url: "https://doi.org/10.21273/HORTSCI.34.6.1",
  tipo: "estudio_primario",
};

const FUENTE_PECAN: IFuenteClasificacionTermica = {
  titulo: "Pecans and Chilling",
  url: "https://site.extension.uga.edu/pecan/2015/02/pecans-and-chilling/",
  tipo: "extension_oficial",
};

const FUENTE_PECAN_PRIMARIA: IFuenteClasificacionTermica = {
  titulo: "Budbreak of pecan cultivars subject to artificial chill",
  url: "https://www.alice.cnptia.embrapa.br/handle/doc/1152922",
  tipo: "estudio_primario",
};

/**
 * Matriz de clasificación, no tabla de coeficientes.
 *
 * Deliberadamente no contiene umbrales numéricos por variedad: esos valores
 * solo pueden incorporarse en la ficha de semilla cuando exista una fuente
 * trazable y el modelo/unidad coincidan con la fuente.
 */
export const MATRIZ_CLASIFICACION_TERMICA_CULTIVOS: Record<
  Cultivo,
  IClasificacionTermicaCultivo
> = {
  Manzano: {
    cultivo: "Manzano",
    procesoPrincipal: "dormancia_perenne",
    descripcion:
      "Liberación de dormancia por frío y posterior forzado térmico; el requisito depende del cultivar.",
    unidadesValidas: ["HF", "CP", "GDH", "GDD"],
    parametrosVarietalesNecesarios: [
      "modelo rector de frío (HF o CP)",
      "requisito del cultivar en la misma unidad",
      "fuente trazable",
      "estado de validación",
      "biofix de brotación o floración para el forzado",
    ],
    noCalcular: [
      "No convertir HF, HFE y CP mediante factores fijos.",
      "No usar HFE legacy como modelo rector.",
      "No declarar brotación solo porque el frío climático alcanzó el objetivo.",
    ],
    fuentes: [FUENTE_MANZANO, FUENTE_MANZANO_MODELOS],
  },
  Peral: {
    cultivo: "Peral",
    procesoPrincipal: "dormancia_perenne",
    descripcion:
      "Liberación de dormancia por frío y posterior forzado; requiere calibración por cultivar.",
    unidadesValidas: ["HF", "CP", "GDH", "GDD"],
    parametrosVarietalesNecesarios: [
      "modelo rector de frío (HF o CP)",
      "requisito del cultivar",
      "fuente trazable",
      "estado de validación",
      "biofix fenológico observado",
    ],
    noCalcular: [
      "No extrapolar requisitos de manzano o de otro cultivar.",
      "No convertir HFE legacy a CP.",
      "No confirmar salida de dormancia sin observación fenológica.",
    ],
    fuentes: [FUENTE_PERAL, FUENTE_PERAL_MEDITERRANEO],
  },
  Vid: {
    cultivo: "Vid",
    procesoPrincipal: "dormancia_perenne",
    descripcion:
      "Dormancia de yemas y forzado térmico con respuesta dependiente de cultivar y condiciones de exposición.",
    unidadesValidas: ["HF", "CP", "GDH", "GDD"],
    parametrosVarietalesNecesarios: [
      "modelo rector de frío",
      "requisito del cultivar",
      "fuente trazable",
      "estado de validación",
      "biofix de brotación",
    ],
    noCalcular: [
      "No usar 0/0/0 como requisito válido.",
      "No inferir requisito varietal desde el nombre del ciclo.",
      "No equiparar acumulación climática con brotación confirmada.",
    ],
    fuentes: [FUENTE_VID],
  },
  Pecan: {
    cultivo: "Pecan",
    procesoPrincipal: "dormancia_perenne",
    descripcion:
      "La brotación integra frío y calor; el requisito de frío varía entre cultivares y condiciones otoñales.",
    unidadesValidas: ["HF", "CP", "GDH", "GDD"],
    parametrosVarietalesNecesarios: [
      "modelo rector de frío",
      "requisito del cultivar",
      "fuente trazable",
      "estado de validación",
      "forzado térmico y biofix de brotación",
    ],
    noCalcular: [
      "No aplicar un único requisito a todas las variedades.",
      "No convertir HF a CP.",
      "No declarar brotación uniforme solo con el total de frío.",
    ],
    fuentes: [FUENTE_PECAN_PRIMARIA, FUENTE_PECAN],
  },
  Trigo: {
    cultivo: "Trigo",
    procesoPrincipal: "vernalizacion_cereal",
    descripcion:
      "Desarrollo regulado por temperatura, vernalización, fotoperíodo y precocidad intrínseca del genotipo.",
    unidadesValidas: [
      "VU",
      "dias_ventana_calibrada",
      "GDD",
      "fotoperiodo_h",
    ],
    parametrosVarietalesNecesarios: [
      "hábito primaveral, facultativo o invernal",
      "modelo de vernalización implementado",
      "requisito varietal en unidades del modelo",
      "rango térmico del modelo",
      "fuente y estado de validación",
      "sensibilidad fotoperiódica o evidencia equivalente",
    ],
    noCalcular: [
      "No usar HF o CP de dormancia leñosa.",
      "No deducir vernalización desde ciclo corto/intermedio/largo.",
      "No etiquetar APSIM si no se implementó y validó su ecuación.",
    ],
    fuentes: [FUENTE_TRIGO_ARGENTINA, FUENTE_TRIGO_FOTOPERIODO],
  },
  Cebada: {
    cultivo: "Cebada",
    procesoPrincipal: "vernalizacion_cereal",
    descripcion:
      "La fenología integra tiempo térmico y fotoperíodo. La vernalización solo se activa con evidencia varietal: cultivares malteros sudamericanos ensayados en Argentina no mostraron requisito, pero esa conclusión no se extrapola automáticamente a toda variedad.",
    unidadesValidas: [
      "VU",
      "dias_ventana_calibrada",
      "GDD",
      "fotoperiodo_h",
    ],
    parametrosVarietalesNecesarios: [
      "hábito primaveral, facultativo o invernal",
      "modelo de vernalización implementado",
      "requisito varietal",
      "rango térmico del modelo",
      "fuente y estado de validación",
      "respuesta fotoperiódica",
    ],
    noCalcular: [
      "No usar HF o CP de frutales.",
      "No inferir hábito desde el ciclo comercial.",
      "No etiquetar APSIM sin ecuación y validación propias.",
    ],
    fuentes: [FUENTE_CEBADA_ARGENTINA, FUENTE_CEBADA],
  },
  Soja: {
    cultivo: "Soja",
    procesoPrincipal: "termico_fotoperiodico",
    descripcion:
      "La fenología responde conjuntamente a temperatura y fotoperíodo, con diferencias entre cultivares.",
    unidadesValidas: ["GDD", "fotoperiodo_h"],
    parametrosVarietalesNecesarios: [
      "temperaturas cardinales y método térmico",
      "objetivos térmicos por fase",
      "respuesta fotoperiódica del cultivar",
      "fuente y estado de validación",
    ],
    noCalcular: [
      "No usar solo el grupo de madurez como calibración completa.",
      "No extrapolar temperaturas cardinales entre cultivares sin fuente.",
      "No usar HF, CP o VU.",
    ],
    fuentes: [FUENTE_SOJA],
  },
  Maiz: {
    cultivo: "Maiz",
    procesoPrincipal: "termico_fotoperiodico",
    descripcion:
      "Predomina el tiempo térmico, pero la respuesta fotoperiódica debe conservarse como rasgo varietal cuando corresponda.",
    unidadesValidas: ["GDD", "fotoperiodo_h"],
    parametrosVarietalesNecesarios: [
      "temperatura base y superior",
      "método de cálculo GDD",
      "objetivos térmicos por fase",
      "sensibilidad fotoperiódica declarada o descartada con fuente",
      "estado de validación",
    ],
    noCalcular: [
      "No mezclar métodos GDD sin registrar base, techo y truncamiento.",
      "No extrapolar objetivos térmicos entre híbridos.",
      "No usar HF, CP o VU.",
    ],
    fuentes: [
      {
        titulo:
          "Predicting maize phenology: intercomparison of functions for developmental response to temperature",
        url: "https://acsess.onlinelibrary.wiley.com/doi/10.2134/agronj14.0200",
        tipo: "estudio_primario",
      },
      {
        titulo:
          "Effects of photoperiod and temperatures on the duration of vegetative growth in maize",
        url: "https://doi.org/10.2135/cropsci1983.0011183X002300050008x",
        tipo: "estudio_primario",
      },
    ],
  },
  Arveja: {
    cultivo: "Arveja",
    procesoPrincipal: "termico_fotoperiodico",
    respuestaVernalizacionOpcional: true,
    descripcion:
      "Fenología térmica y fotoperiódica con variación genética y ambiental; algunas variedades de hábito invernal o facultativo también responden a vernalización.",
    unidadesValidas: ["GDD", "fotoperiodo_h", "dias_ventana_calibrada"],
    parametrosVarietalesNecesarios: [
      "temperatura base y método térmico",
      "objetivos térmicos por etapa",
      "respuesta fotoperiódica del cultivar",
      "respuesta a vernalización declarada o descartada por variedad",
      "fuente y estado de calibración",
    ],
    noCalcular: [
      "No aplicar 0 °C o 4/5 °C a todas las variedades sin calibración.",
      "No tratar la arveja como frutal dormante.",
      "No usar HF o CP ni reutilizar unidades de vernalización de trigo sin calibración propia.",
    ],
    fuentes: [FUENTE_ARVEJA, FUENTE_ARVEJA_VERNALIZACION],
  },
  Papa: {
    cultivo: "Papa",
    procesoPrincipal: "termico_fotoperiodico",
    descripcion:
      "Emergencia, desarrollo y tuberización combinan temperatura, fotoperíodo y respuesta varietal.",
    unidadesValidas: ["GDD", "fotoperiodo_h"],
    parametrosVarietalesNecesarios: [
      "temperaturas cardinales",
      "objetivos térmicos por fase",
      "respuesta de tuberización a fotoperíodo y temperatura",
      "estado fisiológico de la semilla cuando esté disponible",
      "fuente y estado de validación",
    ],
    noCalcular: [
      "No inferir inicio de tuberización solo con GDD.",
      "No extrapolar un umbral fotoperiódico entre variedades.",
      "No usar HF, CP o VU.",
    ],
    fuentes: [FUENTE_PAPA],
  },
};

export function getClasificacionTermicaCultivo(
  cultivo?: string,
): IClasificacionTermicaCultivo | undefined {
  return cultivo
    ? MATRIZ_CLASIFICACION_TERMICA_CULTIVOS[cultivo as Cultivo]
    : undefined;
}

function numeroPositivo(value: unknown): boolean {
  return numeroInformado(value) && value > 0;
}

function numeroInformado(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function textoInformado(value: unknown): boolean {
  return String(value || "").trim().length > 0;
}

function validarVentanaVernalizacion(
  parametros: IParametrosAgrometeorologicos | undefined,
  faltantes: string[],
): void {
  const rango = parametros?.rangoVernalizacionC;
  const habitoPrimaveral =
    parametros?.habitoVernalizacion === "primaveral";
  if (parametros?.procesoTermico !== "vernalizacion_anual") {
    faltantes.push("proceso de vernalización anual");
  }
  if (
    !parametros?.habitoVernalizacion ||
    parametros.habitoVernalizacion === "desconocido"
  ) {
    faltantes.push("hábito varietal");
  }
  if (!textoInformado(parametros?.fuenteVernalizacion)) {
    faltantes.push("fuente de vernalización");
  }
  /*
   * El estado de vernalización es independiente del estado global de Kc/GDD.
   * Un registro legacy globalmente validado nunca eleva por sí solo este dato.
   */
  if (parametros?.estadoVernalizacion !== "validado") {
    faltantes.push("estado de vernalización validado");
  }
  /*
   * Un cereal primaveral documentado puede tener requisito nulo. Exigirle una
   * ventana positiva contradice al runtime y empuja a inventar unidades de
   * vernalización. El cero debe ser explícito, validado y respaldado por fuente.
   */
  if (habitoPrimaveral) {
    if (parametros?.requerimientoVernalizacion !== 0) {
      faltantes.push("requisito nulo explícito para hábito primaveral");
    }
    return;
  }
  if (parametros?.modeloVernalizacion !== "ventana_calibrada") {
    faltantes.push("modelo ventana calibrada implementado");
  }
  if (!numeroPositivo(parametros?.requerimientoVernalizacion)) {
    faltantes.push("requisito positivo de ventana calibrada");
  }
  if (
    !rango ||
    !numeroInformado(rango.min) ||
    !numeroInformado(rango.max) ||
    rango.max <= rango.min
  ) {
    faltantes.push("rango térmico de vernalización");
  }
  if (
    !textoInformado(parametros?.ventanaVernalizacion?.inicioEtapa) ||
    !textoInformado(parametros?.ventanaVernalizacion?.finEtapa) ||
    parametros?.ventanaVernalizacion?.unidad !== "dias_equivalentes"
  ) {
    faltantes.push("ventana fenológica explícita de vernalización");
  }
}

function validarPerfilTermicoPorFases(
  parametros: IParametrosAgrometeorologicos | undefined,
  faltantes: string[],
): void {
  if (parametros?.estado !== "validado") {
    faltantes.push("estado de parámetros térmicos validado");
  }
  if (!textoInformado(parametros?.fuente)) {
    faltantes.push("fuente térmica por fases");
  }
  if (!numeroInformado(parametros?.temperaturaBaseC)) {
    faltantes.push("temperatura base");
  }
  if (
    !numeroInformado(parametros?.temperaturaSuperiorC) ||
    Number(parametros?.temperaturaSuperiorC) <= 0
  ) {
    faltantes.push("temperatura superior");
  }
  if (parametros?.metodoGdd !== "promedio_limitado") {
    faltantes.push("método GDD explícito");
  }
  if (
    parametros?.semanticaGddPorEtapa !==
    "rangos_acumulados_desde_inicio_termico"
  ) {
    faltantes.push("semántica explícita de GDD por etapa");
  }
  const fases = Object.entries(parametros?.gddPorEtapa || {});
  if (!fases.length) {
    faltantes.push("objetivos GDD por etapa");
    return;
  }
  const normalizadas = fases.map(([etapa, rango]) => {
    const orden = numeroInformado(rango.orden)
      ? rango.orden
      : Number.NaN;
    const objetivo = numeroInformado(rango.objetivo)
      ? rango.objetivo
      : Number.NaN;
    const minimo = numeroInformado(rango.min)
      ? rango.min
      : Number.NaN;
    const maximo = numeroInformado(rango.max)
      ? rango.max
      : Number.NaN;
    const inicio = Number.isFinite(minimo)
      ? minimo
      : Number.isFinite(objetivo)
        ? objetivo
        : Number.NaN;
    const fin = Number.isFinite(maximo)
      ? maximo
      : Number.isFinite(objetivo)
        ? objetivo
        : inicio;
    return { etapa, orden, inicio, fin };
  });
  const ordenes = normalizadas
    .map((fase) => fase.orden)
    .filter(Number.isFinite);
  if (
    ordenes.length !== fases.length ||
    new Set(ordenes).size !== ordenes.length
  ) {
    faltantes.push("orden único por etapa térmica");
  }
  const rangosValidos = normalizadas.every(
    (fase) =>
      Number.isFinite(fase.inicio) &&
      Number.isFinite(fase.fin) &&
      fase.inicio >= 0 &&
      fase.fin >= fase.inicio,
  );
  if (!rangosValidos) {
    faltantes.push("rangos GDD válidos por etapa");
  }
  const ordenadas = normalizadas
    .filter(
      (fase) =>
        Number.isFinite(fase.orden) &&
        Number.isFinite(fase.inicio) &&
        Number.isFinite(fase.fin),
    )
    .sort((a, b) => a.orden - b.orden);
  const monotona =
    ordenadas.length === fases.length &&
    ordenadas.every(
      (fase, index) =>
        index === 0 ||
        (fase.inicio > ordenadas[index - 1].inicio &&
          fase.fin >= ordenadas[index - 1].fin),
    );
  if (!monotona) {
    faltantes.push("secuencia GDD acumulada monotónica por etapa");
  }
}

function validarFotoperiodoVarietal(
  parametros: IParametrosAgrometeorologicos | undefined,
  faltantes: string[],
): void {
  const fotoperiodo = parametros?.fotoperiodoVarietal;
  if (fotoperiodo?.modelo !== "umbral_por_etapa") {
    faltantes.push("modelo fotoperiódico varietal implementado");
  }
  if (fotoperiodo?.estado !== "validado") {
    faltantes.push("estado fotoperiódico validado");
  }
  if (!textoInformado(fotoperiodo?.fuente)) {
    faltantes.push("fuente fotoperiódica varietal");
  }
  if (!Object.keys(fotoperiodo?.porEtapa || {}).length) {
    faltantes.push("umbrales fotoperiódicos por etapa");
    return;
  }
  const perfilesValidos = Object.values(
    fotoperiodo?.porEtapa || {},
  ).every((perfil) => {
    if (!["dia_corto", "dia_largo", "neutra"].includes(perfil.respuesta)) {
      return false;
    }
    if (perfil.respuesta === "neutra") return true;
    const umbral = Number(perfil.umbralHoras);
    return Number.isFinite(umbral) && umbral > 0 && umbral <= 24;
  });
  if (!perfilesValidos) {
    faltantes.push("respuesta y umbral fotoperiódico válidos por etapa");
  }
}

/**
 * Evalúa únicamente si existe evidencia suficiente para activar una
 * predicción varietal automática. La existencia de una referencia genérica de
 * cultivo nunca eleva por sí sola el estado a operativo.
 */
export function evaluarEvidenciaTermicaVarietal(
  semilla?: Partial<ISemilla>,
): IEvaluacionEvidenciaTermicaVarietal {
  const clasificacion = getClasificacionTermicaCultivo(semilla?.cultivo);
  const faltantes: string[] = [];
  const advertencias: string[] = [];

  if (!clasificacion) {
    return {
      cultivo: semilla?.cultivo,
      variedad: semilla?.variedad,
      estado: "requiere_calibracion_varietal",
      perfilVarietalValidado: false,
      requiereBiofixCampo: false,
      aptoParaPrediccionAutomatica: false,
      faltantes: ["cultivo canónico"],
      advertencias,
    };
  }

  if (!textoInformado(semilla?.variedad)) {
    faltantes.push("variedad");
  }

  if (clasificacion.procesoPrincipal === "dormancia_perenne") {
    const frio = semilla?.requerimientoFrio;
    const parametros = semilla?.parametrosAgrometeorologicos;
    if (!textoInformado(frio?.fuente)) faltantes.push("fuente de frío");
    if (frio?.estado !== "validado")
      faltantes.push("estado de frío validado");
    if (frio?.modeloRector !== "HF" && frio?.modeloRector !== "CP") {
      faltantes.push("modelo rector HF o CP");
    } else if (
      frio.modeloRector === "HF" &&
      !numeroPositivo(frio.horasFrio)
    ) {
      faltantes.push("requisito HF positivo");
    } else if (
      frio.modeloRector === "CP" &&
      !numeroPositivo(frio.porcionesFrio)
    ) {
      faltantes.push("requisito CP positivo");
    }
    if (numeroPositivo(frio?.horasFrioEfectivas)) {
      advertencias.push(
        "HFE se conserva como dato legacy y no habilita decisiones.",
      );
    }
    if (parametros?.procesoTermico !== "dormancia_perenne") {
      faltantes.push("proceso de dormancia perenne");
    }
    const protocolo = frio?.protocoloTemporada;
    if (protocolo?.estado !== "validado") {
      faltantes.push("protocolo estacional de frío validado");
    }
    if (!textoInformado(protocolo?.fuente)) {
      faltantes.push("fuente del protocolo estacional");
    }
    if (!textoInformado(protocolo?.region)) {
      faltantes.push("región del protocolo estacional");
    }
    if (!protocolo?.inicio || !protocolo?.fin) {
      faltantes.push("inicio y fin de la ventana de frío");
    }
    validarPerfilTermicoPorFases(parametros, faltantes);
  } else if (clasificacion.procesoPrincipal === "vernalizacion_cereal") {
    const parametros = semilla?.parametrosAgrometeorologicos;
    validarVentanaVernalizacion(parametros, faltantes);
    validarPerfilTermicoPorFases(parametros, faltantes);
    validarFotoperiodoVarietal(parametros, faltantes);
  } else {
    const parametros = semilla?.parametrosAgrometeorologicos;
    if (
      clasificacion.respuestaVernalizacionOpcional &&
      parametros?.procesoTermico === "vernalizacion_anual"
    ) {
      validarVentanaVernalizacion(parametros, faltantes);
    }
    validarPerfilTermicoPorFases(parametros, faltantes);
    if (clasificacion.procesoPrincipal === "termico_fotoperiodico") {
      validarFotoperiodoVarietal(parametros, faltantes);
    }
  }

  const requiereBiofixCampo =
    clasificacion.procesoPrincipal === "dormancia_perenne";
  const perfilVarietalValidado = faltantes.length === 0;
  if (requiereBiofixCampo) {
    faltantes.push("biofix fenológico observado en el lote");
  }
  const aptoParaPrediccionAutomatica =
    perfilVarietalValidado && !requiereBiofixCampo;
  return {
    cultivo: semilla?.cultivo,
    variedad: semilla?.variedad,
    procesoPrincipal: clasificacion.procesoPrincipal,
    estado: aptoParaPrediccionAutomatica
      ? "operativo_con_variedad"
      : perfilVarietalValidado && requiereBiofixCampo
        ? "perfil_varietal_validado_requiere_biofix"
        : "requiere_calibracion_varietal",
    perfilVarietalValidado,
    requiereBiofixCampo,
    aptoParaPrediccionAutomatica,
    faltantes: [...new Set(faltantes)],
    advertencias,
  };
}
