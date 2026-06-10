import { IDepartamento } from "./departamento";

export type Cultivo = "Soja" | "Trigo" | "Maiz";

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
