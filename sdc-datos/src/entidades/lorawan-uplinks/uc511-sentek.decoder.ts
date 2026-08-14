import {
  IConfiguracionEntradaAnalogica,
  IConfiguracionPerfilSuelo,
  IValoresV2,
  SensoresV2,
} from 'modelos/src';

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

interface ParsedUc50xPayload {
  analog: DecodedUc511SentekPayload['analog'] | null;
  sdi12Blocks: Sdi12Block[];
}

interface ResolvedSdi12Channel {
  metric: SoilMetric;
  depthIndexes: number[];
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

export const DEFAULT_SENTEK_DEPTHS_CM = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
] as const;

/**
 * La profundidad es una propiedad de instalacion/configuracion de la sonda,
 * no del byte de canal Milesight. Sentek permite configurar esos rótulos.
 */
export function resolveSentekDepths(
  config?: Pick<IConfiguracionPerfilSuelo, 'profundidadesCm' | 'niveles'>,
): number[] {
  const configured = config?.profundidadesCm;
  if (
    config?.niveles === 12 &&
    Array.isArray(configured) &&
    configured.length === 12 &&
    configured.every(
      (depth, index) =>
        Number.isFinite(depth) &&
        depth > 0 &&
        (index === 0 || depth > configured[index - 1]),
    )
  ) {
    return [...configured];
  }
  return [...DEFAULT_SENTEK_DEPTHS_CM];
}

