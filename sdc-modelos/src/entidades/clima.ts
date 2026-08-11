import { ICoordenadas } from "../compartidos";
import { ICalidadDatoMotor } from "../compartidos/calidad-datos";

export type FuenteClima =
  | "OpenWeather"
  | "OpenMeteo"
  | "FieldClimate"
  | "MeteoSource"
  | "Meteoblue"
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
  calidadDatos?: ICalidadDatoMotor;
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
  weatherCode?: number;
  cape?: number;
  showers?: number;
  rafagaViento?: number | IValores;
  calidadDatos?: ICalidadDatoMotor;
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
  calidadDatos?: ICalidadDatoMotor;
}

export type FuenteComparacionClimatica =
  "OpenMeteo" | "Meteoblue" | "FieldClimate";
export type EstadoComparacionClimatica = "ok" | "desvio" | "sin_datos";

export interface IComparacionVariableClimatica {
  fecha: string;
  variable:
    | "temperaturaMedia"
    | "temperaturaMin"
    | "temperaturaMax"
    | "lluvia"
    | "probabilidadLluvia"
    | "et0"
    | "viento";
  unidad: string;
  openMeteo?: number;
  meteoblue?: number;
  diferenciaAbs?: number;
  diferenciaPct?: number;
  estado: EstadoComparacionClimatica;
}

export interface IComparacionFuentesClimaticas {
  lat: number;
  lng: number;
  generadoEn: string;
  diasSolicitados: number;
  fuentesConsultadas: FuenteComparacionClimatica[];
  fuentePreferida: FuenteComparacionClimatica;
  meteoblueDisponible: boolean;
  calidadDatos: ICalidadDatoMotor;
  resumen: string;
  pronosticos: {
    openMeteo: IPronosticoEstacionMeteorologica[];
    meteoblue: IPronosticoEstacionMeteorologica[];
  };
  comparaciones: IComparacionVariableClimatica[];
}

export interface ISerieFrioTermicoDia {
  fecha: string;
  fuente?: FuenteClima;
  calidadDatos?: ICalidadDatoMotor;
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
  porcionesFrio?: number;
  gradosDia?: number;
  esPronostico?: boolean;
}

export type NivelCalidadDatosAgroclima =
  "alta" | "media" | "baja" | "sin_datos";

export interface ICalidadDatosAgroclima {
  nivel: NivelCalidadDatosAgroclima;
  score: number;
  fuente: string;
  detalle: string;
}

export interface IResultadoGranizoAgroclimatico {
  posibilidadPct: number;
  evidencia: string[];
  calidadDatos: ICalidadDatosAgroclima;
}

export const FUENTE_RIESGO_GRANIZO_OPEN_METEO =
  "Open-Meteo forecast: proxies weather_code, CAPE, precipitation, showers y wind_gusts";

export function esCodigoTormenta(weatherCode: number): boolean {
  return [95, 96, 99].includes(weatherCode);
}

export function esCodigoChaparron(weatherCode: number): boolean {
  return [80, 81, 82].includes(weatherCode);
}

export function esCodigoConvectivo(weatherCode: number): boolean {
  return esCodigoTormenta(weatherCode) || esCodigoChaparron(weatherCode);
}

/**
 * Indice preventivo de vigilancia convectiva (0-100) basado en proxies.
 * No representa una probabilidad meteorologica oficial y debe mostrarse como
 * indice, nunca como porcentaje. La precipitacion, los chaparrones y su
 * probabilidad son variables correlacionadas: se agrupan para no contar tres
 * veces la misma senal. La compuerta humeda evita elevar el indice por CAPE o
 * por un codigo convectivo aislado sin precipitacion asociada.
 */
