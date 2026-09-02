import { Cultivo } from "../entidades/crono";
import {
  FuenteMeteorologicaNormalizada,
  ISerieAgrometeorologicaDia,
  ISerieAgrometeorologicaHora,
} from "../entidades/agrometeorologia";
import {
  calcularVpdKpa,
  esNumeroFinito,
  PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA,
} from "./agrometeorologia";

export const WATER_DEMAND_ENGINE_VERSION = "water-demand-1.1.0";

export type FaseDemandaHidrica =
  | "implantation"
  | "vegetative"
  | "reproductive"
  | "maturity"
  | "harvest"
  | "rest"
  | "unknown";

export type NivelDemandaHidricaHoraria =
  | "low"
  | "expected"
  | "high"
  | "very_high"
  | "night"
  | "not_evaluated"
  | "no_data";

export type EstadoEstomaticoEstimado =
  | "open"
  | "regulated"
  | "closed"
  | "not_evaluated"
  | "no_data";

export interface IEstadoDemandaHidricaHora {
  timestamp: string;
  localDate: string;
  timezone: string;
  isForecast: boolean;
  isDaylight: boolean;
  daylightSource: "radiation" | "local_hour";
  crop: Cultivo;
  stage?: string;
  phase: FaseDemandaHidrica;
  level: NivelDemandaHidricaHoraria;
  stomatalState: EstadoEstomaticoEstimado;
  temperatureC?: number;
  relativeHumidityPct?: number;
  vpdKpa?: number;
  airWaterPotentialMpa?: number;
  vpdThresholdKpa: number;
  availableWaterPercentage?: number;
  source: FuenteMeteorologicaNormalizada;
  completenessPercentage: number;
  interpretation: string;
  scope: string;
  calculationVersion: string;
}

export interface IVentanaAperturaEstomatica {
  desde: string;
  hasta: string;
  timezone: string;
  durationHours: number;
}

const DEFAULT_VPD_THRESHOLD_KPA = 1.8;
const DAYLIGHT_RADIATION_THRESHOLD_W_M2 = 20;

export function evaluarDemandaHidricaHora(
  hour: ISerieAgrometeorologicaHora,
  crop: Cultivo,
  day?: ISerieAgrometeorologicaDia,
): IEstadoDemandaHidricaHora {
  const weather = hour.weather || {};
  const vpdKpa = esNumeroFinito(weather.vpdKpa)
    ? weather.vpdKpa
    : calcularVpdKpa(weather.temperatureC, weather.relativeHumidityPct);
  const vpdThresholdKpa =
    PARAMETROS_AGROMETEOROLOGICOS_REFERENCIA[crop]?.umbralVpdKpa ||
    DEFAULT_VPD_THRESHOLD_KPA;
  const phase = resolverFaseDemandaHidrica(day?.stage);
  const daylight = resolverPeriodoLuminoso(hour);
  const availableWaterPercentage = day?.metrics?.availableWaterPercentage;
  const airWaterPotentialMpa = calcularPotencialHidricoAireMpa(
    weather.temperatureC,
    weather.relativeHumidityPct,
  );
  const level = resolverNivel(
    daylight.isDaylight,
    phase,
    vpdKpa,
    vpdThresholdKpa,
  );
  const stomatalState = resolverEstadoEstomatico(
    daylight.isDaylight,
    phase,
    vpdKpa,
    vpdThresholdKpa,
    availableWaterPercentage,
  );

  return {
    timestamp: hour.timestamp,
    localDate: hour.localDate,
    timezone: hour.timezone,
    isForecast: hour.isForecast,
    isDaylight: daylight.isDaylight,
    daylightSource: daylight.source,
    crop,
    stage: day?.stage,
    phase,
    level,
    stomatalState,
    temperatureC: weather.temperatureC,
    relativeHumidityPct: weather.relativeHumidityPct,
    vpdKpa,
    airWaterPotentialMpa,
    vpdThresholdKpa,
    availableWaterPercentage,
    source: hour.source,
    completenessPercentage: hour.completenessPercentage,
    interpretation: interpretar(level, phase),
    scope:
      "Apertura estimada con ambiente, luz, etapa y reserva hidrica; no es una medicion directa del estoma.",
    calculationVersion: WATER_DEMAND_ENGINE_VERSION,
  };
}

export function resolverEstadoEstomatico(
  isDaylight: boolean,
  phase: FaseDemandaHidrica,
  vpdKpa: number | undefined,
  thresholdKpa: number,
  availableWaterPercentage?: number,
): EstadoEstomaticoEstimado {
  if (phase === "rest" || phase === "harvest") return "not_evaluated";
  if (!isDaylight) return "closed";
  if (!esNumeroFinito(vpdKpa)) return "no_data";
  if (
    (esNumeroFinito(availableWaterPercentage) &&
      availableWaterPercentage < 20) ||
    vpdKpa >= thresholdKpa
  ) {
    return "regulated";
  }
  return "open";
}

export function resumirVentanasAperturaEstomatica(
  hours: IEstadoDemandaHidricaHora[],
): IVentanaAperturaEstomatica[] {
  const openHours = [
    ...new Map(
      hours
        .filter(
          (hour) =>
            hour.stomatalState === "open" &&
            Number.isFinite(new Date(hour.timestamp).getTime()),
        )
        .map((hour) => [hour.timestamp, hour]),
    ).values(),
  ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const groups: IEstadoDemandaHidricaHora[][] = [];
  for (const hour of openHours) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const separation = previous
      ? new Date(hour.timestamp).getTime() -
        new Date(previous.timestamp).getTime()
      : Number.POSITIVE_INFINITY;
    if (!current || separation > 90 * 60 * 1000) groups.push([hour]);
    else current.push(hour);
  }
  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      desde: first.timestamp,
      hasta: new Date(
        new Date(last.timestamp).getTime() + 60 * 60 * 1000,
      ).toISOString(),
      timezone: first.timezone,
      durationHours: group.length,
    };
  });
}

