import { IDistribuidor } from "./distribuidor";
import { IEstablecimiento } from "./establecimiento";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { TEnfermedad } from "./semilla";
import { IResistencia, TEnfermedadId, TEstadoResistencia } from "./semilla";
import { ICalidadDatoMotor } from "../compartidos";
import { ISiembra } from "./siembra";
import { FuenteClima } from "./clima";

export interface IVariablesRoyaDeLaHoja {
  GD?: number; // Grados Dia
  DHR?: number; // Dias con precipitacion <= 0,2 mm y HR > 70%
  DL?: number;
  GDDBase0Siembra?: number;
  coberturaGdd?: number;
  umbralInicioGdd?: number;
  inicioPorFenologiaObservada?: number;
  factorSusceptibilidad?: number;
  resultadoCrudo?: number;
  formulaVersion?: number;
}

/**
 * Trazas del modelo horario de oportunidad ambiental para roya amarilla.
 * El identificador persistido sigue siendo `trigo.roya_anaranjada` por
 * compatibilidad con las campañas existentes. Ninguno de estos valores es un
 * porcentaje observado o pronosticado de enfermedad.
 */
export interface IVariablesRoyaAmarillaEstriada {
  // Acumuladores del contrato recibido, conservados solamente en sombra.
  GD?: number;
  DHR?: number;
  DL?: number;
  resultadoContractualCrudo?: number;
  resultadoContractualLimitado?: number;
  // Modelo ambiental horario publicado (El Jarroudi et al., 2017).
  horasEsperadas10d?: number;
  horasValidas10d?: number;
  coberturaHoraria10d?: number;
  horasFavorables10d?: number;
  rachasFavorables10d?: number;
  rachaMaximaHoras?: number;
  frecuenciaAmbientalPct?: number;
  umbralSenalTempranaPct?: number;
  umbralFuertePct?: number;
  umbralMuyFuertePct?: number;
  nivelOportunidad?: number;
  factorSusceptibilidad?: number;
  prioridadInterna?: number;
  GDDBase0Siembra?: number;
  coberturaGdd?: number;
  umbralInicioGdd?: number;
  inicioPorFenologiaObservada?: number;
  formulaVersion?: number;
}

export interface IVariablesRoyaDelMaiz {
  GD?: number; // Grados Dia
  DHR?: number; // Dias sin lluvia (>= 0.2) y HR >= 70%
}

export interface IVariablesManchaAmarilla {
  DPrHRT?: number; // Dias con lluvia > 1mm y HR >= 80% y temp max <= 32°C y temp min >= 8°C
  DPr?: number; // Dias con lluvia > 2mm
  GDDBase0Siembra?: number;
  coberturaGdd?: number;
  umbralInicioGdd?: number;
  inicioPorFenologiaObservada?: number;
  factorSusceptibilidad?: number;
  resultadoCrudo?: number;
  formulaVersion?: number;
}

export interface IVariablesManchaDeLaHoja {
  DPr?: number; // Dias con lluvia > 10mm
  DHR?: number; // Dias con HR >= 80%
  GDDBase0Siembra?: number;
  coberturaGdd?: number;
  umbralInicioGdd?: number;
  inicioPorFenologiaObservada?: number;
  factorSusceptibilidad?: number;
  resultadoCrudo?: number;
  formulaVersion?: number;
}

export interface IVariablesFusariumDeLaEspiga {
  PMoj?: number; // número de períodos de mojado de 2 días con registro de precipitación > 0,2 y HR>81% en el día 1 y una HR≥78% en el día 2.
  GDN?: number;
  GDAcum?: number; // Grados dia acumulados
  diasClimaEsperados?: number;
  diasClimaValidos?: number;
  coberturaClima?: number;
  factorSusceptibilidad?: number;
  resultadoCrudo?: number;
  formulaVersion?: number;
}

export interface IVariablesEnfermedadCebada {
  diasFavorables?: number;
  indiceAcumulado?: number;
  lluviaAcumulada?: number;
  humedadScore?: number;
  temperaturaScore?: number;
  lluviaScore?: number;
  etapaScore?: number;
  formulaVersion?: number;
  fTemp?: number;
  fHMF?: number;
  fPP?: number;
  kVar?: number;
  ri?: number;
  horasMojado?: number;
  lluviaDiaria?: number;
  factorHumedad?: number;
  tasaDiaria?: number;
  severidadAcumulada?: number;
  GD?: number;
  DHR?: number;
  PMoj?: number;
  GDN?: number;
  GDAcum?: number;
  horasMojadoContinuo?: number;
  temperaturaMojado?: number;
  gradosHoraInfeccion?: number;
  riesgoEvento?: number;
  riesgoVentana?: number;
  eventosCompatibles?: number;
  diasFavorablesVentana?: number;
  intensidadPico?: number;
  intensidadMedia?: number;
  persistenciaVentana?: number;
  diasDesdeUltimoEvento?: number;
  agregacionVersion?: number;
  diasVentana?: number;
  diasHorariosValidos?: number;
  coberturaVentana?: number;
}

export interface IVariablesFinDeCiclo {
  PtAc7?: number; // Suma de precipitaciones de dias con mas de 7mm.
  DPr7?: number; // Dias con precipitaciones > 7mm
  Lt7?: number; // Multiplicacion de dias con precipitaciones > 7mm por cantidad de dias con precipitaciones > 7mm
}

export interface IPrediccionEnfermedad {
  enfermedad: TEnfermedad;
  idEnfermedad?: TEnfermedadId;
  resultado: number;
  estado?: "calculado" | "sin_datos" | "fuera_ventana";
  calidadDatos?: ICalidadDatoMotor;
  calidadClima?: ICalidadDatoMotor;
  resistenciaUsada?: Pick<
    IResistencia,
    | "idEnfermedad"
    | "enfermedad"
    | "multiplicador"
    | "indiceResistencia"
    | "perfil"
    | "estado"
    | "confianza"
    | "fuente"
    | "fuenteUrl"
    | "campaniaFuente"
  > & { estado?: TEstadoResistencia };
  modelo?: {
    id: string;
    version: number;
    fuente: string;
    resolucion?: "horaria" | "diaria" | "proxy_diario";
    validacion?: "operativo" | "operativo_provisional" | "experimental";
    alcance?: string;
  };
  variables:
    | IVariablesRoyaDeLaHoja
    | IVariablesRoyaAmarillaEstriada
    | IVariablesManchaAmarilla
    | IVariablesManchaDeLaHoja
    | IVariablesFusariumDeLaEspiga
    | IVariablesEnfermedadCebada
    | IVariablesFinDeCiclo
    | IVariablesRoyaDelMaiz
    | Record<string, number>;
}

export interface IPrediccionEstacion {
  idEstacion: string;
  fuente?: FuenteClima;
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
  fuenteFenologia?: "observada" | "crono" | "agrometeorologia";
  registroFenologicoId?: string;
  calidadFenologia?: ICalidadDatoMotor;
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
export interface ICreatePrediccion extends Omit<
  Partial<IPrediccion>,
  OmitirCreate
> {}

type OmitirUpdate =
  | "_id"
  | "siembra"
  | "quimica"
  | "distribuidor"
  | "productor"
  | "establecimiento";
export interface IUpdatePrediccion extends Omit<
  Partial<IPrediccion>,
  OmitirUpdate
> {}
