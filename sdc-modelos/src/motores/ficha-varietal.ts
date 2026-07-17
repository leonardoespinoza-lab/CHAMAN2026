import {
  IDocumentoFichaVarietal,
  ISemilla,
  TEstadoFichaVarietal,
} from "../entidades/semilla";
import {
  IReferenciaTermicaVarietal,
  resolverFichaTermicaVarietal,
} from "./catalogo-termico-varietal";

export const VERSION_FICHA_VARIETAL = "ficha-varietal-2026.07.17-v1";

export interface ICoberturaFichaVarietal {
  id:
    | "identidad"
    | "registro"
    | "obtentor"
    | "fenologia"
    | "termico"
    | "sanidad"
    | "region";
  etiqueta: string;
  completa: boolean;
  detalle: string;
}

export interface IResumenSanitarioVarietal {
  enfermedad: string;
  perfil: string;
  estado: string;
  confianza: string;
  fuente?: string;
  fuenteUrl?: string;
}

export interface IResumenFichaVarietal {
  version: string;
  estado: TEstadoFichaVarietal;
  cultivo: string;
  denominacionCargada: string;
  nombreOficial: string;
  nombreOficialVerificado: boolean;
  nombreComercial?: string;
  aliases: string[];
  obtentor?: string;
  mantenedor?: string;
  proveedor?: string;
  paisOrigen?: string;
  semilleroCargado?: string;
  ciclo?: string;
  campania?: string;
  portainjerto?: string;
  registro?: {
    organismo: string;
    codigo?: string;
    url?: string;
    fechaRegistro?: string;
  };
  regiones: string[];
  cobertura: ICoberturaFichaVarietal[];
  coberturaPorcentaje: number;
  referenciasTermicas: IReferenciaTermicaVarietal[];
  fenologia: Array<{ etiqueta: string; valor: string }>;
  sanidad: IResumenSanitarioVarietal[];
  documentos: IDocumentoFichaVarietal[];
  advertencias: string[];
  observaciones: string[];
}

const PAISES = new Set(
  [
    "Alemania",
    "Argelia",
    "Argentina",
    "Australia",
    "Austria",
    "Canada",
    "Chile",
    "Espana",
    "Estados Unidos",
    "Francia",
    "Grecia",
    "Hungria",
    "Inglaterra",
    "Italia",
    "Japon",
    "Marruecos",
    "Nueva Zelanda",
    "Paises Bajos",
    "Portugal",
    "Turquia",
    "USA",
  ].map(normalizar),
);

