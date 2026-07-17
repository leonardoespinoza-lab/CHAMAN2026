import { Cultivo } from "../entidades/crono";
import { ISemilla } from "../entidades/semilla";
import {
  getClasificacionTermicaCultivo,
  TProcesoTermicoPrincipal,
} from "./clasificacion-termica-cultivos";

export type TUnidadReferenciaTermica =
  | "HF"
  | "CP"
  | "CU"
  | "CH_ESTUDIO"
  | "GDH"
  | "GDD"
  | "VU"
  | "dias_equivalentes";

export type TEstadoReferenciaTermica =
  | "publicada"
  | "referencia_regional"
  | "evidencia_conflictiva"
  | "sin_umbral_publicado";

export type TCoincidenciaFichaTermica =
  | "variedad_exacta"
  | "alias_varietal"
  | "referencia_cultivo";

export interface IFuenteCatalogoTermico {
  id: string;
  titulo: string;
  url: string;
  anio: number;
  tipo:
    | "estudio_primario"
    | "revision_cientifica"
    | "extension_oficial"
    | "base_tecnica_productor";
}

export interface IReferenciaTermicaVarietal {
  proceso: "dormancia" | "forzado" | "vernalizacion" | "desarrollo";
  unidad: TUnidadReferenciaTermica;
  minimo?: number;
  maximo?: number;
  objetivo?: number;
  modelo: string;
  region: string;
  estado: TEstadoReferenciaTermica;
  fuenteIds: string[];
  observaciones: string;
}

export interface IFenologiaTermicaDocumentada {
  brotacion?: string;
  floracion?: string;
  cosecha?: string;
  observaciones: string;
}

export interface IFichaTermicaVarietal {
  id: string;
  cultivo: Cultivo;
  variedad?: string;
  aliases?: string[];
  procesoPrincipal: TProcesoTermicoPrincipal;
  alcance: "variedad" | "grupo_varietal" | "cultivo";
  referencias: IReferenciaTermicaVarietal[];
  fenologia: IFenologiaTermicaDocumentada;
  fuenteIds: string[];
  estado: TEstadoReferenciaTermica;
  permiteObjetivoAutomatico: false;
  observaciones: string[];
}

export interface IResolucionFichaTermica {
  versionCatalogo: string;
  actualizadoAl: string;
  coincidencia: TCoincidenciaFichaTermica;
  ficha: IFichaTermicaVarietal;
  fuentes: IFuenteCatalogoTermico[];
  advertencias: string[];
}

export const VERSION_CATALOGO_TERMICO =
  "catalogo-termico-varietal-2026.07.17-v1";
export const FECHA_CATALOGO_TERMICO = "2026-07-17";

export const FUENTES_CATALOGO_TERMICO: Record<string, IFuenteCatalogoTermico> =
  {
    apple_review_2023: {
      id: "apple_review_2023",
      titulo:
        "Apple dormancy: regulatory mechanisms and agroclimatic requirements",
      url: "https://www.frontiersin.org/journals/horticulture/articles/10.3389/fhort.2023.1217689/full",
      anio: 2023,
      tipo: "revision_cientifica",
    },
    apple_parkes_2020: {
      id: "apple_parkes_2020",
      titulo:
        "Chilling requirements of apple cultivars grown in mild Australian winter conditions",
      url: "https://era.dpi.qld.gov.au/id/eprint/7099/",
      anio: 2020,
      tipo: "estudio_primario",
    },
    pear_acta_2011: {
      id: "pear_acta_2011",
      titulo: "Chilling requirement for dormancy bud break in European pear",
      url: "https://www.actahort.org/books/909/909_7.htm",
      anio: 2011,
      tipo: "estudio_primario",
    },
    pear_embrapa: {
      id: "pear_embrapa",
      titulo: "Quebra de dormencia da pereira",
      url: "https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/cultivos/pera/producao/quebra-de-dormencia",
      anio: 2021,
      tipo: "extension_oficial",
    },
    pecan_ceres_2023: {
      id: "pecan_ceres_2023",
      titulo: "Budbreak of pecan cultivars subject to artificial chill",
      url: "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1152922/1/Artigo-Claudia.pdf",
      anio: 2023,
      tipo: "estudio_primario",
    },
    pecan_uga_2015: {
      id: "pecan_uga_2015",
      titulo: "Pecans and Chilling",
      url: "https://site.extension.uga.edu/pecan/2015/02/pecans-and-chilling/",
      anio: 2015,
      tipo: "extension_oficial",
    },
    pecan_australia: {
      id: "pecan_australia",
      titulo: "Chill Requirement of Pecans",
      url: "https://www.pecangrowers.org.au/here/wp-content/uploads/Pecan-Growing-Chill-Requirement-of-Pecans.pdf",
      anio: 2017,
      tipo: "extension_oficial",
    },
    grape_embrapa_2018: {
      id: "grape_embrapa_2018",
      titulo: "Chilling requirements and dormancy evolution in grapevine buds",
      url: "https://www.scielo.br/j/cagro/a/CpSLnMhRvLDcxwMfZFTsy7g/?format=pdf&lang=en",
      anio: 2018,
      tipo: "estudio_primario",
    },
  };