/**
 * Potencial hidrico del vapor de agua respecto de aire saturado:
 * Psi = (R * T / Vw) * ln(HR), expresado en MPa.
 * Es una propiedad del aire; no estima potencial de raiz, tallo ni hoja.
 */
export function calcularPotencialHidricoAireMpa(
  temperatureC?: number,
  relativeHumidityPct?: number,
): number | undefined {
  if (
    !esNumeroFinito(temperatureC) ||
    !esNumeroFinito(relativeHumidityPct) ||
    relativeHumidityPct <= 0 ||
    relativeHumidityPct > 100
  ) {
    return undefined;
  }
  const gasConstantJMolK = 8.314462618;
  const waterMolarVolumeM3Mol = 18e-6;
  const temperatureK = temperatureC + 273.15;
  if (temperatureK <= 0) return undefined;
  return (
    (((gasConstantJMolK * temperatureK) / waterMolarVolumeM3Mol) *
      Math.log(relativeHumidityPct / 100)) /
    1_000_000
  );
}

export function resolverFaseDemandaHidrica(stage?: string): FaseDemandaHidrica {
  const value = normalizar(stage);
  if (!value) return "unknown";
  if (incluye(value, ["dormancia", "reposo", "nueva campania"])) {
    return "rest";
  }
  if (incluye(value, ["cosecha", "senescencia"])) return "harvest";
  if (incluye(value, ["madurez", "r7", "fisiologica"])) return "maturity";
  if (
    incluye(value, [
      "floracion",
      "antesis",
      "espigazon",
      "polinizacion",
      "cuaje",
      "envero",
      "llenado",
      "tuberizacion",
      "fruto",
      "nuez",
      "r1",
      "r3",
      "r5",
    ])
  ) {
    return "reproductive";
  }
  if (
    incluye(value, [
      "siembra",
      "plantacion",
      "germinacion",
      "emergencia",
      "brotacion",
      "yema",
    ])
  ) {
    return "implantation";
  }
  return "vegetative";
}

function resolverNivel(
  isDaylight: boolean,
  phase: FaseDemandaHidrica,
  vpdKpa: number | undefined,
  thresholdKpa: number,
): NivelDemandaHidricaHoraria {
  if (phase === "rest" || phase === "harvest") return "not_evaluated";
  if (!isDaylight) return "night";
  if (!esNumeroFinito(vpdKpa)) return "no_data";
  if (vpdKpa < 0.4) return "low";
  if (vpdKpa < thresholdKpa) return "expected";
  if (vpdKpa < thresholdKpa * 1.25) return "high";
  return "very_high";
}

function resolverPeriodoLuminoso(hour: ISerieAgrometeorologicaHora): {
  isDaylight: boolean;
  source: "radiation" | "local_hour";
} {
  const radiation = hour.weather?.shortwaveRadiationWm2;
  if (esNumeroFinito(radiation)) {
    return {
      isDaylight: radiation >= DAYLIGHT_RADIATION_THRESHOLD_W_M2,
      source: "radiation",
    };
  }
  const localHour = horaLocal(hour.timestamp, hour.timezone);
  return {
    isDaylight: localHour >= 7 && localHour < 19,
    source: "local_hour",
  };
}

function horaLocal(timestamp: string, timezone: string): number {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 12;
  try {
    const value = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      hour12: false,
    }).format(parsed);
    const result = Number(value);
    return Number.isFinite(result) ? result : parsed.getUTCHours();
  } catch {
    return parsed.getUTCHours();
  }
}

function interpretar(
  level: NivelDemandaHidricaHoraria,
  phase: FaseDemandaHidrica,
): string {
  if (level === "not_evaluated") {
    return "La etapa actual no requiere interpretar demanda estomatica activa.";
  }
  if (level === "night") {
    return "Periodo nocturno: la actividad estomatica suele estar reducida; se conserva la lectura ambiental hora por hora.";
  }
  if (level === "no_data") {
    return "Faltan temperatura o humedad suficientes para estimar el VPD de esta hora.";
  }
  const stageContext =
    phase === "reproductive"
      ? " Etapa reproductiva sensible: priorizar el seguimiento en campo."
      : phase === "implantation"
        ? " Cobertura inicial: interpretar junto con emergencia y humedad del suelo."
        : phase === "maturity"
          ? " En madurez, la respuesta fisiologica esperada es menor."
          : "";
  const messages: Record<
    Exclude<NivelDemandaHidricaHoraria, "night" | "not_evaluated" | "no_data">,
    string
  > = {
    low: "Demanda atmosferica baja; el ambiente limita la transpiracion potencial.",
    expected:
      "Demanda atmosferica dentro del rango operativo de referencia del cultivo.",
    high: "Demanda atmosferica alta; conviene contrastar con la reserva de agua y observacion de lote.",
    very_high:
      "Demanda atmosferica muy alta; aumenta la probabilidad de regulacion estomatica defensiva.",
  };
  return `${messages[level]}${stageContext}`;
}

function normalizar(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
}

function incluye(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}
