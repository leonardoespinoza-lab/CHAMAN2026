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
import {
  IFenologiaReferencia,
  IRequerimientoFrio,
  ISemilla,
  TObjetivoBiofixFenologico,
} from "./semilla";

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
export type TEstadoRecomendacionRiego =
  "calculada" | "estimada" | "no_disponible" | "fallida";
export type TFuenteRecomendacionRiego = "sensor_suelo" | "balance_climatico";

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
  /** Una huella incompleta nunca debe presentarse como resultado consolidado. */
  estado?: "consolidada" | "incompleta";
  faltantes?: Array<{
    campo: string;
    accion: string;
    bloque: "siembra" | "lote" | "clima" | "rendimiento";
  }>;
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

/** Un objeto parcial o vacio no equivale a una huella calculada. */
export function esHuellaHidricaConsolidada(huella?: IHuellaHidrica): boolean {
  if (huella?.estado === "incompleta") return false;
  return [
    huella?.total?.litrosKg,
    huella?.total?.litrosKcal,
    huella?.verde?.litrosKg,
    huella?.azul?.litrosKg,
    huella?.gris?.litrosKg,
  ].some(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}

export interface IRegistroFenologicoFrio {
  fechaDesde?: string;
  fechaHasta?: string;
  fechaCaptura?: string;
  horasFrio?: number;
  /** Frio ponderado por el modelo Utah. Se expresa en UF/CU, no en horas. */
  unidadesFrioUtah?: number;
  /** @deprecated Indicador historico ambiguo; se conserva sin recalcular. */
  horasFrioEfectivas?: number;
  porcionesFrio?: number;
  gradosDia?: number;
  fuente?: string;
  fuenteTemperatura?: string;
  serieCampoPrioritaria?: boolean;
  coberturaPct?: number;
  continuidadSuficiente?: boolean;
  brechaMaximaHoras?: number;
  estado?: "completo" | "parcial" | "pendiente";
  versionModelo?: string;
  versionCalculo?: string;
  versionParametros?: string;
}

export interface IRegistroFenologico {
  id?: string;
  fecha?: string;
  accion?: "inicio" | "ajuste" | "observacion";
  tipoEvento?: "observacion" | "inicio_etapa" | "biofix" | "correccion";
  fechaObservacion?: string;
  fechaInicioEtapa?: string;
  etapa?: string;
  codigoEtapa?: string;
  escalaEtapa?: string;
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
  coberturaObservadaPct?: number;
  confianza?: "alta" | "media" | "baja";
  observador?: string;
  objetivosBiofix?: TObjetivoBiofixFenologico[];
  versionModelo?: string;
  versionParametros?: string;
  reemplazaRegistroId?: string;
  motivoCorreccion?: string;
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
  aguaUtilReal?: number | null;
  // Información adicional sobre el cálculo de agua útil
  estadoCalculoAguaUtil?:
    "calculado" | "estimado" | "no_disponible" | "fallida";
  motivoCalculoAguaUtil?: string;
  estadoRecomendacionRiego?: TEstadoRecomendacionRiego;
  fuenteRecomendacionRiego?: TFuenteRecomendacionRiego | null;
  motivoRecomendacionRiego?: string;

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
  | "crono"
  | "registrosFenologicos";
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
  | "crono"
  | "registrosFenologicos";
export interface IUpdateSiembra extends Omit<Partial<ISiembra>, OmitirUpdate> {}
