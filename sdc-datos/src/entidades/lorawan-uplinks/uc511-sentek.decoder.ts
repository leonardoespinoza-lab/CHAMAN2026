import {
  IConfiguracionEntradaAnalogica,
  IValoresV2,
  SensoresV2,
} from 'modelos/src';

type DepthKey =
  | '5cm'
  | '15cm'
  | '25cm'
  | '35cm'
  | '45cm'
  | '55cm'
  | '65cm'
  | '75cm'
  | '85cm'
  | '95cm'
  | '105cm'
  | '115cm';

type SoilMetric = 'moisture' | 'salinity' | 'temperature';

interface Sdi12Block {
  channel: number;
  ascii: string;
  values: number[];
}

export interface DecodedUc511SentekPayload {
  analog: {
    channel: 1 | 2 | null;
    rawMa: number | null;
    minMa: number | null;
    maxMa: number | null;
    averageMa: number | null;
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
  '5cm',
  '15cm',
  '25cm',
  '35cm',
  '45cm',
  '55cm',
  '65cm',
  '75cm',
  '85cm',
  '95cm',
  '105cm',
  '115cm',
];

const DEPTHS_CM = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115];

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
  const analog = decodeAnalogInput(bytes);
  if (analog) {
    decoded.analog = analog;
  }

  decoded.raw.blocks = extractSdi12Blocks(bytes);
  decoded.raw.blocks.forEach((block) => {
    assignSdi12Block(decoded, block.channel, block.values);
  });

  return hasDecodedData(decoded) ? decoded : null;
}

export function extractUc511PayloadHex(uplink?: {
  data?: string;
  rawPayload?: Record<string, any>;
}): string | undefined {
  if (!uplink) return undefined;
  const raw = uplink.rawPayload || {};
  const candidates = [
    raw.FRMPayload,
    raw.frmPayload,
    raw.frmpayload,
    raw.payloadHex,
    raw.hexPayload,
    raw.dataHex,
    raw.decoded?.FRMPayload,
    raw.decoded?.frmPayload,
    raw.MACPayload?.FRMPayload,
    raw.macPayload?.frmPayload,
    raw.macPayload?.FRMPayload,
    raw.uplink?.FRMPayload,
    raw.uplink?.frmPayload,
  ];
  const explicit = candidates.find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  if (explicit) return normalizePayloadHex(explicit);
  if (isHexPayload(uplink.data)) return normalizePayloadHex(uplink.data!);
  if (!uplink.data) return undefined;
  try {
    return Buffer.from(uplink.data, 'base64').toString('hex') || undefined;
  } catch {
    return undefined;
  }
}

function normalizePayloadHex(value: string): string | undefined {
  const cleaned = value.replace(/0x/gi, '').replace(/[^a-fA-F0-9]/g, '');
  return cleaned.length >= 2 && cleaned.length % 2 === 0
    ? cleaned.toLowerCase()
    : undefined;
}

function isHexPayload(value?: string): boolean {
  if (!value) return false;
  const cleaned = value.replace(/0x/gi, '').replace(/\s/g, '');
  return (
    cleaned.length >= 2 &&
    cleaned.length % 2 === 0 &&
    /^[a-fA-F0-9]+$/.test(cleaned)
  );
}

export function decodedUc511ToReporteValores(
  decoded: DecodedUc511SentekPayload,
  analogConfig?: IConfiguracionEntradaAnalogica,
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
    // VIC es un indice de tendencia ionica; no equivale automaticamente a EC.
    unidad: 'VIC',
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

  if (decoded.analog.rawMa !== null) {
    valores['Entrada Analógica'] = [
      {
        unidad: 'mA',
        valores: {
          actual: decoded.analog.rawMa,
          min: decoded.analog.minMa ?? undefined,
          max: decoded.analog.maxMa ?? undefined,
          promedio: decoded.analog.averageMa ?? undefined,
        },
      },
    ];

    const calibrated = calibrateAnalogInput(decoded.analog.rawMa, analogConfig);
    if (calibrated) {
      const sensor: SensoresV2 =
        analogConfig?.variable === 'nivel_napa' ? 'Napa' : 'Presión';
      valores[sensor] = [
        {
          unidad: calibrated.unit,
          valores: {
            actual: calibrated.value,
            columnaAgua: calibrated.waterColumn,
            profundidadInstalacion: calibrated.installationDepth,
          },
        },
      ];
    }
  }

  return valores;
}

