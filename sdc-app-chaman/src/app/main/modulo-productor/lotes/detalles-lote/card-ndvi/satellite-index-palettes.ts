export type SatelliteIndexKey = 'ndvi' | 'ndmi' | 'ndwi' | 'ndre' | 'savi' | 'evi';

type Rgb = [number, number, number];

export interface SatelliteLegendItem {
  label: string;
  color: string;
}

interface SatellitePaletteStop {
  at: number;
  rgb: Rgb;
}

interface SatellitePaletteConfig {
  opacity: number;
  stops: SatellitePaletteStop[];
  legend: SatelliteLegendItem[];
}

const VEGETATION_PALETTE: SatellitePaletteConfig = {
  opacity: 0.82,
  stops: [
    { at: -0.2, rgb: [124, 80, 52] },
    { at: 0, rgb: [226, 214, 154] },
    { at: 0.03, rgb: [224, 233, 126] },
    { at: 0.06, rgb: [203, 235, 105] },
    { at: 0.1, rgb: [168, 226, 87] },
    { at: 0.14, rgb: [130, 213, 76] },
    { at: 0.2, rgb: [91, 194, 69] },
    { at: 0.32, rgb: [50, 163, 61] },
    { at: 0.5, rgb: [21, 122, 51] },
    { at: 0.72, rgb: [0, 83, 39] },
  ],
  legend: [
    { label: 'Bajo', color: 'rgba(168, 226, 87, 0.82)' },
    { label: 'Medio', color: 'rgba(91, 194, 69, 0.82)' },
    { label: 'Alto', color: 'rgba(21, 122, 51, 0.82)' },
  ],
};

const CANOPY_MOISTURE_PALETTE: SatellitePaletteConfig = {
  opacity: 0.76,
  stops: [
    { at: -0.45, rgb: [117, 65, 35] },
    { at: -0.25, rgb: [176, 105, 55] },
    { at: -0.1, rgb: [225, 183, 105] },
    { at: 0.02, rgb: [205, 229, 216] },
    { at: 0.15, rgb: [111, 198, 190] },
    { at: 0.32, rgb: [44, 142, 178] },
    { at: 0.5, rgb: [31, 91, 169] },
  ],
  legend: [
    { label: 'Seco', color: 'rgba(176, 105, 55, 0.76)' },
    { label: 'Transicion', color: 'rgba(205, 229, 216, 0.76)' },
    { label: 'Humedo', color: 'rgba(44, 142, 178, 0.76)' },
  ],
};

const SURFACE_WATER_PALETTE: SatellitePaletteConfig = {
  opacity: 0.76,
  stops: [
    { at: -0.45, rgb: [120, 84, 55] },
    { at: -0.2, rgb: [170, 132, 84] },
    { at: -0.05, rgb: [216, 205, 165] },
    { at: 0.04, rgb: [207, 235, 231] },
    { at: 0.18, rgb: [91, 181, 214] },
    { at: 0.35, rgb: [28, 105, 191] },
  ],
  legend: [
    { label: 'Suelo/vegetacion', color: 'rgba(170, 132, 84, 0.76)' },
    { label: 'Humedad', color: 'rgba(91, 181, 214, 0.76)' },
    { label: 'Agua', color: 'rgba(28, 105, 191, 0.76)' },
  ],
};

const RED_EDGE_PALETTE: SatellitePaletteConfig = {
  opacity: 0.74,
  stops: [
    { at: -0.05, rgb: [134, 50, 42] },
    { at: 0.03, rgb: [207, 95, 53] },
    { at: 0.1, rgb: [239, 195, 72] },
    { at: 0.18, rgb: [161, 206, 86] },
    { at: 0.3, rgb: [70, 168, 80] },
    { at: 0.5, rgb: [21, 110, 55] },
  ],
  legend: [
    { label: 'Baja clorofila', color: 'rgba(207, 95, 53, 0.74)' },
    { label: 'Media', color: 'rgba(239, 195, 72, 0.74)' },
    { label: 'Alta', color: 'rgba(70, 168, 80, 0.74)' },
  ],
};

const SATELLITE_INDEX_PALETTES: Record<SatelliteIndexKey, SatellitePaletteConfig> = {
  ndvi: VEGETATION_PALETTE,
  savi: VEGETATION_PALETTE,
  evi: VEGETATION_PALETTE,
  ndmi: CANOPY_MOISTURE_PALETTE,
  ndwi: SURFACE_WATER_PALETTE,
  ndre: RED_EDGE_PALETTE,
};

export function colorForSatelliteIndex(key: string, value?: number | null): string {
  const palette = paletteFor(key);
  if (value == null || Number.isNaN(value)) {
    return 'rgba(255, 255, 255, 0.32)';
  }
  return interpolateColor(value, palette.stops, palette.opacity);
}

export function legendForSatelliteIndex(key: string): SatelliteLegendItem[] {
  return [...paletteFor(key).legend];
}

function paletteFor(key: string): SatellitePaletteConfig {
  return SATELLITE_INDEX_PALETTES[key as SatelliteIndexKey] || VEGETATION_PALETTE;
}

function interpolateColor(value: number, stops: SatellitePaletteStop[], opacity: number): string {
  const sortedStops = [...stops].sort((a, b) => a.at - b.at);
  if (value <= sortedStops[0].at) {
    return toRgba(sortedStops[0].rgb, opacity);
  }

  for (let i = 1; i < sortedStops.length; i++) {
    const previous = sortedStops[i - 1];
    const current = sortedStops[i];
    if (value <= current.at) {
      const range = current.at - previous.at || 1;
      const t = Math.max(0, Math.min(1, (value - previous.at) / range));
      return toRgba(
        [
          Math.round(previous.rgb[0] + (current.rgb[0] - previous.rgb[0]) * t),
          Math.round(previous.rgb[1] + (current.rgb[1] - previous.rgb[1]) * t),
          Math.round(previous.rgb[2] + (current.rgb[2] - previous.rgb[2]) * t),
        ],
        opacity,
      );
    }
  }

  return toRgba(sortedStops[sortedStops.length - 1].rgb, opacity);
}

function toRgba(rgb: Rgb, opacity: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}