export function evaluarRiesgoGranizoAgroclimatico(
  dia: Pick<
    ISerieFrioTermicoDia,
    | "lluvia"
    | "probabilidadLluvia"
    | "weatherCode"
    | "cape"
    | "showers"
    | "rafagaViento"
    | "temperaturaMax"
  >,
): IResultadoGranizoAgroclimatico {
  let score = 0;
  const evidencia: string[] = [];
  const toFiniteNumber = (value: unknown): number => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };
  const code = Number(dia.weatherCode);
  const lluvia = toFiniteNumber(dia.lluvia);
  const probLluvia = toFiniteNumber(dia.probabilidadLluvia);
  const showers = toFiniteNumber(dia.showers);
  const cape = toFiniteNumber(dia.cape);
  const rafaga = toFiniteNumber(dia.rafagaViento);
  const intensidadPrecipitacion = Math.max(lluvia, showers);

  const codeHail = code === 96 || code === 99;
  const codeTormenta = esCodigoTormenta(code);
  const codeChaparron = esCodigoChaparron(code);
  const precipitacionActiva = lluvia >= 1 || showers >= 0.5;
  const probabilidadAlta = probLluvia >= 45;
  const soportePrecipitacion = lluvia >= 0.5 || showers >= 0.2;
  const disparoHumedo = precipitacionActiva || probabilidadAlta;

  if (Number.isFinite(code)) evidencia.push(`Codigo de tiempo ${code}`);

  if (codeHail) {
    score += 24;
    evidencia.push(
      "Codigo de tormenta con granizo usado como proxy; requiere validacion local/radar.",
    );
  } else if (code === 95) {
    score += 18;
    evidencia.push("Codigo de tormenta sin granizo explicito.");
  } else if (code === 82) {
    score += 8;
    evidencia.push("Codigo de chaparron violento.");
  } else if (code === 81) {
    score += 6;
    evidencia.push("Codigo de chaparron moderado.");
  } else if (code === 80) {
    score += 3;
    evidencia.push("Codigo de chaparron leve.");
  }

  if (cape >= 2000) score += 22;
  else if (cape >= 1000) score += 16;
  else if (cape >= 500) score += 9;
  else if (cape >= 250) score += 4;
  if (dia.cape !== undefined) {
    evidencia.push(`Energia convectiva CAPE ${Math.round(cape)}`);
  }

  if (intensidadPrecipitacion >= 15) score += 10;
  else if (intensidadPrecipitacion >= 7) score += 8;
  else if (intensidadPrecipitacion >= 2) score += 5;
  else if (intensidadPrecipitacion >= 0.5) score += 2;
  if (dia.lluvia !== undefined) evidencia.push(`Lluvia prevista ${lluvia} mm`);

  if (probLluvia >= 75) score += 4;
  else if (probLluvia >= 50) score += 3;
  else if (probLluvia >= 30) score += 1;
  if (dia.probabilidadLluvia !== undefined) {
    evidencia.push(`Probabilidad de precipitacion ${probLluvia}%`);
  }

  if (dia.showers !== undefined) {
    evidencia.push(`Chaparrones previstos ${showers} mm`);
  }

  if (rafaga >= 70) score += 6;
  else if (rafaga >= 50) score += 3;
  if (dia.rafagaViento !== undefined) {
    evidencia.push(`Rafagas maximas ${rafaga} km/h`);
  }

  if (codeTormenta && cape >= 1000 && precipitacionActiva) {
    score += 8;
    evidencia.push(
      "Convergencia entre tormenta, inestabilidad y precipitacion activa.",
    );
  }
  if (codeHail && precipitacionActiva) score += 5;

  const escenarioExcepcionalSinCodigoGranizo =
    code === 95 &&
    cape >= 2500 &&
    intensidadPrecipitacion >= 10 &&
    probLluvia >= 60 &&
    rafaga >= 60;
  if (escenarioExcepcionalSinCodigoGranizo) {
    score += 8;
    evidencia.push(
      "Convergencia severa sin codigo explicito de granizo: se mantiene como vigilancia, no como alerta automatica.",
    );
  }

  // Los codigos WMO 96 y 99 son los unicos que explicitan granizo. CAPE,
  // lluvia, rafagas y el codigo 95 describen conveccion severa, pero no
  // confirman el hidrometeoro. Sin 96/99 el indice queda bajo el umbral rojo.
  if (!codeHail) {
    score = Math.min(score, 69);
  }

  if (!disparoHumedo && !codeTormenta) {
    score = Math.min(score, cape >= 500 ? 8 : 5);
    evidencia.push(
      "Sin lluvia/chaparrones suficientes: Chaman limita el riesgo para evitar falso positivo.",
    );
  } else if (!disparoHumedo && codeTormenta) {
    score = Math.min(score, codeHail ? 24 : 16);
    evidencia.push(
      "Hay senal de tormenta, pero falta soporte de lluvia; se informa como vigilancia, no alarma fuerte.",
    );
  } else if (
    codeChaparron &&
    lluvia < 0.5 &&
    showers < 0.5 &&
    probLluvia < 30
  ) {
    score = Math.min(score, 6);
    evidencia.push(
      "Codigo convectivo aislado sin precipitacion asociada; lectura corregida.",
    );
  }

  if (!soportePrecipitacion && codeTormenta) {
    score = Math.min(score, codeHail ? 15 : 10);
    evidencia.push(
      "Tormenta sin volumen de lluvia/chaparron previsto: se informa como vigilancia residual.",
    );
  } else if (!soportePrecipitacion && probabilidadAlta) {
    score = Math.min(score, 12);
    evidencia.push(
      "Probabilidad de precipitacion sin volumen previsto: no se eleva riesgo de granizo sin soporte humedo.",
    );
  }

  const soportes = [
    codeTormenta,
    codeChaparron && disparoHumedo,
    cape >= 500,
    probabilidadAlta,
    precipitacionActiva,
    rafaga >= 50,
  ].filter(Boolean).length;
  const variables = [
    dia.weatherCode !== undefined,
    dia.cape !== undefined,
    dia.probabilidadLluvia !== undefined,
    dia.showers !== undefined,
    dia.rafagaViento !== undefined,
    dia.lluvia !== undefined,
  ].filter(Boolean).length;
  const calidadScore = Math.round(
    Math.min(64, (variables / 6) * 40 + Math.min(soportes, 4) * 6),
  );
  const nivel =
    variables === 0
      ? "sin_datos"
      : disparoHumedo && soportes >= 3 && variables >= 4
        ? "media"
        : "baja";

  return {
    posibilidadPct: Math.max(0, Math.min(100, Math.round(score))),
    evidencia: evidencia.length
      ? evidencia
      : ["Sin variables convectivas suficientes para elevar el riesgo."],
    calidadDatos: {
      nivel,
      score: calidadScore,
      fuente: FUENTE_RIESGO_GRANIZO_OPEN_METEO,
      detalle:
        nivel === "media"
          ? "Cobertura media de proxies convectivos; no es probabilidad de granizo y no incluye radar, perfil vertical, cizalladura ni nivel de congelacion."
          : "Cobertura limitada de proxies; requiere pronostico oficial o validacion meteorologica local antes de accionar.",
    },
  };
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
  etapaFenologica?: string;
  contextoFenologico?: string;
  umbralDanoLeveC?: number;
  umbralDanoSeveroC?: number;
  fuenteUmbral?: string;
  margenUmbralC?: number;
  calibracionVarietal?: string;
  ajusteVarietalC?: number;
  fuenteAjusteVarietal?: string;
  evidencia?: string[];
  calidadDatos?: ICalidadDatosAgroclima;
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
  etapaFenologica?: string;
  contextoFenologico?: string;
  umbralDanoLeveC?: number;
  umbralDanoSeveroC?: number;
  fuenteUmbral?: string;
  calibracionVarietal?: string;
  ajusteVarietalC?: number;
  fuenteAjusteVarietal?: string;
  diasRiesgo: number;
  evidencia: string[];
  calidadDatos?: ICalidadDatosAgroclima;
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
  fuente: "OpenMeteo" | "FieldClimate" | "FieldClimate + OpenMeteo";
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
    horasFrio?: number;
    horasFrioEfectivas?: number;
    porcionesFrio?: number;
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
    etapaFenologica?: string;
    umbralDanoLeveC?: number;
    umbralDanoSeveroC?: number;
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
  calculo?: {
    porcionesFrio: "dinamico_horario" | "no_disponible";
    observaciones?: string[];
  };
  contextoCultivo?: {
    plantacionJoven?: boolean;
    edadPlantacionAnios?: number;
    edadProductivaDesdeAnios?: number;
    lectura?: string;
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