export function decodeUc511SentekPayload(
  hexPayload?: string,
  profileConfig?: Pick<IConfiguracionPerfilSuelo, 'mapeoCanalesSdi12'>,
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
  const parsed = parseUc50xPayload(bytes);
  if (parsed.analog) {
    decoded.analog = parsed.analog;
  }

  decoded.raw.blocks = parsed.sdi12Blocks;
  decoded.raw.blocks.forEach((block) => {
    assignSdi12Block(decoded, block.channel, block.values, profileConfig);
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
  profileConfig?: Pick<
    IConfiguracionPerfilSuelo,
    'profundidadesCm' | 'niveles'
  >,
): IValoresV2['valores'] {
  const valores: IValoresV2['valores'] = {};
  const depthsCm = resolveSentekDepths(profileConfig);

  if (decoded.raw.blocks.length) {
    valores['Humedad Suelo Profundidad'] = DEPTH_KEYS.map((depth, index) => ({
      profundidad: depthsCm[index],
      unidad: '%',
      valores: {
        actual: decoded.soil.moisture[depth] ?? null,
      },
    }));

    valores['Salinidad Suelo'] = DEPTH_KEYS.map((depth, index) => ({
      profundidad: depthsCm[index],
      // VIC es un indice de tendencia ionica; no equivale automaticamente a EC.
      unidad: 'VIC',
      valores: {
        actual: decoded.soil.salinity[depth] ?? null,
      },
    }));

    valores['Temperatura Suelo'] = DEPTH_KEYS.map((depth, index) => ({
      profundidad: depthsCm[index],
      unidad: 'C',
      valores: {
        actual: decoded.soil.temperature[depth] ?? null,
      },
    }));
  }

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

function decodeAnalogBlock(
  bytes: number[],
  offset: number,
): DecodedUc511SentekPayload['analog'] | null {
  const channelByte = bytes[offset];
  const type = bytes[offset + 1];
  const regularChannel = channelByte === 0x05 || channelByte === 0x06;
  const alarmChannel = channelByte === 0x85 || channelByte === 0x86;
  if ((!regularChannel && !alarmChannel) || (type !== 0xe2 && type !== 0x02)) {
    return null;
  }

  const decode =
    type === 0xe2
      ? (valueOffset: number) =>
          float16ToNumberLE(bytes[valueOffset], bytes[valueOffset + 1])
      : (valueOffset: number) =>
          int16LE(bytes[valueOffset], bytes[valueOffset + 1]) / 1000;
  const readings = [
    decode(offset + 2),
    decode(offset + 4),
    decode(offset + 6),
    decode(offset + 8),
  ];
  if (!readings.every(Number.isFinite)) return null;

  return {
    channel: channelByte === 0x05 || channelByte === 0x85 ? 1 : 2,
    rawMa: round(readings[0], 3),
    minMa: round(readings[1], 3),
    maxMa: round(readings[2], 3),
    averageMa: round(readings[3], 3),
  };
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

/**
 * Recorre el envelope TLV del UC50x desde limites demostrables. Nunca busca
 * `05 e2` o `05 02` dentro de bytes arbitrarios: esa busqueda confundia las
 * respuestas de configuracion `fe 05 ...` con una entrada analogica.
 */
function parseUc50xPayload(bytes: number[]): ParsedUc50xPayload {
  const parsed: ParsedUc50xPayload = { analog: null, sdi12Blocks: [] };
  let offset = 0;

  while (offset + 1 < bytes.length) {
    const channel = bytes[offset];
    const type = bytes[offset + 1];

    if (channel === 0x08 && type === 0xdb) {
      const sdi12 = parseSdi12BlockAt(bytes, offset);
      if (!sdi12) break;
      parsed.sdi12Blocks.push(sdi12.block);
      offset = sdi12.nextOffset;
      continue;
    }

    if (
      (channel === 0x05 ||
        channel === 0x06 ||
        channel === 0x85 ||
        channel === 0x86) &&
      (type === 0xe2 || type === 0x02)
    ) {
      const blockLength = channel >= 0x80 ? 11 : 10;
      if (offset + blockLength > bytes.length) break;
      parsed.analog ||= decodeAnalogBlock(bytes, offset);
      offset += blockLength;
      continue;
    }

    const blockLength = knownUc50xBlockLength(channel, type);
    if (!blockLength || offset + blockLength > bytes.length) {
      // Payload de configuracion, firmware futuro o bloque truncado. Se
      // conserva crudo, pero no se adivinan limites ni magnitudes.
      break;
    }
    offset += blockLength;
  }

  return parsed;
}

function knownUc50xBlockLength(channel: number, type: number): number | null {
  if (channel === 0x01 && type === 0x75) return 3;
  if (
    (channel === 0x03 || channel === 0x04) &&
    (type === 0x00 || type === 0x01)
  ) {
    return 3;
  }
  if ((channel === 0x03 || channel === 0x04) && type === 0xc8) return 6;
  return null;
}

function parseSdi12BlockAt(
  bytes: number[],
  offset: number,
): { block: Sdi12Block; nextOffset: number } | null {
  if (offset + 3 > bytes.length) return null;

  const dataStart = offset + 3;
  const officialEnd = Math.min(offset + 39, bytes.length);
  let textEnd = officialEnd;
  let crlfEnd: number | null = null;
  for (let cursor = dataStart; cursor + 1 < officialEnd; cursor += 1) {
    if (bytes[cursor] === 0x0d && bytes[cursor + 1] === 0x0a) {
      textEnd = cursor;
      crlfEnd = cursor + 2;
      break;
    }
  }

  const asciiBytes = bytes
    .slice(dataStart, textEnd)
    .filter((byte) => byte !== 0x00);
  const ascii = String.fromCharCode(...asciiBytes).trim();
  const values = (ascii.match(/[+-]\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter(Number.isFinite);

  let nextOffset = officialEnd;
  if (
    crlfEnd !== null &&
    crlfEnd + 1 < bytes.length &&
    bytes[crlfEnd] === 0x08 &&
    bytes[crlfEnd + 1] === 0xdb
  ) {
    // Fixture compacto o broker que quito el padding de cero.
    nextOffset = crlfEnd;
  }

  return {
    block: { channel: bytes[offset + 2], ascii, values },
    nextOffset,
  };
}

function assignSdi12Block(
  result: DecodedUc511SentekPayload,
  channel: number,
  values: number[],
  profileConfig?: Pick<IConfiguracionPerfilSuelo, 'mapeoCanalesSdi12'>,
): void {
  const mapping = resolveSdi12Channel(channel, profileConfig);
  if (!mapping) {
    return;
  }

  const target = result.soil[mapping.metric];

  values.slice(0, mapping.depthIndexes.length).forEach((value, index) => {
    const depth = DEPTH_KEYS[mapping.depthIndexes[index]];
    if (depth) {
      target[depth] = value;
    }
  });
}

function resolveSdi12Channel(
  channel: number,
  profileConfig?: Pick<IConfiguracionPerfilSuelo, 'mapeoCanalesSdi12'>,
): ResolvedSdi12Channel | null {
  const configured = profileConfig?.mapeoCanalesSdi12;
  if (Array.isArray(configured) && configured.length > 0) {
    const entry = configured.find(
      (candidate) => candidate.canalMilesight === channel + 1,
    );
    if (!entry) return null;

    const metricByVariable: Record<(typeof entry)['variable'], SoilMetric> = {
      humedad_vwc: 'moisture',
      salinidad_vic: 'salinity',
      temperatura: 'temperature',
    };
    const depthIndexes = entry.posicionesPerfil.map((position) => position - 1);
    if (
      !metricByVariable[entry.variable] ||
      depthIndexes.length === 0 ||
      new Set(depthIndexes).size !== depthIndexes.length ||
      depthIndexes.some(
        (depthIndex) =>
          !Number.isInteger(depthIndex) ||
          depthIndex < 0 ||
          depthIndex >= DEPTH_KEYS.length,
      )
    ) {
      return null;
    }

    return {
      metric: metricByVariable[entry.variable],
      depthIndexes,
    };
  }

  if (channel >= 0x00 && channel <= 0x03) {
    return {
      metric: 'moisture',
      depthIndexes: threeDepthIndexes(channel),
    };
  }
  if (channel >= 0x04 && channel <= 0x07) {
    return {
      metric: 'salinity',
      depthIndexes: threeDepthIndexes(channel - 0x04),
    };
  }
  if (channel >= 0x08 && channel <= 0x0b) {
    return {
      metric: 'temperature',
      depthIndexes: threeDepthIndexes(channel - 0x08),
    };
  }
  return null;
}

function threeDepthIndexes(group: number): number[] {
  const first = group * 3;
  return [first, first + 1, first + 2];
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
