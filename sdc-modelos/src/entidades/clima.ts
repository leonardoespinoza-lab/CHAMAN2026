import { ICoordenadas } from "../compartidos";

export type FuenteClima =
  | "OpenWeather"
  | "OpenMeteo"
  | "FieldClimate"
  | "MeteoSource"
  | "Omixom"
  | "Horatech"
  | "Dispositivo";
export interface IValores {
  avg?: number;
  min?: number;
  max?: number;
  sum?: number;
  count?: number;
  last?: number;
  result?: number;
}

export interface IClimaEstacionMeteorologica {
  fuente?: FuenteClima;
  icon?: string;
  iconNum?: number;
  summary?: string;
  fecha?: string;
  diaNoche?: "Día" | "Noche";
  estacion?: string;
  ubicacion?: ICoordenadas;
  distancia?: number;
  temperatura?: IValores;
  humedad?: IValores;
  presion?: IValores;
  velocidadViento?: IValores;
  direccionViento?: IValores;
  intensidadLuminica?: IValores;
  probabilidadLluvia?: number;
  lluvia?: IValores;
  radiacionSolar?: IValores;
  humedadSuelo?: { [nivel: number]: IValores };
  temperaturaSuelo?: { [nivel: number]: IValores };
  panelSolar?: IValores;
  bateria?: IValores;
  rafagaViento?: IValores;
  nivelDeAgua?: IValores; // Freatímetro
  et0?: IValores;
}

export interface IPronosticoEstacionMeteorologica {
  fuente?: FuenteClima;
  fecha?: string;
  diaNoche?: "Día" | "Noche";
  estacion?: string;
  ubicacion?: ICoordenadas;
  distancia?: number;
  //
  temperatura?: IValores;
  humedad?: IValores;
  velocidadViento?: IValores;

  lluvia?: number;
  probabilidadLluvia?: number;
  direccionViento?: number;
  radiacionSolar?: number;
  et0?: number;
}

export interface IPronosticoMeteoSource {
  fuente?: FuenteClima; // MeteoSource
  fecha?: string;
  ubicacion?: ICoordenadas;
  //
  temperatura?: IValores;
  humedad?: IValores;
  velocidadViento?: IValores;

  lluvia?: number;
  probabilidadLluvia?: number;
  direccionViento?: number;
  radiacionSolar?: number;
  et0?: number;
}

export interface ISerieFrioTermicoDia {
  fecha: string;
  temperaturaMin?: number;
  temperaturaMax?: number;
  temperaturaMedia?: number;
  lluvia?: number;
  probabilidadLluvia?: number;
  weatherCode?: number;
  cape?: number;
  showers?: number;
  rafagaViento?: number;
  horasFrio?: number;
  horasFrioEfectivas?: number;
  gradosDia?: number;
  esPronostico?: boolean;
}

export type TipoRiesgoAgroclimatico = "helada" | "granizo";
export type NivelRiesgoAgroclimatico = "bajo" | "medio" | "alto";

export interface IDiaRiesgoAgroclimatico {
  fecha: string;
  nivel: NivelRiesgoAgroclimatico;
  posibilidadPct: number;
  temperaturaMin?: number;
  temperaturaMax?: number;
  lluvia?: number;
  probabilidadLluvia?: number;
  weatherCode?: number;
  cape?: number;
  showers?: number;
  rafagaViento?: number;
  evidencia?: string[];
}

export interface IRiesgoAgroclimatico {
  tipo: TipoRiesgoAgroclimatico;
  aplica: boolean;
  nivel: NivelRiesgoAgroclimatico;
  posibilidadPct: number;
  titulo: string;
  lectura: string;
  recomendacion: string;
  fechaCritica?: string;
  diasRiesgo: number;
  evidencia: string[];
  serie: IDiaRiesgoAgroclimatico[];
}

export interface IResumenRiesgosAgroclimaticos {
  fuente: "OpenMeteo";
  lat: number;
  lng: number;
  cultivo?: string;
  generadoEn: string;
  helada?: IRiesgoAgroclimatico;
  granizo: IRiesgoAgroclimatico;
}

