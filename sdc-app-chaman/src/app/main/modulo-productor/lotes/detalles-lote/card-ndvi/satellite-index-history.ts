import { IReporteNDVI } from 'modelos/src';

export type SatelliteIndexKey = keyof NonNullable<IReporteNDVI['indices']>;
export const MIN_SATELLITE_VALID_COVERAGE_PCT = 3;

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

export function buildSatelliteIndexHistory(
  reports: IReporteNDVI[],
  key: SatelliteIndexKey,
  stageAtDate: (date: Date) => SatelliteStageAtDate
): SatelliteIndexHistoryPoint[] {
  return reports
    .map((report): SatelliteIndexHistoryPoint | undefined => {
      const timestamp = new Date(report.fechaDeLaImagen || report.fechaCreacion || '').getTime();
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
