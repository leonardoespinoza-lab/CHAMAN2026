import { IValoresV2 } from 'modelos/src';

type DepthKey =
  | '10cm'
  | '20cm'
  | '30cm'
  | '40cm'
  | '50cm'
  | '60cm'
  | '70cm'
  | '80cm'
  | '90cm'
  | '100cm'
  | '110cm'
  | '120cm';

type SoilMetric = 'moisture' | 'salinity' | 'temperature';

interface Sdi12Block {
  channel: number;
  ascii: string;
  values: number[];
}

export interface DecodedUc511SentekPayload {
  analog: {
    rawMa: number | null;
    waterTableDepthM: number | null;
    scale: '4-20mA=0-10m';
  };
  soil: {
    moisture: Partial<Record<DepthKey, number>>;
    salinity: Partial<Record<DepthKey, number>>;
    temperature: Partial<Record<DepthKey, number>>;
  };
  raw: {
    blocks: Sdi12Block[];
  };
}

const DEPTH_KEYS: DepthKey[] = [
  '10cm',
  '20cm',
  '30cm',
  '40cm',
  '50cm',
  '60cm',
  '70cm',
  '80cm',
  '90cm',
  '100cm',
  '110cm',
  '120cm',
];

const DEPTHS_CM = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export function decodeUc511SentekPayload(
  hexPayload?: string,
): DecodedUc511SentekPayload | null {
  if (!hexPayload) {
    return null;
  }

  let bytes: number[];
  try {
    bytes = hexToBytes(hexPayload);
  } catch {
    return null;
  }

  if (!bytes.length) {
    return null;
  }

  const decoded = emptyDecoded();
  const analogMa = decodeAnalogMa(bytes);
  if (analogMa !== null) {
    decoded.analog.rawMa = round(analogMa, 3);
    decoded.analog.waterTableDepthM = round(((analogMa - 4) / 16) * 10, 2);
  }

  decoded.raw.blocks = extractSdi12Blocks(bytes);
  decoded.raw.blocks.forEach((block) => {
    assignSdi12Block(decoded, block.channel, block.values);
  });

  return hasDecodedData(decoded) ? decoded : null;
}

export function decodedUc511ToReporteValores(
  decoded: DecodedUc511SentekPayload,
): IValoresV2['valores'] {
  const valores: IValoresV2['valores'] = {};

  valores['Humedad Suelo Profundidad'] = DEPTH_KEYS.map((depth, index) => ({
    profundidad: DEPTHS_CM[index],
    unidad: '%',
    valores: {
      actual: decoded.soil.moisture[depth] ?? null,
    },
  }));

  valores['Salinidad Suelo'] = DEPTH_KEYS.map((depth, index) => ({
    profundidad: DEPTHS_CM[index],
    unidad: 'mS/m',
    valores: {
      actual: decoded.soil.salinity[depth] ?? null,
    },
  }));

  valores['Temperatura Suelo'] = DEPTH_KEYS.map((depth, index) => ({
    profundidad: DEPTHS_CM[index],
    unidad: 'C',
    valores: {
      actual: decoded.soil.temperature[depth] ?? null,
    },
  }));

  if (decoded.analog.rawMa !== null || decoded.analog.waterTableDepthM !== null) {
    valores.Napa = [
      {
        unidad: 'm',
        valores: {
          actual: decoded.analog.waterTableDepthM,
        },
      },
      {
        unidad: 'mA',
        valores: {
          actual: decoded.analog.rawMa,
        },
      },
    ];
  }

  return valores;
}

function emptyDecoded(): DecodedUc511SentekPayload {
  return {
    analog: {
      rawMa: null,
      waterTableDepthM: null,
      scale: '4-20mA=0-10m',
    },
    soil: {
      moisture: {},
      salinity: {},
      temperature: {},
    },
    raw: {
      blocks: [],
    },
  };
}

function hexToBytes(hex: string): number[] {
  const cleaned = hex
    .replace(/0x/gi, '')
    .replace(/[^a-fA-F0-9]/g, '')
    .toLowerCase();

  if (!cleaned.length) {
    return [];
  }

  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid HEX payload length');
  }

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
}

function decodeAnalogMa(bytes: number[]): number | null {
  for (let i = 0; i <= bytes.length - 10; i += 1) {
    if (
      bytes[i] === 0x03 &&
      bytes[i + 1] === 0x00 &&
      bytes[i + 2] === 0x00 &&
      bytes[i + 3] === 0x04 &&
      bytes[i + 4] === 0x00 &&
      bytes[i + 5] === 0x00
    ) {
      const value = float16ToNumberLE(bytes[i + 8], bytes[i + 9]);
      return Number.isFinite(value) ? value : null;
    }
  }

  return null;
}

function extractSdi12Blocks(bytes: number[]): Sdi12Block[] {
  const blocks: Sdi12Block[] = [];

  for (let i = 0; i < bytes.length - 3; i += 1) {
    if (bytes[i] !== 0x08 || bytes[i + 1] !== 0xdb) {
      continue;
    }

    const channel = bytes[i + 2];
    const start = i + 3;
    let end = start;

    while (end < bytes.length - 1) {
      if (bytes[end] === 0x0d && bytes[end + 1] === 0x0a) break;
      if (bytes[end] === 0x08 && bytes[end + 1] === 0xdb) break;
      end += 1;
    }

    const asciiBytes = bytes.slice(start, end).filter((byte) => byte !== 0x00);
    const ascii = String.fromCharCode(...asciiBytes).trim();
    const values = ascii
      .split('+')
      .slice(1)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    blocks.push({ channel, ascii, values });
    i = end;
  }

  return blocks;
}

function assignSdi12Block(
  result: DecodedUc511SentekPayload,
  channel: number,
  values: number[],
): void {
  const metric = metricForChannel(channel);
  if (!metric) {
    return;
  }

  const target = result.soil[metric];
  const offset =
    metric === 'moisture'
      ? channel * 3
      : metric === 'salinity'
        ? (channel - 0x04) * 3
        : (channel - 0x08) * 3;

  values.slice(0, 3).forEach((value, index) => {
    const depth = DEPTH_KEYS[offset + index];
    if (depth) {
      target[depth] = value;
    }
  });
}

function metricForChannel(channel: number): SoilMetric | null {
  if (channel >= 0x00 && channel <= 0x03) return 'moisture';
  if (channel >= 0x04 && channel <= 0x07) return 'salinity';
  if (channel >= 0x08 && channel <= 0x0b) return 'temperature';
  return null;
}

function float16ToNumberLE(byte0: number, byte1: number): number {
  const half = byte0 | (byte1 << 8);
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const fraction = half & 0x03ff;

  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }

  if (exponent === 0x1f) {
    return fraction ? NaN : sign * Infinity;
  }

  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function hasDecodedData(decoded: DecodedUc511SentekPayload): boolean {
  return (
    decoded.analog.rawMa !== null ||
    decoded.raw.blocks.length > 0 ||
    Object.values(decoded.soil).some((metric) => Object.keys(metric).length > 0)
  );
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