const appleSources = ["apple_review_2023", "apple_parkes_2020"];

function chillReference(
  unidad: TUnidadReferenciaTermica,
  minimo: number,
  maximo: number,
  fuenteIds: string[],
  region: string,
  estado: TEstadoReferenciaTermica,
  observaciones: string,
): IReferenciaTermicaVarietal {
  return {
    proceso: "dormancia",
    unidad,
    minimo,
    maximo,
    modelo:
      unidad === "CP"
        ? "Dynamic Model (Fishman, Erez y Couvillon)"
        : unidad === "HF"
          ? "Chilling Hours; respetar la ventana térmica declarada por la fuente"
          : "Modelo declarado por el estudio; no convertir a HF ni CP",
    region,
    estado,
    fuenteIds,
    observaciones,
  };
}

const FICHAS_VARIETALES: IFichaTermicaVarietal[] = [
  {
    id: "manzano-cripps-pink",
    cultivo: "Manzano",
    variedad: "Cripps Pink",
    aliases: [
      "Pink Lady",
      "Cripps Pink (Pink Lady)",
      "Pink Lady / Cripps Pink",
      "Rosy Glow",
    ],
    procesoPrincipal: "dormancia_perenne",
    alcance: "grupo_varietal",
    referencias: [
      chillReference(
        "CP",
        52,
        73.3,
        appleSources,
        "Australia; métodos estadístico y experimental",
        "evidencia_conflictiva",
        "Los dos métodos publicados para el mismo ambiente difieren. Rosy Glow se trata solo como referencia del cultivar de origen y exige calibración local.",
      ),
    ],
    fenologia: {
      observaciones:
        "La fecha de brotación y floración no se traslada entre regiones. Chaman debe consolidarla con biofix observado en el lote.",
    },
    fuenteIds: appleSources,
    estado: "evidencia_conflictiva",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "No elegir automáticamente 52 ni 73,3 CP.",
      "El portainjerto, el sitio y el método experimental pueden modificar la respuesta observada.",
    ],
  },
  {
    id: "manzano-granny-smith",
    cultivo: "Manzano",
    variedad: "Granny Smith",
    procesoPrincipal: "dormancia_perenne",
    alcance: "variedad",
    referencias: [
      chillReference(
        "CP",
        43.5,
        72.2,
        ["apple_review_2023"],
        "Francia, España y Australia",
        "evidencia_conflictiva",
        "La revisión registra diferencias importantes por lugar y método; no es un único umbral universal.",
      ),
      chillReference(
        "HF",
        583,
        1049,
        ["apple_review_2023"],
        "Uruguay, España, Australia y Estados Unidos",
        "evidencia_conflictiva",
        "Rango compilado de estudios con métodos y ambientes diferentes.",
      ),
    ],
    fenologia: {
      observaciones:
        "Brotación y floración requieren registro local y no una fecha fija de catálogo.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "evidencia_conflictiva",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "El rango publicado es informativo; debe calibrarse en Alto Valle.",
    ],
  },
  {
    id: "manzano-golden-delicious",
    cultivo: "Manzano",
    variedad: "Golden Delicious",
    procesoPrincipal: "dormancia_perenne",
    alcance: "variedad",
    referencias: [
      chillReference(
        "CP",
        50,
        64.2,
        ["apple_review_2023"],
        "Italia, Bélgica, Francia y Marruecos",
        "publicada",
        "La revisión informa resultados relativamente homogéneos, aunque siguen siendo dependientes del sitio y método.",
      ),
      chillReference(
        "HF",
        1025,
        1200,
        ["apple_review_2023"],
        "Italia y Estados Unidos",
        "referencia_regional",
        "No combinar este rango con CP ni usarlo sin declarar el método de HF.",
      ),
    ],
    fenologia: {
      observaciones:
        "El cumplimiento de frío no confirma por sí solo brotación o floración.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "publicada",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "Requiere validación regional y biofix antes de gobernar decisiones.",
    ],
  },
  {
    id: "manzano-gala",
    cultivo: "Manzano",
    variedad: "Gala",
    aliases: ["Gala (and clones)", "Royal Gala"],
    procesoPrincipal: "dormancia_perenne",
    alcance: "grupo_varietal",
    referencias: [
      chillReference(
        "CP",
        25.6,
        61.2,
        ["apple_review_2023"],
        "Brasil, Francia y Marruecos",
        "evidencia_conflictiva",
        "La amplitud publicada impide adoptar un valor universal para clones de Gala.",
      ),
      chillReference(
        "HF",
        667,
        1064,
        ["apple_review_2023"],
        "Uruguay, Canadá y Estados Unidos",
        "evidencia_conflictiva",
        "Rango compilado; los estudios no comparten necesariamente la misma ventana térmica.",
      ),
    ],
    fenologia: {
      observaciones:
        "Las fechas de floración y cosecha son regionales y deben registrarse a campo.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "evidencia_conflictiva",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "Royal Gala se resuelve como grupo Gala, no como umbral validado propio.",
    ],
  },
  {
    id: "manzano-fuji",
    cultivo: "Manzano",
    variedad: "Fuji",
    procesoPrincipal: "dormancia_perenne",
    alcance: "grupo_varietal",
    referencias: [
      chillReference(
        "CP",
        24.5,
        77,
        ["apple_review_2023"],
        "Brasil, España y Australia",
        "evidencia_conflictiva",
        "La revisión destaca a Fuji como el caso de mayor variabilidad entre ambientes.",
      ),
      chillReference(
        "HF",
        637,
        1077,
        ["apple_review_2023"],
        "Uruguay, Australia y Estados Unidos",
        "evidencia_conflictiva",
        "No usar el extremo del rango como umbral automático.",
      ),
    ],
    fenologia: {
      observaciones:
        "Brotación y floración deben anclarse con observación local.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "evidencia_conflictiva",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "Los clones de Fuji requieren identificación y calibración propias.",
    ],
  },
  {
    id: "manzano-red-delicious",
    cultivo: "Manzano",
    variedad: "Red Delicious",
    aliases: ["Red Delicious (and clones)", "Delicious", "Red King Oregon"],
    procesoPrincipal: "dormancia_perenne",
    alcance: "grupo_varietal",
    referencias: [
      chillReference(
        "HF",
        1093,
        1093,
        ["apple_review_2023"],
        "Estados Unidos",
        "referencia_regional",
        "Referencia publicada para Delicious; Red King Oregon se muestra como transferencia de grupo, no validación local.",
      ),
    ],
    fenologia: {
      observaciones:
        "Se requiere biofix local de salida de dormancia y brotación.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "referencia_regional",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "La mutación o clon comercial debe confirmarse antes de usar este valor.",
    ],
  },
  {
    id: "manzano-starking",
    cultivo: "Manzano",
    variedad: "Starking Delicious",
    aliases: ["Starking / Starkrimson", "Starkrimson"],
    procesoPrincipal: "dormancia_perenne",
    alcance: "grupo_varietal",
    referencias: [
      chillReference(
        "HF",
        1208,
        1234,
        ["apple_review_2023"],
        "India y Estados Unidos",
        "referencia_regional",
        "Valores estadísticos publicados en ambientes externos al Alto Valle.",
      ),
    ],
    fenologia: {
      observaciones: "El calendario local se obtiene de registros fenológicos.",
    },
    fuenteIds: ["apple_review_2023"],
    estado: "referencia_regional",
    permiteObjetivoAutomatico: false,
    observaciones: [
      "No trasladar el valor directamente a Starkrimson sin verificación varietal.",
    ],
  },
  ...[
    ["Empire", 1079],
    ["Rome Beauty", 1163],
  ].map(
    ([variedad, hf]): IFichaTermicaVarietal => ({
      id: `manzano-${normalizarTexto(String(variedad)).replace(/ /g, "-")}`,
      cultivo: "Manzano",
      variedad: String(variedad),
      procesoPrincipal: "dormancia_perenne",
      alcance: "variedad",
      referencias: [
        chillReference(
          "HF",
          Number(hf),
          Number(hf),
          ["apple_review_2023"],
          "Estados Unidos",
          "referencia_regional",
          "Estimación experimental compilada; requiere validación regional.",
        ),
      ],
      fenologia: {
        observaciones: "Las etapas se consolidan mediante registros del lote.",
      },
      fuenteIds: ["apple_review_2023"],
      estado: "referencia_regional",
      permiteObjetivoAutomatico: false,
      observaciones: ["Un único estudio no define un umbral universal."],
    }),
  ),
  ...[
    "Rocha",
    "Williams",
    "Williams / Bartlett",
    "Red Williams",
    "Red Bartlett / Starkrimson",
    "Packham's Triumph",
    "Packham/Local Clone",
    "Forelle",
  ].map(
    (variedad): IFichaTermicaVarietal => ({
      id: `peral-${normalizarTexto(variedad).replace(/ /g, "-")}`,
      cultivo: "Peral",
      variedad,
      aliases:
        variedad === "Williams / Bartlett"
          ? ["Bartlett", "Winter Bartlett"]
          : undefined,
      procesoPrincipal: "dormancia_perenne",
      alcance: "variedad",
      referencias: [
        chillReference(
          "HF",
          700,
          1200,
          ["pear_acta_2011", "pear_embrapa"],
          "Referencia técnica multi-regional para pera europea",
          "referencia_regional",
          "Rango general citado para cultivares europeos. El estudio varietal ensayó 0 a 1050 h a 3 ± 1 °C, pero no justifica adoptar un único umbral en Alto Valle.",
        ),
      ],
      fenologia: {
        observaciones:
          "La salida de endodormancia, brotación y floración se confirman con biofix de campo; la fecha de cosecha depende de región y manejo.",
      },
      fuenteIds: ["pear_acta_2011", "pear_embrapa"],
      estado: "referencia_regional",
      permiteObjetivoAutomatico: false,
      observaciones: [
        "Rango informativo, no objetivo varietal validado para Alto Valle.",
      ],
    }),
  ),
  ...[
    {
      variedad: "Desirable",
      min: 300,
      max: 500,
      fuentes: ["pecan_uga_2015", "pecan_ceres_2023"],
      estado: "evidencia_conflictiva" as const,
    },
    {
      variedad: "Mahan",
      min: 300,
      max: 500,
      fuentes: ["pecan_uga_2015"],
      estado: "referencia_regional" as const,
    },
    {
      variedad: "Success",
      min: 300,
      max: 750,
      fuentes: ["pecan_uga_2015", "pecan_ceres_2023"],
      estado: "evidencia_conflictiva" as const,
    },
    {
      variedad: "Stuart",
      min: 600,
      max: 1000,
      fuentes: ["pecan_uga_2015", "pecan_australia"],
      estado: "referencia_regional" as const,
    },
    {
      variedad: "Kiowa",
      min: 200,
      max: 350,
      fuentes: ["pecan_australia"],
      estado: "referencia_regional" as const,
    },
    {
      variedad: "Pawnee",
      min: 300,
      max: 350,
      fuentes: ["pecan_australia"],
      estado: "referencia_regional" as const,
    },
    {
      variedad: "Shoshoni",
      min: 500,
      max: 1000,
      fuentes: ["pecan_ceres_2023"],
      estado: "evidencia_conflictiva" as const,
    },
  ].map(
    (item): IFichaTermicaVarietal => ({
      id: `pecan-${normalizarTexto(item.variedad).replace(/ /g, "-")}`,
      cultivo: "Pecan",
      variedad: item.variedad,
      procesoPrincipal: "dormancia_perenne",
      alcance: "variedad",
      referencias: [
        chillReference(
          "HF",
          item.min,
          item.max,
          item.fuentes,
          "Sudeste de Estados Unidos, Australia y/o sur de Brasil",
          item.estado,
          "El requerimiento cambia con las condiciones otoñales y con el criterio de brotación utilizado.",
        ),
        ...(item.variedad === "Kiowa"
          ? [
              chillReference(
                "CP",
                17,
                29,
                ["pecan_australia"],
                "Australia",
                "referencia_regional",
                "Rango de extensión; no es conversión calculada por Chaman.",
              ),
            ]
          : item.variedad === "Pawnee"
            ? [
                chillReference(
                  "CP",
                  25,
                  29,
                  ["pecan_australia"],
                  "Australia",
                  "referencia_regional",
                  "Rango de extensión; no es conversión calculada por Chaman.",
                ),
              ]
            : item.variedad === "Stuart"
              ? [
                  chillReference(
                    "CP",
                    50,
                    83,
                    ["pecan_australia"],
                    "Australia",
                    "referencia_regional",
                    "Rango de extensión; no es conversión calculada por Chaman.",
                  ),
                ]
              : item.variedad === "Desirable"
                ? [
                    chillReference(
                      "CP",
                      33,
                      42,
                      ["pecan_australia"],
                      "Australia",
                      "referencia_regional",
                      "Rango de extensión; no es conversión calculada por Chaman.",
                    ),
                  ]
                : []),
      ],
      fenologia: {
        observaciones:
          "El frío interactúa con el calor primaveral. Brotación y floración deben confirmarse a campo.",
      },
      fuenteIds: [...new Set(item.fuentes)],
      estado: item.estado,
      permiteObjetivoAutomatico: false,
      observaciones: [
        "La evidencia publicada no autoriza una conversión fija entre HF y CP.",
      ],
    }),
  ),
  ...[
    { variedad: "Chardonnay", chill: 136 },
    { variedad: "Merlot", chill: 298 },
    { variedad: "Cabernet Sauvignon", chill: 392 },
  ].map(
    (item): IFichaTermicaVarietal => ({
      id: `vid-${normalizarTexto(item.variedad).replace(/ /g, "-")}`,
      cultivo: "Vid",
      variedad: item.variedad,
      procesoPrincipal: "dormancia_perenne",
      alcance: "variedad",
      referencias: [
        chillReference(
          "CH_ESTUDIO",
          item.chill,
          item.chill,
          ["grape_embrapa_2018"],
          "Sur de Brasil, material experimental",
          "referencia_regional",
          "La unidad CH del estudio permanece separada: Chaman no la transforma automáticamente a HF ni CP.",
        ),
      ],
      fenologia: {
        observaciones:
          "La brotación se registra a campo. La madurez y cosecha dependen del ambiente y del destino productivo.",
      },
      fuenteIds: ["grape_embrapa_2018"],
      estado: "referencia_regional",
      permiteObjetivoAutomatico: false,
      observaciones: [
        "Referencia experimental externa; requiere calibración regional.",
      ],
    }),
  ),
];

