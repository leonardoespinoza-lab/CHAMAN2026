import {
  IReporteNDVI,
  SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT,
} from 'modelos/src';

export type SatelliteIndexKey = keyof NonNullable<IReporteNDVI['indices']>;
export const SATELLITE_INDEX_KEYS: SatelliteIndexKey[] = [
  'ndvi',
  'ndmi',
  'ndwi',
  'ndre',
  'savi',
  'evi',
];
export const MIN_SATELLITE_VALID_COVERAGE_PCT =
  SATELLITE_OPERATIONAL_MIN_VALID_COVERAGE_PCT;

/** Conserva el dia calendario de una escena aunque el navegador use UTC-3. */
export function parseSatelliteCalendarDate(value?: string | Date | null): Date {
  if (value instanceof Date) return new Date(value.getTime());
  const raw = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }
  return new Date(raw);
}

export interface SatelliteStageAtDate {
  name: string;
  source: string;
  confirmed: boolean;
}

export interface SatelliteIndexHistoryPoint {
  report: IReporteNDVI;
  reportId?: string;
  timestamp: number;
  value: number | null;
  stage: SatelliteStageAtDate;
  collection: string;
  qualityCoveragePct?: number;
  invalidReason?: 'missing' | 'out_of_range' | 'quality';
}

export function satelliteIndexValue(report: IReporteNDVI, key: SatelliteIndexKey): number | null {
  const raw = rawSatelliteIndexValue(report, key);
  const value = Number(raw);

  if (raw == null || !Number.isFinite(value)) {
    return null;
  }

  if (value < -1 || value > 1 || !satelliteIndexHasSufficientQuality(report, key)) {
    return null;
  }

  return value;
}

/** Solo expone al cliente capas con valor validado e imagen raster lista. */
export function operationalSatelliteIndexKeys(report: IReporteNDVI): SatelliteIndexKey[] {
  return SATELLITE_INDEX_KEYS.filter(
    (key) => satelliteIndexValue(report, key) != null && !!report.imagenes?.[key],
  );
}

/** Los reportes rechazados por QA siguen archivados, pero no aparecen en la tarjeta. */
export function satelliteReportIsOperational(report: IReporteNDVI): boolean {
  return operationalSatelliteIndexKeys(report).length > 0;
}

export function buildSatelliteIndexHistory(
  reports: IReporteNDVI[],
  key: SatelliteIndexKey,
  stageAtDate: (date: Date) => SatelliteStageAtDate
): SatelliteIndexHistoryPoint[] {
  return reports
    .map((report): SatelliteIndexHistoryPoint | undefined => {
      const timestamp = parseSatelliteCalendarDate(
        report.fechaDeLaImagen || report.fechaCreacion,
      ).getTime();
      if (!Number.isFinite(timestamp)) {
        return undefined;
      }

      const raw = rawSatelliteIndexValue(report, key);
      const numericRaw = Number(raw);
      const value = satelliteIndexValue(report, key);
      return {
        report,
        reportId: report._id,
        timestamp,
        value,
        stage: stageAtDate(new Date(timestamp)),
        collection: report.coleccion || 'Satélite',
        qualityCoveragePct: qualityCoverage(report, key),
        invalidReason:
          value != null
            ? undefined
            : raw == null
              ? 'missing'
              : !Number.isFinite(numericRaw) || numericRaw < -1 || numericRaw > 1
                ? 'out_of_range'
                : 'quality',
      };
    })
    .filter((point): point is SatelliteIndexHistoryPoint => !!point)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function rawSatelliteIndexValue(report: IReporteNDVI, key: SatelliteIndexKey): unknown {
  return report.indices?.[key] ?? (key === 'ndvi' ? report.ndviPromedio : undefined);
}

function satelliteIndexHasSufficientQuality(report: IReporteNDVI, key: SatelliteIndexKey): boolean {
  const metadata = report.metadataImagen;
  const renderStatus = metadata?.renderQa?.[key]?.status;
  const coverage = qualityCoverage(report, key);

  if (coverage == null || coverage < MIN_SATELLITE_VALID_COVERAGE_PCT) {
    return false;
  }
  if (renderStatus != null && renderStatus !== 'ok') {
    return false;
  }
  if (metadata?.renderVersion === 'fixed-index-v3' && renderStatus !== 'ok') {
    return false;
  }
  return true;
}

function qualityCoverage(report: IReporteNDVI, key: SatelliteIndexKey): number | undefined {
  const candidates = [
    report.metadataImagen?.renderQa?.[key]?.validCoveragePct,
    report.metadataImagen?.indicesStats?.[key]?.validCoveragePct,
    report.metadataImagen?.qualityMask?.validCoveragePct,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (candidate != null && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, value));
    }
  }
  return undefined;
}
