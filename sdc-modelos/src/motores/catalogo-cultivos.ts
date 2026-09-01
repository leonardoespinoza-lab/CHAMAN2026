import { Cultivo, CULTIVOS_DISPONIBLES } from "../entidades/crono";
import {
  IResistencia,
  ISemilla,
  TConfianzaResistencia,
  TEnfermedadId,
  TEstadoResistencia,
  TPerfilResistencia,
} from "../entidades/semilla";
import { ENFERMEDADES_CANONICAS, getEnfermedadPorId } from "./enfermedades";

export const CATALOGO_CULTIVOS_FORMATO_VERSION =
  "chaman-cultivos-ancho-v1" as const;
export const CATALOGO_CULTIVOS_MAX_FILAS = 2_000;

export const MARCADORES_CATALOGO_CULTIVOS = [
  "SIN_REGISTRO",
  "DESCONOCIDA",
  "DATO_ESPECIFICO",
  "NO_CATEGORIZADA",
] as const;

export type TMarcadorCatalogoCultivos =
  (typeof MARCADORES_CATALOGO_CULTIVOS)[number];

export interface IReglaPerfilCatalogo {
  multiplicador: number;
  indiceResistencia: number;
}

export interface IDefinicionColumnaSanitariaCatalogo {
  cultivo: Cultivo;
  idEnfermedad: TEnfermedadId;
  encabezado: string;
  editable: boolean;
  perfilesPermitidos: string[];
  motivoSoloLectura?: string;
}

export interface IFilaCatalogoCultivos {
  fila: number;
  hoja: Cultivo;
  id?: string;
  snapshot?: string;
  semillero: string;
  variedad: string;
  ciclo: string;
  campania?: string;
  perfiles: Partial<Record<TEnfermedadId, string>>;
  fuenteActualizacion?: string;
  campaniaFuente?: string;
  fechaFuente?: string;
  estado?: TEstadoResistencia;
  confianza?: TConfianzaResistencia;
  observacionesActualizacion?: string;
}

export interface IImportacionCatalogoCultivosRequest {
  formatoVersion: typeof CATALOGO_CULTIVOS_FORMATO_VERSION;
  modo: "previsualizar" | "confirmar";
  planHash?: string;
  filas: IFilaCatalogoCultivos[];
}

export interface IErrorImportacionCatalogoCultivos {
  fila: number;
  hoja: string;
  campo?: string;
  mensaje: string;
}

export interface ICambioImportacionCatalogoCultivos {
  tipo: "alta" | "actualizacion";
  id?: string;
  cultivo: Cultivo;
  semillero: string;
  variedad: string;
  enfermedades: TEnfermedadId[];
}

export interface IResultadoImportacionCatalogoCultivos {
  formatoVersion: typeof CATALOGO_CULTIVOS_FORMATO_VERSION;
  modo: "previsualizar" | "confirmar";
  planHash?: string;
  altas: number;
  actualizaciones: number;
  sinCambios: number;
  errores: IErrorImportacionCatalogoCultivos[];
  cambios: ICambioImportacionCatalogoCultivos[];
  idsCreados?: string[];
  idsActualizados?: string[];
}

/**
 * Escala sanitaria general del catálogo. También se usa para antecedentes
 * varietales conservadores: S activa el seguimiento con el factor máximo,
 * mientras que estado/confianza/fuente conservan la trazabilidad de que el
 * dato fue inferido y no una observación de enfermedad a campo.
 */
const REGLAS_CUATRO_CATEGORIAS: Record<string, IReglaPerfilCatalogo> = {
  R: { multiplicador: 0.05, indiceResistencia: 1 },
  MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
  MS: { multiplicador: 0.75, indiceResistencia: 1 / 3 },
  S: { multiplicador: 1, indiceResistencia: 0 },
};

const REGLAS_CEBADA: Record<string, IReglaPerfilCatalogo> = {
  R: { multiplicador: 0.3, indiceResistencia: 1 },
  MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
  I: { multiplicador: 0.625, indiceResistencia: 0.5 },
  S: { multiplicador: 1, indiceResistencia: 0 },
};

const REGLAS_PAPA: Record<string, IReglaPerfilCatalogo> = {
  R: { multiplicador: 0.25, indiceResistencia: 1 },
  MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
  MS: { multiplicador: 0.75, indiceResistencia: 1 / 3 },
  S: { multiplicador: 1.2, indiceResistencia: 0 },
};

const REGLAS_SOJA_CANCRO: Record<string, IReglaPerfilCatalogo> = {
  R: { multiplicador: 0.05, indiceResistencia: 1 },
  S: { multiplicador: 1, indiceResistencia: 0 },
};

