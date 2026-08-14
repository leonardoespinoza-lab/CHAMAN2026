import { IValoresV2, SensoresV2 } from 'modelos/src';

type SentekMetric = 'humedad' | 'salinidad' | 'temperatura';

interface SentekChannel {
  metric: SentekMetric;
  firstDepthIndex: number;
}

export interface SentekUc501Decoded {
  valores: IValoresV2['valores'];
  canales: number[];
}

const DEPTHS_CM = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

const CHANNEL_MAP: Record<number, SentekChannel> = {
  0: { metric: 'humedad', firstDepthIndex: 0 },
  1: { metric: 'humedad', firstDepthIndex: 3 },
  2: { metric: 'humedad', firstDepthIndex: 6 },
  3: { metric: 'humedad', firstDepthIndex: 9 },
  4: { metric: 'salinidad', firstDepthIndex: 0 },
  5: { metric: 'salinidad', firstDepthIndex: 3 },
  6: { metric: 'salinidad', firstDepthIndex: 6 },
  7: { metric: 'salinidad', firstDepthIndex: 9 },
  8: { metric: 'temperatura', firstDepthIndex: 0 },
  9: { metric: 'temperatura', firstDepthIndex: 3 },
  10: { metric: 'temperatura', firstDepthIndex: 6 },
  11: { metric: 'temperatura', firstDepthIndex: 9 },
};

const SENSOR_BY_METRIC: Record<SentekMetric, SensoresV2> = {
  humedad: 'Humedad Suelo Profundidad',
  salinidad: 'Salinidad Suelo',
  temperatura: 'Temperatura Suelo',
};

const UNIT_BY_METRIC: Record<SentekMetric, string> = {
  humedad: '%',
  salinidad: 'VIC',
  temperatura: 'C',
};

function emptyValues(): IValoresV2['valores'] {
  return {
    'Humedad Suelo Profundidad': DEPTHS_CM.map((profundidad) => ({
      profundidad,
      unidad: UNIT_BY_METRIC.humedad,
      valores: { actual: null as any },
    })),
    'Salinidad Suelo': DEPTHS_CM.map((profundidad) => ({
      profundidad,
      unidad: UNIT_BY_METRIC.salinidad,
      valores: { actual: null as any },
    })),
    'Temperatura Suelo': DEPTHS_CM.map((profundidad) => ({
      profundidad,
      unidad: UNIT_BY_METRIC.temperatura,
      valores: { actual: null as any },
    })),
  };
}

function cleanNumber(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return value <= -999 ? null : value;
}

function parseBlockText(text: string): Array<number | null> {
  const normalized = text.replace(/\0/g, '').trim();
  if (!/^[0-9]?[+-]\d/.test(normalized)) {
    return [];
  }

  const matches = normalized.match(/[+-]\d+(?:\.\d+)?/g) || [];
  if (!matches.length || matches.length > 4) {
    return [];
  }

  return matches.map((value) => cleanNumber(Number(value)));
}

export function decodeSentekUc501Payload(
  data?: string,
): SentekUc501Decoded | null {
  if (!data) {
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    return null;
  }

  if (!buffer.length) {
    return null;
  }

  const valores = emptyValues();
  const canales: number[] = [];
  let parsedValues = 0;

  for (let i = 0; i < buffer.length - 3; i += 1) {
    if (buffer[i] !== 0x08 || buffer[i + 1] !== 0xdb) {
      continue;
    }

    const channelIndex = buffer[i + 2];
    const channel = CHANNEL_MAP[channelIndex];
    if (!channel) {
      continue;
    }

    let end = i + 3;
    while (
      end < buffer.length &&
      buffer[end] !== 0x0d &&
      buffer[end] !== 0x0a
    ) {
      end += 1;
    }

    const text = buffer
      .subarray(i + 3, end)
      .toString('ascii')
      .trim();
    const readings = parseBlockText(text);
    if (!readings.length) {
      continue;
    }

    const sensor = SENSOR_BY_METRIC[channel.metric];
    const sensorValues = valores[sensor];

    if (!sensorValues) {
      continue;
    }

    readings.slice(0, 3).forEach((reading, offset) => {
      const depthIndex = channel.firstDepthIndex + offset;
      const target = sensorValues[depthIndex];
      if (!target) {
        return;
      }

      target.valores = { actual: reading as any };
      if (reading !== null) {
        parsedValues += 1;
      }
    });

    canales.push(channelIndex);
  }

  return parsedValues > 0 ? { valores, canales } : null;
}
