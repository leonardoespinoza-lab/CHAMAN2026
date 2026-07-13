import { IReporteNDVI } from 'modelos/src';

export type SatelliteIndexKey = keyof NonNullable<IReporteNDVI['indices']>;

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
  invalidReason?: 'missing' | 'out_of_range';
}

export function satelliteIndexValue(report: IReporteNDVI, key: SatelliteIndexKey): number | null {
  const raw = report.indices?.[key] ?? (key === 'ndvi' ? report.ndviPromedio : undefined);
  const value = Number(raw);

  if (raw == null || !Number.isFinite(value)) {
    return null;
  }

  return value >= -1 && value <= 1 ? value : null;
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

      const raw = report.indices?.[key] ?? (key === 'ndvi' ? report.ndviPromedio : undefined);
      const value = satelliteIndexValue(report, key);
      return {
        report,
        reportId: report._id,
        timestamp,
        value,
        stage: stageAtDate(new Date(timestamp)),
        collection: report.coleccion || 'Satélite',
        qualityCoveragePct: qualityCoverage(report),
        invalidReason: value == null ? (raw == null ? 'missing' : 'out_of_range') : undefined,
      };
    })
    .filter((point): point is SatelliteIndexHistoryPoint => !!point)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function qualityCoverage(report: IReporteNDVI): number | undefined {
  const value = Number(report.metadataImagen?.qualityMask?.validCoveragePct);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, value));
}