function cropFallback(cultivo: Cultivo): IFichaTermicaVarietal {
  const clasificacion = getClasificacionTermicaCultivo(cultivo)!;
  const esPerenne = clasificacion.procesoPrincipal === "dormancia_perenne";
  return {
    id: `cultivo-${normalizarTexto(cultivo)}`,
    cultivo,
    procesoPrincipal: clasificacion.procesoPrincipal,
    alcance: "cultivo",
    referencias: [],
    fenologia: {
      observaciones: esPerenne
        ? "No se encontró un umbral varietal suficientemente trazable. Chaman muestra la exposición térmica, pero exige biofix de campo para consolidar etapas."
        : clasificacion.procesoPrincipal === "vernalizacion_cereal"
          ? "Trigo y cebada se modelan por vernalización, GDD y fotoperíodo varietal; no por HF o CP de frutales."
          : "El desarrollo se modela con parámetros térmicos y fotoperiódicos de la variedad; no por frío de dormancia.",
    },
    fuenteIds: [],
    estado: "sin_umbral_publicado",
    permiteObjetivoAutomatico: false,
    observaciones: [
      ...clasificacion.parametrosVarietalesNecesarios.map(
        (item) => `Falta documentar: ${item}.`,
      ),
      ...clasificacion.noCalcular.map((item) => `No calcular: ${item}.`),
    ],
  };
}

