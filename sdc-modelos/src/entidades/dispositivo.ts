import { IGeoJSONPoint } from "../compartidos";
import { IDistribuidor } from "./distribuidor";
import { IProductor } from "./productor";
import { IQuimica } from "./quimica";
import { IReporte, SensoresV2 } from "./reporte";
import type { IEstablecimiento } from "./establecimiento";
import type { ILote } from "./lote";

export interface IMetaDataLora {
  ubicacionGW?: IGeoJSONPoint;
  applicationID?: string;
  applicationName?: string;
  gatewayID?: string;
  frequency?: number;
  fCnt?: number;
  fPort?: number;
  snr?: number;
  rssi?: number;
  dr?: number;
  origenInventario?: "ChirpStack";
  chirpstackSincronizadoEn?: string;
  chirpstackTenantID?: string;
  chirpstackApplicationID?: string;
  chirpstackApplicationName?: string;
  chirpstackDeviceProfileID?: string;
  chirpstackDeviceProfileName?: string;
  chirpstackDescription?: string;
  chirpstackLastSeenAt?: string;
}

/** Inventario tecnico seguro; nunca contiene claves OTAA ni de sesion. */
export interface ILorawanDeviceCatalogItem {
  devEUI: string;
  name?: string;
  description?: string;
  tenantID?: string;
  applicationID?: string;
  applicationName?: string;
  deviceProfileID?: string;
  deviceProfileName?: string;
  lastSeenAt?: string;
}

export interface ILorawanDeviceCatalogSyncResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface IBateria {
  valor?: number;
  unidad?: string;
  fecha?: string;
}

export interface IFrioAcumulado {
  temporadaInicio?: string;
  fechaInicio?: string;
  fechaUltimoCalculo?: string;
  ultimaTemperatura?: number;
  horasFrio?: number;
  /** @deprecated Campo legacy ambiguo; no usar para decisiones nuevas. */
  horasFrioEfectivas?: number;
  /** Solo valido cuando versionModelo identifica Dynamic Model horario. */
  porcionesFrio?: number;
  /** @deprecated Factor legacy sin una unidad cientifica estable. */
  factorEfectivoActual?: number;
  modelo?: string;
  versionModelo?: string;
  coberturaPct?: number;
  estadoCalculo?: "preview" | "canonico" | "legacy";
  fuente?: "Sensor LoRa";
  observaciones?: string;
}

export interface IAsignacionDispositivoLote {
  idLote?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  activa?: boolean;
}

export type VariableEntradaAnalogica =
  "sin_definir" | "presion_agua" | "nivel_napa";

export interface IConfiguracionPerfilSuelo {
  tipo: "sonda_sentek_120cm";
  protocolo: "SDI-12";
  niveles: 12;
  profundidadesCm: number[];
  variables: ("humedad_vwc" | "salinidad_vic" | "temperatura")[];
}

export interface IConfiguracionEntradaAnalogica {
  canal: 1 | 2;
  tipoSenal: "4-20mA";
  variable: VariableEntradaAnalogica;
  entradaMinMa: number;
  entradaMaxMa: number;
  salidaMin?: number;
  salidaMax?: number;
  unidadSalida?: string;
  /**
   * Distancia vertical entre el nivel del terreno y el transductor.
   * Solo se usa para nivel_napa: la salida calibrada 4-20 mA representa
   * la columna de agua sobre el sensor y Chaman informa
   * profundidadInstalacionM - columnaAgua.
   */
  profundidadInstalacionM?: number;
  fuenteCalibracion?: string;
  observaciones?: string;
}

/**
 * Describe los sensores fisicos conectados al controlador. La sonda de perfil
 * y el transductor analogico son fuentes independientes aunque compartan DevEUI.
 */
export interface IConfiguracionLecturasDispositivo {
  perfilSuelo?: IConfiguracionPerfilSuelo;
  entradaAnalogica?: IConfiguracionEntradaAnalogica;
}

export type TipoServicioDispositivo =
  "perfil_suelo" | "nivel_napa" | "meteorologia" | "pluviometria" | "otro";

/**
 * Servicio agronomico expuesto por un controlador fisico. Un mismo DevEUI
 * puede transportar varios sensores independientes sin duplicar inventario
 * ni historial de comunicaciones.
 */
export interface IServicioDispositivo {
  id: string;
  tipo: TipoServicioDispositivo;
  nombre: string;
  sensores: SensoresV2[];
  habilitado?: boolean;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  fechaAsignacionLote?: string;
  historialAsignacionesLote?: IAsignacionDispositivoLote[];
  fuente?: "inferido" | "administrador";
}

const PERFIL_SUELO_SENSORES: SensoresV2[] = [
  "Humedad Suelo Profundidad",
  "Temperatura Suelo",
  "Salinidad Suelo",
];
const NAPA_SENSORES: SensoresV2[] = ["Entrada Analógica", "Presión", "Napa"];

