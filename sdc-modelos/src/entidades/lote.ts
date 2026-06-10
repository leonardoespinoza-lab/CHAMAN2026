import { IUbicacion } from "../compartidos/ubicacion";
import { Cultivo } from "./crono";
import { IDepartamento } from "./departamento";
import { IDispositivo } from "./dispositivo";
import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IEstacion } from "./estacion";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { TEnfermedad } from "./semilla";
import { IHuellaHidrica, ISiembra } from "./siembra";

export type TTexturaSuelo =
  | "Arcilloso"
  | "Franco arcilloso"
  | "Franco"
  | "Franco arenoso"
  | "Arenoso";
export type TTipoDrenaje =
  | "Mal Drenado"
  | "Moderadamente Drenado"
  | "Bien Drenado"
  | "Excesivamente Drenado";

export type TTipoErosionEscorrentiaPendiente =
  | "Baja (0 - 3%)"
  | "Moderada (3 - 8%)"
  | "Alta (8 - 15%)"
  | "Muy Alta (> 15%)";
export type TTipoContenidoP = "< 12" | "> 12 < 20" | "> 20 < 30" | "> 30";

export type TTipoDepositoN = "< 0.5" | "> 0.5" | "< 1.5" | "> 1.5";

export interface ISuelo {
  profundidad?: number;
  textura?: TTexturaSuelo;
  hayRaices?: boolean;
  capacidadDeCampo?: number;
  puntoMarchitez?: number;
  numeroDeSensor?: number;
}

export interface nivelPrediccion {
  cultivo?: Cultivo; // Soja - Trigo - Maiz
  enfermedad?: TEnfermedad; // Enfermedad a predecir
  temperatura?: calidadNivel;
  humedadRelativa?: calidadNivel;
  velocidadViento?: calidadNivel;
  lluvias?: calidadNivel;
  nivel?: number; // Nivel general (el peor de los de arriba)
}

export interface calidadNivel {
  nivel?: number; // 1 - Excelente, 2 - Bueno, 3 - Malo
  distancia?: number; // Distancia a la estación en km
  idEstacion?: string; // Id de la estación
  // Populate
  estacion?: IEstacion;
}

export interface ICalidadClima {
  fecha?: string;
  nivelPrediccion?: nivelPrediccion[];
  nivel?: number; // Nivel general (el peor de los de arriba)
}

export interface ILote {
  _id?: string;
  nombre?: string;
  ubicacion?: IUbicacion;
  capacidadDeCampo?: number;
  idSondaSuelo?: string;
  suelos?: ISuelo[];
  capacidadDeRiego?: number;
  puntoMarchitez?: number;
  anchoDeBulbo?: number;
  metrosLinealesHas?: number;
  serialCamara?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idDepartamento?: string;
  idsDispositivo?: string[]; // Dispositivos asociados al lote
  // Datos para Huella Hídrica
  depositoN?: TTipoDepositoN;
  texturaLixiviacion?: TTexturaSuelo;
  texturaEscorrentia?: TTexturaSuelo;
  drenajeNaturalLixiviacion?: TTipoDrenaje;
  drenajeNaturalEscorrentia?: TTipoDrenaje;
  erosionEscorrentiaPendiente?: TTipoErosionEscorrentiaPendiente;
  contenidoP?: TTipoContenidoP;
  // Huella hidrica de la ultima siembra del lote
  huellaHidrica?: IHuellaHidrica;
  // Id de la ultima siembra del lote
  idSiembra?: string;
  calidadClima?: ICalidadClima;
  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  departamento?: IDepartamento;
  sondaSuelo?: IEstacion;
  siembra?: ISiembra;
  dispositivos?: IDispositivo[];
}

type OmitirCreate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "departamento"
  | "sondaSuelo"
  | "dispositivos";
export interface ICreateLote extends Omit<Partial<ILote>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "departamento"
  | "sondaSuelo"
  | "dispositivos";
export interface IUpdateLote extends Omit<Partial<ILote>, OmitirUpdate> {}