function normalizar(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function tieneValor(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return !!value && Object.keys(value).length > 0;
  return !!String(value || "").trim();
}

function deduplicarDocumentos(
  documentos: IDocumentoFichaVarietal[],
): IDocumentoFichaVarietal[] {
  const vistos = new Set<string>();
  return documentos.filter((documento) => {
    const key = normalizar(documento.url || documento.titulo);
    if (!key || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function resolverEstado(
  semilla: Partial<ISemilla>,
  documentos: IDocumentoFichaVarietal[],
): TEstadoFichaVarietal {
  if (semilla.fichaVarietal?.estado) return semilla.fichaVarietal.estado;
  if (documentos.length) return "referencia_documental";
  if (semilla.fuenteBase) return "en_relevamiento";
  return "sin_fuentes";
}

export function resolverFichaVarietal(
  semilla?: Partial<ISemilla>,
): IResumenFichaVarietal | undefined {
  if (!semilla?.cultivo || !semilla.variedad) return undefined;

  const persistida = semilla.fichaVarietal;
  const termica = resolverFichaTermicaVarietal(semilla);
  const semilleroEsPais = PAISES.has(normalizar(semilla.semillero));
  const documentosTermicos: IDocumentoFichaVarietal[] = (termica?.fuentes || []).map(
    (fuente) => ({
      id: fuente.id,
      titulo: fuente.titulo,
      url: fuente.url,
      organizacion: organizacionFuente(fuente.url),
      tipo:
        fuente.tipo === "extension_oficial"
          ? "extension_oficial"
          : "publicacion_cientifica",
      anio: fuente.anio,
      fechaConsulta: "2026-07-17",
      vigente: true,
    }),
  );
  const documentos = deduplicarDocumentos([
    ...(persistida?.documentos || []),
    ...documentosTermicos,
  ]);

  const fenologia = [
    ["Brotacion", semilla.fenologiaReferencia?.brotacion],
    ["Floracion", semilla.fenologiaReferencia?.floracion],
    ["Cosecha", semilla.fenologiaReferencia?.cosecha],
  ]
    .filter((entry): entry is [string, string] => tieneValor(entry[1]))
    .map(([etiqueta, valor]) => ({ etiqueta, valor }));

  const sanidad: IResumenSanitarioVarietal[] = (semilla.resistencia || []).map(
    (item) => ({
      enfermedad: item.enfermedad || item.idEnfermedad || "Sin identificar",
      perfil: item.perfil ||
        (Number.isFinite(item.indiceResistencia)
          ? `IR ${Number(item.indiceResistencia).toFixed(2)}`
          : "Sin perfil"),
      estado: item.estado || "desconocida",
      confianza: item.confianza || "sin_datos",
      fuente: item.fuente,
      fuenteUrl: item.fuenteUrl,
    }),
  );

  const referenciasTermicas = termica?.ficha.referencias || [];
  const regiones = [...new Set([
    ...(persistida?.regionRecomendada || []),
    ...referenciasTermicas.map((referencia) => referencia.region).filter(Boolean),
  ])];
  const cobertura: ICoberturaFichaVarietal[] = [
    {
      id: "identidad",
      etiqueta: "Identidad varietal",
      completa: !!persistida?.nombreOficial,
      detalle: persistida?.nombreOficial
        ? "Nombre oficial documentado"
        : "Solo denominacion cargada en Chaman",
    },
    {
      id: "registro",
      etiqueta: "Registro oficial",
      completa: !!persistida?.registro?.organismo,
      detalle: persistida?.registro?.organismo || "Pendiente de INASE o registro equivalente",
    },
    {
      id: "obtentor",
      etiqueta: "Obtentor o mantenedor",
      completa: !!(persistida?.obtentor || persistida?.mantenedor),
      detalle:
        persistida?.obtentor || persistida?.mantenedor ||
        (semilleroEsPais
          ? "El campo semillero contiene un pais de origen"
          : "Semillero cargado; obtentor aun no verificado"),
    },
    {
      id: "fenologia",
      etiqueta: "Fenologia",
      completa: fenologia.length > 0,
      detalle: fenologia.length
        ? `${fenologia.length} hitos documentados`
        : "Sin hitos varietales documentados",
    },
    {
      id: "termico",
      etiqueta: "Modelo termico",
      completa:
        referenciasTermicas.length > 0 ||
        tieneValor(semilla.requerimientoFrio) ||
        tieneValor(semilla.parametrosAgrometeorologicos),
      detalle: referenciasTermicas.length
        ? `${referenciasTermicas.length} referencias con unidad y fuente`
        : "Sin referencia varietal trazable",
    },
    {
      id: "sanidad",
      etiqueta: "Sanidad",
      completa: sanidad.length > 0,
      detalle: sanidad.length
        ? `${sanidad.length} perfiles cargados`
        : "Sin resistencia varietal documentada",
    },
    {
      id: "region",
      etiqueta: "Adaptacion regional",
      completa: (persistida?.regionRecomendada || []).length > 0,
      detalle: (persistida?.regionRecomendada || []).length
        ? persistida!.regionRecomendada!.join("; ")
        : "Pendiente de recomendacion oficial o calibracion local",
    },
  ];
  const completas = cobertura.filter((item) => item.completa).length;
  const advertencias = [...(termica?.advertencias || [])];
  if (semilleroEsPais) {
    advertencias.unshift(
      "El valor cargado como semillero parece ser un pais. Chaman lo presenta como origen y no lo atribuye a un obtentor.",
    );
  }
  if (!persistida?.nombreOficial) {
    advertencias.unshift(
      "La denominacion oficial aun no fue contrastada con INASE o el registro varietal correspondiente.",
    );
  }

  return {
    version: persistida?.version || VERSION_FICHA_VARIETAL,
    estado: resolverEstado(semilla, documentos),
    cultivo: semilla.cultivo,
    denominacionCargada: semilla.variedad,
    nombreOficial: persistida?.nombreOficial || semilla.variedad,
    nombreOficialVerificado: !!persistida?.nombreOficial,
    nombreComercial: persistida?.nombreComercial,
    aliases: persistida?.aliases || termica?.ficha.aliases || [],
    obtentor: persistida?.obtentor,
    mantenedor: persistida?.mantenedor,
    proveedor:
      persistida?.proveedor || (!semilleroEsPais ? semilla.semillero : undefined),
    paisOrigen: persistida?.paisOrigen || (semilleroEsPais ? semilla.semillero : undefined),
    semilleroCargado: semilla.semillero,
    ciclo: semilla.ciclo,
    campania: semilla.campania,
    portainjerto: semilla.portainjerto,
    registro: persistida?.registro,
    regiones,
    cobertura,
    coberturaPorcentaje: Math.round((completas / cobertura.length) * 100),
    referenciasTermicas,
    fenologia,
    sanidad,
    documentos,
    advertencias: [...new Set(advertencias)],
    observaciones: [
      ...(termica?.ficha.observaciones || []),
      ...(persistida?.observaciones ? [persistida.observaciones] : []),
    ],
  };
}

function organizacionFuente(url: string): string {
  if (url.includes("frontiersin.org")) return "Frontiers";
  if (url.includes("dpi.qld.gov.au")) return "Queensland Government";
  if (url.includes("actahort.org")) return "ISHS Acta Horticulturae";
  if (url.includes("embrapa.br")) return "Embrapa";
  if (url.includes("extension.uga.edu")) return "University of Georgia Extension";
  if (url.includes("pecangrowers.org.au")) return "Australian Pecan Growers Association";
  if (url.includes("scielo.br")) return "SciELO";
  return "Fuente tecnica o cientifica";
}