export function serviciosDispositivoNormalizados(
  dispositivo?: Partial<IDispositivo>,
): IServicioDispositivo[] {
  if (!dispositivo) return [];
  if (Array.isArray(dispositivo.servicios)) {
    return dispositivo.servicios
      .filter((servicio) => servicio && servicio.habilitado !== false)
      .map((servicio) => ({ ...servicio }));
  }

  const sensores = new Set(dispositivo.sensores || []);
  const asignacion = {
    idProductor: dispositivo.idProductor,
    idEstablecimiento: dispositivo.idEstablecimiento,
    idLote: dispositivo.idLote,
    fechaAsignacionLote: dispositivo.fechaAsignacionLote,
    fuente: "inferido" as const,
  };
  const servicios: IServicioDispositivo[] = [];
  const tienePerfil =
    !!dispositivo.configuracionLecturas?.perfilSuelo ||
    PERFIL_SUELO_SENSORES.some((sensor) => sensores.has(sensor));
  const tieneAnalogico =
    !!dispositivo.configuracionLecturas?.entradaAnalogica ||
    NAPA_SENSORES.some((sensor) => sensores.has(sensor));

  if (tienePerfil) {
    servicios.push({
      id: "perfil-suelo-sentek",
      tipo: "perfil_suelo",
      nombre: "Perfil de suelo Sentek 1,2 m",
      sensores: PERFIL_SUELO_SENSORES,
      habilitado: true,
      ...asignacion,
    });
  }
  if (tieneAnalogico) {
    servicios.push({
      id: "nivel-napa",
      tipo: "nivel_napa",
      nombre: "Napa / freatímetro",
      sensores: NAPA_SENSORES,
      habilitado: true,
      ...asignacion,
    });
  }
  return servicios;
}

export type EstadoCalificacionMeteorologica =
  "calificado" | "referencia" | "rechazado";

export type RolVariableMeteorologica =
  "aire_2m" | "aire_canopia" | "suelo" | "desconocido";

export type VariableCalibracionMeteorologica =
  "temperatura_aire" | "humedad_relativa";

export interface ICalificacionVariableMeteorologica {
  estado: EstadoCalificacionMeteorologica;
  rol?: RolVariableMeteorologica;
  alturaM?: number;
  abrigoRadiacion?: boolean;
  /**
   * Exactitud en la unidad de la variable: grados C para temperatura y
   * puntos porcentuales para humedad relativa.
   */
  exactitud?: number;
  fechaCalibracion?: string;
  proximaCalibracion?: string;
  /**
   * Correccion en la unidad de la variable. Solo se aplica dentro de un
   * intervalo calificado para el timestamp de la lectura.
   */
  offset?: number;
  fuenteCalibracion?: string;
  observaciones?: string;
}

export interface IIntervaloCalibracionMeteorologica extends ICalificacionVariableMeteorologica {
  id: string;
  variable: VariableCalibracionMeteorologica;
  version: "calificacion-variable-v1";
  registradoEn: string;
}

export interface ICalificacionSensorMeteorologico {
  /**
   * "calificado" exige metadatos de instalación y calibración trazables.
   * "referencia" puede priorizarse para describir el microambiente del lote,
   * pero no habilita por sí solo una decisión biológica varietal.
   * "rechazado" excluye la variable meteorológica del motor canónico.
   */
  estado: EstadoCalificacionMeteorologica;
  rolTemperatura?: RolVariableMeteorologica;
  alturaM?: number;
  abrigoRadiacion?: boolean;
  exactitudTemperaturaC?: number;
  fechaCalibracion?: string;
  proximaCalibracion?: string;
  offsetTemperaturaC?: number;
  fuenteCalibracion?: string;
  observaciones?: string;
  /**
   * Calificacion independiente de humedad relativa. La calificacion termica
   * legacy/current nunca certifica esta variable.
   */
  humedadRelativa?: ICalificacionVariableMeteorologica;
  /**
   * Snapshots inmutables administrados por backend para reproducir la
   * calificacion que regia en la fecha de cada lectura.
   */
  historialCalibraciones?: IIntervaloCalibracionMeteorologica[];
}

export type TipoDispositivo =
  | "Estación Meteorológica"
  | "Estacion Meteorologica"
  | "Sensor de Humedad de Suelo"
  | "Pluviómetro"
  | "Pluviometro"
  | "Otro";

export interface IDispositivo {
  _id?: string;
  fechaCreacion?: string;
  idQuimica?: string;
  idDistribuidor?: string;
  idProductor?: string;
  idEstablecimiento?: string;
  idLote?: string;
  fechaAsignacionLote?: string;
  historialAsignacionesLote?: IAsignacionDispositivoLote[];
  deveui?: string;
  tipo?: TipoDispositivo;
  metadata?: IMetaDataLora;
  sensores?: SensoresV2[];
  configuracionLecturas?: IConfiguracionLecturasDispositivo;
  servicios?: IServicioDispositivo[];
  geojson?: IGeoJSONPoint;
  nombre?: string;
  bateria?: IBateria;
  ultimoReporte?: IReporte;
  frioAcumulado?: IFrioAcumulado;
  calificacionMeteorologica?: ICalificacionSensorMeteorologico;
  fechaUltimaComunicacion?: string;
  quimica?: IQuimica;
  distribuidor?: IDistribuidor;
  productor?: IProductor;
  establecimiento?: IEstablecimiento;
  lote?: ILote;
}

type Omitir = "_id";
export interface ICreateDispositivo extends Omit<
  Partial<IDispositivo>,
  Omitir
> {}

export interface IUpdateDispositivo extends Omit<
  Partial<IDispositivo>,
  Omitir
> {}
