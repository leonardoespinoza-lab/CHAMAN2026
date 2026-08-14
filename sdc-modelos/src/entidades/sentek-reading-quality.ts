import { LorawanRawVariable } from "./lorawan-uplink";

export interface IReadingQualityResult {
  quality: "valid" | "unverified" | "invalid";
  reason: string;
  reference: string;
}

export const SENTEK_READING_REFERENCE = "sentek-drill-drop-spec-v2026-02";
export const MILESIGHT_READING_REFERENCE =
  "milesight-uc50x-communication-protocol-v3.3";

/**
 * Valida plausibilidad de la magnitud, no la representatividad agronómica.
 * VIC no tiene una conversión universal a EC: una lectura no negativa se
 * conserva como tendencia, pero permanece "unverified" hasta contrastarla a
 * igual humedad y con una calibración de suelo.
 */
export function validateControllerReading(
  variable: LorawanRawVariable,
  value: number,
): IReadingQualityResult {
  if (!Number.isFinite(value)) {
    return {
      quality: "invalid",
      reason: "La lectura no es un numero finito.",
      reference: SENTEK_READING_REFERENCE,
    };
  }

  switch (variable) {
    case "humedad_suelo":
      return bounded(
        value,
        0,
        100,
        "VWC fuera del rango fisico 0-100 %.",
        SENTEK_READING_REFERENCE,
      );
    case "temperatura_suelo":
      return bounded(
        value,
        -40,
        60,
        "Temperatura fuera del rango publicado -40 a 60 C.",
        SENTEK_READING_REFERENCE,
      );
    case "corriente_analogica":
      return bounded(
        value,
        4,
        20,
        "Corriente fuera del modo configurado 4-20 mA.",
        MILESIGHT_READING_REFERENCE,
      );
    case "salinidad_suelo":
      if (value < 0) {
        return {
          quality: "invalid",
          reason: "VIC negativo: lectura fisicamente invalida.",
          reference: SENTEK_READING_REFERENCE,
        };
      }
      return {
        quality: "unverified",
        reason:
          "VIC valido como indice de tendencia; no equivale a EC sin calibracion de suelo y comparacion a igual humedad.",
        reference: SENTEK_READING_REFERENCE,
      };
    default:
      return {
        quality: "valid",
        reason: "Valor derivado desde una entrada previamente validada.",
        reference: MILESIGHT_READING_REFERENCE,
      };
  }
}

function bounded(
  value: number,
  min: number,
  max: number,
  invalidReason: string,
  reference: string,
): IReadingQualityResult {
  return value >= min && value <= max
    ? {
        quality: "valid",
        reason: `Lectura dentro del rango ${min} a ${max}.`,
        reference,
      }
    : { quality: "invalid", reason: invalidReason, reference };
}
