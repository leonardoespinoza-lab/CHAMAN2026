import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { TEnfermedad } from "./semilla";
import { ISiembra } from "./siembra";

export interface IVariablesRoyaDeLaHoja {
  GD?: number; // Grados Dia
  DHR?: number; // Dias sin lluvia (>= 0.2) y HR >= 70%
}

export interface IVariablesRoyaDelMaiz {
  GD?: number; // Grados Dia
  DHR?: number; // Dias sin lluvia (>= 0.2) y HR >= 70%
}

export interface IVariablesManchaAmarilla {
  DPrHRT?: number; // Dias con lluvia > 1mm y HR >= 80% y temp max <= 32°C y temp min >= 8°C
  DPr?: number; // Dias con lluvia > 2mm
}

export interface IVariablesManchaDeLaHoja {
  DPr?: number; // Dias con lluvia > 10mm
  DHR?: number; // Dias con HR >= 80%
}

export interface IVariablesFusariumDeLaEspiga {
  PMoj?: number; // número de períodos de mojado de 2 días con registro de precipitación > 0,2 y HR>81% en el día 1 y una HR≥78% en el día 2.
  GDN?: number;
  GDAcum?: number; // Grados dia acumulados
}

export interface IVariablesFinDeCiclo {
  PtAc7?: number; // Suma de precipitaciones de dias con mas de 7mm.
  DPr7?: number; // Dias con precipitaciones > 7mm
  Lt7?: number; // Multiplicacion de dias con precipitaciones > 7mm por cantidad de dias con precipitaciones > 7mm
}

export interface IPrediccionEnfermedad {
  enfermedad: TEnfermedad;
  resultado: number;
  variables:
    | IVariablesRoyaDeLaHoja
    | IVariablesManchaAmarilla
    | IVariablesManchaDeLaHoja
    | IVariablesFusariumDeLaEspiga
    | IVariablesFinDeCiclo
    | IVariablesRoyaDelMaiz;
}

export interface IPrediccionEstacion {
  idEstacion: string;
  distanciaMetros: number;
  precipitaciones: number;
  humedadRelativa: number;
  temperaturaMaxima: number;
  temperaturaMinima: number;
  temperaturaPromedio: number;
}

export interface IPrediccion {
  _id?: string;
  /**
   * fecha en formato ISO
   */
  fecha?: string;
  /**
   * fecha en formato 2024-12-31
   */
  fechaPrediccion?: string;
  etapa?: number;
  nombreEtapa?: string;
  idSiembra?: string;
  enfermedades?: IPrediccionEnfermedad[];
  estacion?: IPrediccionEstacion;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;

  // Populate
  siembra?: ISiembra;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
}

type OmitirCreate =
  | "_id"
  | "siembra"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento";
export interface ICreatePrediccion
  extends Omit<Partial<IPrediccion>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "siembra"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento";
export interface IUpdatePrediccion
  extends Omit<Partial<IPrediccion>, OmitirUpdate> {}