export interface IFrioTermicoCultivo {
  fuente: "OpenMeteo";
  lat: number;
  lng: number;
  cultivo?: string;
  generadoEn: string;
  periodoFrio: {
    desde: string;
    hasta: string;
    dias: number;
  };
  periodoTermico: {
    desde: string;
    hasta: string;
    dias: number;
  };
  requerimientos: {
    horasFrioObjetivo?: number;
    horasFrioEfectivasObjetivo?: number;
    porcionesFrioObjetivo?: number;
    temperaturaBaseGradosDia?: number;
    gradosDiaBrotacionObjetivo?: number;
    gradosDiaFloracionObjetivo?: number;
  };
  acumulados: {
    horasFrio: number;
    horasFrioEfectivas: number;
    porcionesFrio: number;
    gradosDia: number;
    lluvia: number;
  };
  progreso: {
    horasFrioPct: number;
    horasFrioEfectivasPct: number;
    porcionesFrioPct: number;
    brotacionPct: number;
    floracionPct: number;
  };
  riesgoHelada: {
    nivel: "bajo" | "medio" | "alto";
    dias: number;
    fechaCritica?: string;
    temperaturaMinima?: number;
  };
  eventos: {
    brotacion: {
      estado: "esperando_frio" | "acumulando_calor" | "probable" | "alcanzada";
      lectura: string;
    };
    floracion: {
      estado: "pendiente" | "probable" | "alcanzada";
      lectura: string;
    };
    ventanaSanitaria: {
      estado: "baja" | "media" | "alta";
      lectura: string;
    };
  };
  serie: ISerieFrioTermicoDia[];
  lectura: string;
}

// ========================================
// INTERFACES PARA SISTEMA DE TILES CLIMÁTICOS
// ========================================

/**
 * Variables climáticas disponibles para tiles de Meteosource
 */
export type WeatherVariable =
  | "temperature"
  | "precipitation"
  | "clouds"
  | "wind_speed"
  | "humidity"
  | "pressure"
  | "visibility"
  | "gust"
  | "wind_direction"
  | "uv_index"
  | "dew_point"
  | "sunshine"
  | "global_radiation"
  | "diffuse_radiation"
  | "cape"
  | "lifted_index";

/**
 * Metadatos de una variable climática para tiles
 */
export interface WeatherVariableMetadata {
  name: string;
  unit: string;
  description: string;
  colorScale?: string;
}

/**
 * Información de un tile climático individual
 */
export interface TileInfo {
  x: number;
  y: number;
  z: number;
  variable: WeatherVariable;
  datetime: string;
  url: string;
  cached?: boolean;
}

/**
 * Solicitud para obtener tiles climáticos en un viewport
 */
export interface TileViewportRequest {
  /** Variable climática a visualizar */
  variable: WeatherVariable;
  /** Momento temporal (now para datos actuales) */
  datetime: string;
  /** Nivel de zoom del mapa */
  zoom: number;
  /** Límites del viewport del mapa */
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

/**
 * Respuesta con tiles climáticos para un viewport
 */
export interface TileResponse {
  /** Variable climática solicitada */
  variable: WeatherVariable;
  /** Momento temporal solicitado */
  datetime: string;
  /** Nivel de zoom */
  zoom: number;
  /** Lista de tiles disponibles en el viewport del usuario */
  tiles: TileInfo[];
  /** Metadatos de la variable climática */
  metadata: WeatherVariableMetadata;
  /** Si los datos vienen de caché */
  fromCache?: boolean;
  /** Timestamp de cuando se generó la respuesta */
  generatedAt: string;
}

/**
 * Respuesta de debug para tiles climáticos
 */
export interface TileDebugResponse {
  /** Mensaje descriptivo */
  message: string;
  /** Variable climática solicitada */
  variable: WeatherVariable;
  /** Momento temporal solicitado */
  datetime: string;
  /** Nivel de zoom */
  zoom: number;
  /** Número de establecimientos del usuario */
  establecimientos: number;
  /** Bounding box calculado de los establecimientos */
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  /** Lista de tiles que se descargarían */
  tiles: Array<{ x: number; y: number; z: number }>;
  /** Total de tiles a descargar */
  totalTiles: number;
  /** Información resumida de establecimientos */
  establecimientosData?: Array<{
    _id?: string;
    nombre?: string;
    ubicacionCount: number;
  }>;
}
