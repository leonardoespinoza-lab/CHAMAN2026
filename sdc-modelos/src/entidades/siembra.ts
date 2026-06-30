import { ICoordenadas, IGeoJSONPoint } from "../compartidos";
import { ICrono } from "./crono";
import { IDepartamento } from "./departamento";
import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { ILote } from "./lote";
import { IResultadoPrediccionMalezas } from "./maleza";
import { IPrediccion } from "./prediccion";
import {
  IPrediccionRiego,
  IResultadoPrediccionRiego,
} from "./prediccion-riego";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { IFenologiaReferencia, IRequerimientoFrio, ISemilla } from "./semilla";

export type TTipoFijacionN = "0" | "> 0 < 30" | "> 30 < 60" | "> 60";
export type TTipoDosisN = "Muy Baja" | "Baja" | "Alta" | "Muy Alta";
export type TTipoDosisP = "Muy Baja" | "Baja" | "Alta" | "Muy Alta";
export type TTipoRendimiento = "Muy Bajo" | "Bajo" | "Alto" | "Muy Alto";
export type TTipoManejoAgronomico = "Malo" | "Promedio" | "Bueno" | "Excelente";
export type TTipoIntensidadLluvias =
  "Suaves" | "Moderadas" | "Intensas" | "Muy Intensas";
export type TTipoMateriaOrganica = "< 1" | "> 1 < 3" | "> 3 < 5" | "> 5";
export type TTipoLluviaPromedio =
  "< 600" | "> 600 < 1200" | "> 1200 < 1800" | "> 1800";
export type TTipoLabranza =
  "Siembra Directa" | "Convencional" | "Labranza" | "Reducida";
export type TCalidadHuellaHidrica = "alta" | "media" | "baja";

export interface ICalidadHuellaHidrica {
  nivel: TCalidadHuellaHidrica;
  score: number;
  observaciones: string[];
}

export interface IMetodologiaHuellaHidrica {
  version: string;
  enfoque: string;
  fuenteClima?: string;
  fechaCalculo?: string;
  limites?: string[];
}

export interface IComponentesHuellaHidrica {
  etcTotalMm?: number;
  lluviaTotalMm?: number;
  lluviaEfectivaMm?: number;
  verdeMm?: number;
  azulRealMm?: number;
  deficitPotencialMm?: number;
  riegoRegistradoMm?: number;
  grisLitrosHa?: number;
  grisFertilizantesLitrosHa?: number;
  grisAgroquimicosLitrosHa?: number;
}

export interface IHuellaHidrica {
  gris?: {
    litrosKgFertilizante?: number;
    litrosKgAgroquimico?: number;
    litrosKg?: number;
    litrosKcal?: number;
  };
  azul?: {
    litrosKcal?: number;
    litrosKg?: number;
  };
  verde?: {
    litrosKcal?: number;
    litrosKg?: number;
  };
  total?: {
    litrosKcal?: number;
    litrosKg?: number;
  };
  componentes?: IComponentesHuellaHidrica;
  calidad?: ICalidadHuellaHidrica;
  metodologia?: IMetodologiaHuellaHidrica;
}

export interface IRegistroFenologicoFrio {
  fechaDesde?: string;
  fechaHasta?: string;
  horasFrio?: number;
  horasFrioEfectivas?: number;
  porcionesFrio?: number;
  gradosDia?: number;
  fuente?: string;
}

export interface IRegistroFenologico {
  id?: string;
  fecha?: string;
  accion?: "inicio" | "ajuste" | "observacion";
  etapa?: string;
  cultivo?: string;
  variedad?: string;
  ciclo?: string;
  campania?: string;
  idLote?: string;
  idSiembra?: string;
  idSemilla?: string;
  edadPlantacionAnios?: number;
  diasDesdeImplantacion?: number;
  diasDesdeCampania?: number;
  fuenteFenologia?: string;
  requerimientoFrio?: IRequerimientoFrio;
  fenologiaReferencia?: IFenologiaReferencia;
  frioAcumulado?: IRegistroFenologicoFrio;
  observaciones?: string;
  creadoEn?: string;
  actualizadoEn?: string;
}

export interface ISiembra {
  _id?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  idDepartamento?: string;
  idSemilla?: string;
  idCrono?: string;
  fechaSiembra?: string;
  fechaCosecha?: string;
  activa?: boolean;
  coordenadas?: ICoordenadas;
  geojson?: IGeoJSONPoint;
  ultimaPrediccion?: IPrediccion;
  ultimaPrediccionRiego?: IResultadoPrediccionRiego[];
  ultimaPrediccionMalezas?: IResultadoPrediccionMalezas;
  aguaUtilReal?: number;
  // Información adicional sobre el cálculo de agua útil
  estadoCalculoAguaUtil?:
    "calculado" | "estimado" | "no_disponible" | "fallida";
  motivoCalculoAguaUtil?: string;

  // Datos para huella hídrica
  humedadCosecha?: number;
  rendimientoObtenidoKgHa?: number;
  rendimientoObtenidoKgHaSeco?: number;
  lluviasPromedio?: TTipoLluviaPromedio;
  fijacionN?: TTipoFijacionN;
  dosisN?: TTipoDosisN;
  dosisP?: TTipoDosisP;
  labranza?: TTipoLabranza;
  rendimiento?: TTipoRendimiento;
  manejoAgronomico?: TTipoManejoAgronomico;
  intensidadLluvias?: TTipoIntensidadLluvias;
  materiaOrganica?: TTipoMateriaOrganica;
  huellaHidrica?: IHuellaHidrica;
  registrosFenologicos?: IRegistroFenologico[];

  // Populate
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
  departamento?: IDepartamento;
  semilla?: ISemilla;
  crono?: ICrono;
}

type OmitirCreate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "lote"
  | "departamento"
  | "semilla"
  | "crono";
export interface ICreateSiembra extends Omit<Partial<ISiembra>, OmitirCreate> {}

type OmitirUpdate =
  | "_id"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento"
  | "lote"
  | "departamento"
  | "semilla"
  | "crono";
export interface IUpdateSiembra extends Omit<Partial<ISiembra>, OmitirUpdate> {}
