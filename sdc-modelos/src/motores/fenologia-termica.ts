import { IFenologiaReferencia } from "../entidades/semilla";

export type CodigoEtapaArveja = "S" | "E" | "R1" | "R3" | "MF";

export interface IHitoFenologiaArveja {
  codigo: CodigoEtapaArveja;
  nombre: string;
  umbralMinGdd?: number;
  umbralMaxGdd?: number;
  calculable: boolean;
}

export interface IEstadoFenologiaArveja {
  codigo: CodigoEtapaArveja;
  nombre: string;
  indice: number;
  fuente: "campo" | "termica" | "implantacion";
  gradosDiaAcumulados?: number;
  progresoEtapaPct: number;
  hitos: IHitoFenologiaArveja[];
  advertencias: string[];
}

const HITOS_BASE: Array<Pick<IHitoFenologiaArveja, "codigo" | "nombre">> = [
  { codigo: "S", nombre: "S - Siembra / preemergencia" },
  { codigo: "E", nombre: "E - Emergencia y desarrollo vegetativo" },
  { codigo: "R1", nombre: "R1 - Inicio de floracion" },
  { codigo: "R3", nombre: "R3 - Fin de floracion / formacion de vainas" },
  { codigo: "MF", nombre: "MF - Madurez fisiologica" },
];

function normalizarClave(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function rango(
  referencia: IFenologiaReferencia | undefined,
  clave: "SE" | "ER1" | "R1MF" | "SMF",
): { min: number; max: number } | undefined {
  const entry = Object.entries(referencia?.rangosTermicos || {}).find(
    ([key]) => normalizarClave(key) === clave,
  );
  if (!entry) return undefined;
  const min = Number(entry[1]?.min);
  const max = Number(entry[1]?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    return undefined;
  }
  return { min, max };
}

function medio(min?: number, max?: number): number | undefined {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  return (Number(min) + Number(max)) / 2;
}

function limitar(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function codigoDesdeRegistro(value?: string): CodigoEtapaArveja | undefined {
  const normalizado = normalizarClave(value || "");
  if (normalizado.startsWith("MF") || normalizado.includes("MADUREZFISIOLOGICA")) return "MF";
  if (normalizado.startsWith("R3") || normalizado.includes("FORMACIONDEVAINAS")) return "R3";
  if (normalizado.startsWith("R1") || normalizado.includes("INICIODEFLORACION")) return "R1";
  if (normalizado.startsWith("E") || normalizado.includes("EMERGENCIA")) return "E";
  if (normalizado.startsWith("S") || normalizado.includes("SIEMBRA")) return "S";
  return undefined;
}

export function construirHitosFenologiaArveja(
  referencia?: IFenologiaReferencia,
): IHitoFenologiaArveja[] {
  const se = rango(referencia, "SE");
  const er1 = rango(referencia, "ER1");
  const r1mf = rango(referencia, "R1MF");
  const smf = rango(referencia, "SMF");

  const e = se;
  const r1 = se && er1
    ? { min: se.min + er1.min, max: se.max + er1.max }
    : undefined;
  const mf = smf || (se && er1 && r1mf
    ? {
        min: se.min + er1.min + r1mf.min,
        max: se.max + er1.max + r1mf.max,
      }
    : undefined);

  return HITOS_BASE.map((hito) => {
    const umbral = hito.codigo === "E" ? e : hito.codigo === "R1" ? r1 : hito.codigo === "MF" ? mf : undefined;
    return {
      ...hito,
      umbralMinGdd: hito.codigo === "S" ? 0 : umbral?.min,
      umbralMaxGdd: hito.codigo === "S" ? 0 : umbral?.max,
      calculable: hito.codigo !== "R3" && (hito.codigo === "S" || !!umbral),
    };
  });
}

export function resolverFenologiaTermicaArveja(input: {
  referencia?: IFenologiaReferencia;
  gradosDiaAcumulados?: number;
  etapaCampo?: string;
}): IEstadoFenologiaArveja {
  const hitos = construirHitosFenologiaArveja(input.referencia);
  const advertencias: string[] = [];
  const codigoCampo = codigoDesdeRegistro(input.etapaCampo);
  const gdd = Number(input.gradosDiaAcumulados);
  const tieneGdd = Number.isFinite(gdd) && gdd >= 0;
  const eMedio = medio(hitos[1].umbralMinGdd, hitos[1].umbralMaxGdd);
  const r1Medio = medio(hitos[2].umbralMinGdd, hitos[2].umbralMaxGdd);
  const mfMedio = medio(hitos[4].umbralMinGdd, hitos[4].umbralMaxGdd);

  let indice = 0;
  let fuente: IEstadoFenologiaArveja["fuente"] = "implantacion";

  if (tieneGdd && eMedio !== undefined && r1Medio !== undefined && mfMedio !== undefined) {
    fuente = "termica";
    if (gdd >= mfMedio) indice = 4;
    else if (gdd >= r1Medio) indice = 2;
    else if (gdd >= eMedio) indice = 1;
  } else if (!tieneGdd) {
    advertencias.push("Sin acumulacion termica verificable: se muestra la implantacion o el ultimo registro de campo.");
  } else {
    advertencias.push("Los rangos termicos estan incompletos y no permiten resolver la etapa automaticamente.");
  }

  if (codigoCampo) {
    const indiceCampo = hitos.findIndex((hito) => hito.codigo === codigoCampo);
    if (indiceCampo >= 0) {
      indice = indiceCampo;
      fuente = "campo";
    }
  }

  let progresoEtapaPct = 0;
  if (fuente === "campo") {
    progresoEtapaPct = 0;
  } else if (tieneGdd) {
    if (indice === 0 && eMedio) progresoEtapaPct = limitar((gdd / eMedio) * 100);
    else if (indice === 1 && eMedio !== undefined && r1Medio && r1Medio > eMedio) {
      progresoEtapaPct = limitar(((gdd - eMedio) / (r1Medio - eMedio)) * 100);
    } else if (indice === 2 && r1Medio !== undefined && mfMedio && mfMedio > r1Medio) {
      progresoEtapaPct = limitar(((gdd - r1Medio) / (mfMedio - r1Medio)) * 100);
    } else if (indice === 4) progresoEtapaPct = 100;
  }

  if (!hitos[3].calculable) {
    advertencias.push("R3 no tiene umbral termico en la fuente y debe confirmarse mediante observacion de campo.");
  }

  return {
    codigo: hitos[indice].codigo,
    nombre: hitos[indice].nombre,
    indice,
    fuente,
    gradosDiaAcumulados: tieneGdd ? gdd : undefined,
    progresoEtapaPct,
    hitos,
    advertencias,
  };
}
