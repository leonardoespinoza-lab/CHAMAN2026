export const SOILGRIDS_DEPTHS = [
  { fromCm: 0, toCm: 5, code: '0-5cm' },
  { fromCm: 5, toCm: 15, code: '5-15cm' },
  { fromCm: 15, toCm: 30, code: '15-30cm' },
  { fromCm: 30, toCm: 60, code: '30-60cm' },
  { fromCm: 60, toCm: 100, code: '60-100cm' },
  { fromCm: 100, toCm: 200, code: '100-200cm' },
] as const;

export type SoilGridsPropertyCode =
  | 'sand'
  | 'silt'
  | 'clay'
  | 'bdod'
  | 'cfvo'
  | 'phh2o'
  | 'soc'
  | 'nitrogen'
  | 'cec'
  | 'wv0033'
  | 'wv1500';

export const SOILGRIDS_PROPERTIES: Record<
  SoilGridsPropertyCode,
  { conversionFactor: number; unit: string; label: string }
> = {
  sand: { conversionFactor: 10, unit: '%', label: 'Arena' },
  silt: { conversionFactor: 10, unit: '%', label: 'Limo' },
  clay: { conversionFactor: 10, unit: '%', label: 'Arcilla' },
  bdod: { conversionFactor: 100, unit: 'kg/dm³', label: 'Densidad aparente' },
  cfvo: { conversionFactor: 10, unit: 'vol%', label: 'Fragmentos gruesos' },
  phh2o: { conversionFactor: 10, unit: 'pH', label: 'pH en agua' },
  soc: { conversionFactor: 10, unit: 'g/kg', label: 'Carbono orgánico' },
  nitrogen: { conversionFactor: 100, unit: 'g/kg', label: 'Nitrógeno total' },
  cec: { conversionFactor: 10, unit: 'cmol(c)/kg', label: 'CIC a pH 7' },
  wv0033: { conversionFactor: 10, unit: '% v/v', label: 'Agua a 33 kPa' },
  wv1500: { conversionFactor: 10, unit: '% v/v', label: 'Agua a 1500 kPa' },
};

export const SOILGRIDS_SOURCE_VERSION = 'SoilGrids250m-2.0-latest';
export const SOILGRIDS_RESOLUTION_METERS = 250;
export const SOILGRIDS_LICENSE = 'CC BY 4.0';
export const SOILGRIDS_ATTRIBUTION =
  'SoilGrids™ · ISRIC — World Soil Information';
export const SOILGRIDS_METADATA_URL =
  'https://docs.isric.org/globaldata/soilgrids/';