function emptyDecoded(): DecodedUc511SentekPayload {
  return {
    analog: {
      channel: null,
      rawMa: null,
      minMa: null,
      maxMa: null,
      averageMa: null,
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

function decodeAnalogInput(
  bytes: number[],
): DecodedUc511SentekPayload['analog'] | null {
  for (let i = 0; i <= bytes.length - 10; i += 1) {
    const channel = bytes[i];
    const type = bytes[i + 1];
    if (
      (channel !== 0x05 && channel !== 0x06) ||
      (type !== 0xe2 && type !== 0x02)
    ) {
      continue;
    }

    const decode =
      type === 0xe2
        ? (offset: number) =>
            float16ToNumberLE(bytes[offset], bytes[offset + 1])
        : (offset: number) => int16LE(bytes[offset], bytes[offset + 1]) / 1000;
    const readings = [
      decode(i + 2),
      decode(i + 4),
      decode(i + 6),
      decode(i + 8),
    ];
    if (!readings.every(Number.isFinite)) {
      continue;
    }

    return {
      channel: channel === 0x05 ? 1 : 2,
      rawMa: round(readings[0], 3),
      minMa: round(readings[1], 3),
      maxMa: round(readings[2], 3),
      averageMa: round(readings[3], 3),
    };
  }

  return null;
}

export function calibrateAnalogInput(
  currentMa: number,
  config?: IConfiguracionEntradaAnalogica,
): {
  value: number;
  unit: string;
  waterColumn?: number;
  installationDepth?: number;
  reference?: 'nivel_terreno';
  conversionModel?: 'lineal-4-20ma-v1';
} | null {
  if (
    !config ||
    config.variable === 'sin_definir' ||
    !Number.isFinite(currentMa) ||
    !Number.isFinite(config.entradaMinMa) ||
    !Number.isFinite(config.entradaMaxMa) ||
    !Number.isFinite(config.salidaMin) ||
    !Number.isFinite(config.salidaMax) ||
    config.entradaMaxMa <= config.entradaMinMa ||
    currentMa < config.entradaMinMa ||
    currentMa > config.entradaMaxMa ||
    !config.unidadSalida?.trim()
  ) {
    return null;
  }

  const ratio =
    (currentMa - config.entradaMinMa) /
    (config.entradaMaxMa - config.entradaMinMa);
  const calibratedValue =
    Number(config.salidaMin) +
    ratio * (Number(config.salidaMax) - Number(config.salidaMin));

  if (config.variable === 'nivel_napa') {
    const installationDepth = Number(config.profundidadInstalacionM);
    if (
      !Number.isFinite(installationDepth) ||
      installationDepth <= 0 ||
      calibratedValue < 0 ||
      calibratedValue > installationDepth
    ) {
      return null;
    }

    return {
      value: round(installationDepth - calibratedValue, 3),
      unit: 'm',
      waterColumn: round(calibratedValue, 3),
      installationDepth: round(installationDepth, 3),
      reference: 'nivel_terreno',
      conversionModel: 'lineal-4-20ma-v1',
    };
  }

  return {
    value: round(calibratedValue, 3),
    unit: config.unidadSalida.trim(),
  };
}

function int16LE(byte0: number, byte1: number): number {
  const value = byte0 | (byte1 << 8);
  return value & 0x8000 ? value - 0x10000 : value;
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