export function normalizarTextoCatalogo(value?: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizarPerfilCatalogo(value?: unknown): string {
  return normalizarTextoCatalogo(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function columnasSanitariasCatalogo(
  cultivo: Cultivo,
): IDefinicionColumnaSanitariaCatalogo[] {
  return ENFERMEDADES_CANONICAS.filter((item) =>
    esEnfermedadCultivoCatalogo(cultivo, item.id),
  ).map((item) => {
    const reglas = getReglasPerfilCatalogo(cultivo, item.id);
    return {
      cultivo,
      idEnfermedad: item.id,
      encabezado: item.nombre.toUpperCase(),
      editable: !!reglas,
      perfilesPermitidos: reglas ? Object.keys(reglas) : [],
    };
  });
}

export function getReglasPerfilCatalogo(
  cultivo: Cultivo,
  idEnfermedad: TEnfermedadId,
): Record<string, IReglaPerfilCatalogo> | undefined {
  const definicion = getEnfermedadPorId(idEnfermedad);
  if (!definicion || !esEnfermedadCultivoCatalogo(cultivo, idEnfermedad)) {
    return undefined;
  }
  if (cultivo === "Cebada" && idEnfermedad !== "cebada.fusariosis_espiga") {
    return REGLAS_CEBADA;
  }
  if (cultivo === "Papa") return REGLAS_PAPA;
  if (cultivo === "Soja" && idEnfermedad === "soja.cancro_tallo") {
    return REGLAS_SOJA_CANCRO;
  }
  return REGLAS_CUATRO_CATEGORIAS;
}

export function esEnfermedadCultivoCatalogo(
  cultivo: Cultivo,
  idEnfermedad: TEnfermedadId,
): boolean {
  if (
    idEnfermedad === "frutales.fuego_bacteriano" &&
    (cultivo === "Manzano" || cultivo === "Peral")
  ) {
    return true;
  }
  return getEnfermedadPorId(idEnfermedad)?.cultivo === cultivo;
}

export function derivarPerfilCatalogo(
  cultivo: Cultivo,
  idEnfermedad: TEnfermedadId,
  perfil: string,
): (IReglaPerfilCatalogo & { perfil: TPerfilResistencia }) | undefined {
  const normalizado = normalizarPerfilCatalogo(perfil);
  const reglas = getReglasPerfilCatalogo(cultivo, idEnfermedad);
  if (!reglas) return undefined;
  if (normalizado === "DESCONOCIDA") {
    return {
      perfil: "DESCONOCIDA",
      multiplicador: 1,
      indiceResistencia: 0,
    };
  }
  const regla = reglas[normalizado];
  if (!regla) return undefined;
  return {
    perfil: normalizado as TPerfilResistencia,
    ...regla,
  };
}

export function perfilVisibleCatalogo(resistencia?: IResistencia): string {
  if (!resistencia) return "SIN_REGISTRO";
  if (resistencia.detalleSanitario) return "DATO_ESPECIFICO";
  const perfil = normalizarPerfilCatalogo(resistencia.perfil);
  if (perfil) return perfil;
  return "NO_CATEGORIZADA";
}

export function esCultivoCatalogo(value?: unknown): value is Cultivo {
  return (CULTIVOS_DISPONIBLES as readonly string[]).includes(
    normalizarTextoCatalogo(value),
  );
}

export function claveNaturalCatalogo(
  value: Pick<
    ISemilla,
    "cultivo" | "semillero" | "variedad" | "ciclo" | "campania"
  >,
): string {
  return [
    value.cultivo,
    value.semillero,
    value.variedad,
    value.ciclo,
    value.campania,
  ]
    .map((item) =>
      normalizarTextoCatalogo(item)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase(),
    )
    .join("|");
}

function normalizarParaSnapshot(value: unknown, esRaiz = true): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => normalizarParaSnapshot(item, false));
  }
  if (!value || typeof value !== "object") return value;
  const objectLike = value as {
    toHexString?: () => string;
    toJSON?: () => unknown;
  };
  if (typeof objectLike.toHexString === "function") {
    return objectLike.toHexString();
  }
  if (typeof objectLike.toJSON === "function") {
    const serialized = objectLike.toJSON();
    if (serialized !== value) return normalizarParaSnapshot(serialized, esRaiz);
  }
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(source)
    .filter((item) => !(esRaiz && ["id", "__v"].includes(item)))
    .sort()) {
    normalized[key] = normalizarParaSnapshot(source[key], false);
  }
  return normalized;
}

export function serializarCatalogoEstable(value: unknown): string {
  return JSON.stringify(normalizarParaSnapshot(value));
}

/**
 * Token de concurrencia, no una firma de seguridad. Dos acumuladores de
 * 32 bits producen un token determinista en navegador y Node sin elevar el
 * target ES2017 compartido por los servicios legacy.
 */
export function hashCatalogoEstable(value: unknown): string {
  const input = serializarCatalogoEstable(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function snapshotSemillaCatalogo(seed: Partial<ISemilla>): string {
  return `v1-${hashCatalogoEstable(seed)}`;
}