function normalizarTexto(valor?: string): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceIdsFicha(ficha: IFichaTermicaVarietal): string[] {
  return [
    ...new Set([
      ...ficha.fuenteIds,
      ...ficha.referencias.flatMap((referencia) => referencia.fuenteIds),
    ]),
  ];
}

export function resolverFichaTermicaVarietal(
  semilla?: Partial<ISemilla>,
): IResolucionFichaTermica | undefined {
  const cultivo = semilla?.cultivo;
  const clasificacion = getClasificacionTermicaCultivo(cultivo);
  if (!cultivo || !clasificacion) return undefined;

  const variedad = normalizarTexto(semilla?.variedad);
  const exacta = variedad
    ? FICHAS_VARIETALES.find(
        (ficha) =>
          ficha.cultivo === cultivo &&
          normalizarTexto(ficha.variedad) === variedad,
      )
    : undefined;
  const porAlias =
    !exacta && variedad
      ? FICHAS_VARIETALES.find(
          (ficha) =>
            ficha.cultivo === cultivo &&
            (ficha.aliases || []).some(
              (alias) => normalizarTexto(alias) === variedad,
            ),
        )
      : undefined;
  const ficha = exacta || porAlias || cropFallback(cultivo);
  const coincidencia: TCoincidenciaFichaTermica = exacta
    ? "variedad_exacta"
    : porAlias
      ? "alias_varietal"
      : "referencia_cultivo";
  const fuentes = sourceIdsFicha(ficha)
    .map((id) => FUENTES_CATALOGO_TERMICO[id])
    .filter((fuente): fuente is IFuenteCatalogoTermico => !!fuente);
  const advertencias = [
    "Las referencias externas no reemplazan la ficha técnica validada del productor ni el biofix de campo.",
    "HF, CP, CU, CH de estudio, HFE y vernalización son unidades o modelos distintos; Chaman no los convierte entre sí.",
  ];
  if (coincidencia === "alias_varietal") {
    advertencias.push(
      "La coincidencia proviene de un alias, clon o grupo varietal y requiere confirmación agronómica.",
    );
  }
  if (coincidencia === "referencia_cultivo") {
    advertencias.push(
      "No se encontró una ficha varietal publicada y trazable para esta denominación; no se define objetivo automático.",
    );
  }
  return {
    versionCatalogo: VERSION_CATALOGO_TERMICO,
    actualizadoAl: FECHA_CATALOGO_TERMICO,
    coincidencia,
    ficha,
    fuentes,
    advertencias,
  };
}

export function getReferenciaObjetivoTermico(
  semilla: Partial<ISemilla> | undefined,
  unidad: "HF" | "CP",
): IReferenciaTermicaVarietal | undefined {
  return resolverFichaTermicaVarietal(semilla)?.ficha.referencias.find(
    (referencia) =>
      referencia.unidad === unidad &&
      (Number.isFinite(referencia.objetivo) ||
        Number.isFinite(referencia.maximo) ||
        Number.isFinite(referencia.minimo)),
  );
}

export function listarFichasTermicasVarietales(): readonly IFichaTermicaVarietal[] {
  return FICHAS_VARIETALES;
}
