import { IDepartamento } from "./departamento";

export const CULTIVOS_ANUALES = ["Soja", "Trigo", "Maiz", "Papa"] as const;
export const CULTIVOS_PERENNES = ["Vid", "Peral", "Pecan", "Manzano"] as const;
export const CULTIVOS_DISPONIBLES = [
  ...CULTIVOS_ANUALES,
  ...CULTIVOS_PERENNES,
] as const;

export type Cultivo = (typeof CULTIVOS_DISPONIBLES)[number];

export type TipoCicloCultivo = "Anual" | "Perenne";

export function esCultivoPerenne(cultivo?: string): boolean {
  return !!cultivo && (CULTIVOS_PERENNES as readonly string[]).includes(cultivo);
}

export function getTipoCicloCultivo(cultivo?: string): TipoCicloCultivo {
  return esCultivoPerenne(cultivo) ? "Perenne" : "Anual";
}

export function getNombreImplantacion(cultivo?: string): "Siembra" | "Plantacion" {
  return esCultivoPerenne(cultivo) ? "Plantacion" : "Siembra";
}

export interface IEtapaFenologicaReferencia {
  nombre: string;
  dia: number;
  descripcion?: string;
}

export interface IConfiguracionFrioCultivo {
  requiereFrio: boolean;
  horasFrioObjetivo?: number;
  horasFrioEfectivasObjetivo?: number;
  porcionesFrioObjetivo?: number;
  temperaturaBaseGradosDia?: number;
  gradosDiaBrotacionObjetivo?: number;
  gradosDiaFloracionObjetivo?: number;
  umbralHelada?: number;
}

export const ETAPAS_PERENNES_REFERENCIA: Record<string, IEtapaFenologicaReferencia[]> = {
  Pecan: [
    { nombre: "Dormancia", dia: 0, descripcion: "Reposo invernal y acumulacion de frio." },
    { nombre: "Brotacion", dia: 78, descripcion: "Apertura de yemas y expansion foliar inicial." },
    { nombre: "Polinizacion", dia: 116, descripcion: "Amentos liberan polen y estigmas receptivos." },
    { nombre: "Estado acuoso", dia: 162, descripcion: "Crecimiento de nuez con endosperma acuoso." },
    { nombre: "Gel", dia: 205, descripcion: "El interior comienza a gelificar." },
    { nombre: "Endurecimiento de cascara", dia: 228, descripcion: "Inicio del endurecimiento de cascara." },
    { nombre: "Masa", dia: 258, descripcion: "El gel se solidifica y llena la almendra." },
    { nombre: "Apertura de ruezno", dia: 304, descripcion: "El ruezno comienza a abrir." },
    { nombre: "Cosecha", dia: 334, descripcion: "Ventana operativa de recoleccion." },
  ],
  Vid: [
    { nombre: "Dormancia", dia: 0 },
    { nombre: "Lloro", dia: 58 },
    { nombre: "Brotacion", dia: 78 },
    { nombre: "Floracion", dia: 132 },
    { nombre: "Cuaje", dia: 150 },
    { nombre: "Envero", dia: 220 },
    { nombre: "Madurez", dia: 270 },
    { nombre: "Cosecha", dia: 312 },
  ],
  Manzano: [
    { nombre: "Reposo invernal", dia: 0 },
    { nombre: "Yema hinchada", dia: 72 },
    { nombre: "Punta verde", dia: 88 },
    { nombre: "Floracion", dia: 116 },
    { nombre: "Cuaje", dia: 138 },
    { nombre: "Crecimiento de fruto", dia: 168 },
    { nombre: "Madurez", dia: 278 },
    { nombre: "Cosecha", dia: 318 },
  ],
  Peral: [
    { nombre: "Reposo invernal", dia: 0 },
    { nombre: "Yema hinchada", dia: 68 },
    { nombre: "Brotacion", dia: 86 },
    { nombre: "Floracion", dia: 110 },
    { nombre: "Cuaje", dia: 132 },
    { nombre: "Crecimiento de fruto", dia: 164 },
    { nombre: "Madurez", dia: 268 },
    { nombre: "Cosecha", dia: 304 },
  ],
};

export const CONFIGURACION_FRIO_CULTIVOS: Record<string, IConfiguracionFrioCultivo> = {
  Pecan: {
    requiereFrio: true,
    horasFrioObjetivo: 500,
    horasFrioEfectivasObjetivo: 400,
    porcionesFrioObjetivo: 35,
    temperaturaBaseGradosDia: 10,
    gradosDiaBrotacionObjetivo: 120,
    gradosDiaFloracionObjetivo: 280,
    umbralHelada: -1,
  },
  Manzano: {
    requiereFrio: true,
    horasFrioObjetivo: 800,
    horasFrioEfectivasObjetivo: 700,
    porcionesFrioObjetivo: 50,
    temperaturaBaseGradosDia: 7,
    gradosDiaBrotacionObjetivo: 90,
    gradosDiaFloracionObjetivo: 220,
    umbralHelada: -1,
  },
  Peral: {
    requiereFrio: true,
    horasFrioObjetivo: 700,
    horasFrioEfectivasObjetivo: 600,
    porcionesFrioObjetivo: 42,
    temperaturaBaseGradosDia: 7,
    gradosDiaBrotacionObjetivo: 85,
    gradosDiaFloracionObjetivo: 205,
    umbralHelada: -1,
  },
  Vid: {
    requiereFrio: true,
    horasFrioObjetivo: 400,
    horasFrioEfectivasObjetivo: 320,
    porcionesFrioObjetivo: 28,
    temperaturaBaseGradosDia: 10,
    gradosDiaBrotacionObjetivo: 100,
    gradosDiaFloracionObjetivo: 260,
    umbralHelada: -1,
  },
};

export function getEtapasPerennesReferencia(cultivo?: string): IEtapaFenologicaReferencia[] {
  return cultivo ? ETAPAS_PERENNES_REFERENCIA[cultivo] || [] : [];
}

export function getConfiguracionFrioCultivo(cultivo?: string): IConfiguracionFrioCultivo | undefined {
  return cultivo ? CONFIGURACION_FRIO_CULTIVOS[cultivo] : undefined;
}

export interface IEtapasTrigo {
  R0_R1?: number;
  R1_R2?: number;
  R2_R3?: number;
  R3_R4?: number;
  R4_R5?: number;
  R5_R6?: number;
  R6_R7?: number;
}

export interface IEtapasSoja {
  siembra_emergencia?: number;
  emergencia_R1?: number;
  R1_R3?: number;
  R3_R5?: number;
  R5_R7?: number;
}

export interface IEtapasMaiz {
  siembra_emergencia?: number;
  emergencia_floracion?: number;
  floracion_madurez?: number;
}

export interface ICrono {
  _id?: string;
  cultivo?: Cultivo;
  idDepartamento?: string;
  ciclo?: string;
  diaSiembra?: number;
  mesSiembra?: number;
  etapas?: IEtapasSoja | IEtapasTrigo | IEtapasMaiz | Record<string, number>;
  departamentoNombre?: string;
  // Populate
  departamento?: IDepartamento;
}

type OmitirCreate = "_id" | "departamento";
export interface ICreateCrono extends Omit<Partial<ICrono>, OmitirCreate> {}

type OmitirUpdate = "_id" | "departamento";
export interface IUpdateCrono extends Omit<Partial<ICrono>, OmitirUpdate> {}

export type IFenologia = ICrono;
export type ICreateFenologia = ICreateCrono;
export type IUpdateFenologia = IUpdateCrono;
