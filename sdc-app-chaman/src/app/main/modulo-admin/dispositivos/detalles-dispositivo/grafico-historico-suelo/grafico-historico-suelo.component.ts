import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IReporte } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { buildSentekProfile } from '../sentek-profile';

type SoilMetricKey = 'humedad' | 'salinidad' | 'temperatura';

interface SoilMetricDefinition {
  key: SoilMetricKey;
  title: string;
  unit: string;
  color: string;
  decimals: number;
}

interface HistoricalPoint {
  x: number;
  y: number;
  depth: number;
  raw?: number;
  rawUnit?: string;
}

interface NapaPoint {
  x: number;
  y: number;
  unit: string;
}

interface ProfileRow {
  profundidad: number;
  formatted: string;
  raw?: string;
}

@Component({
  selector: 'app-grafico-historico-suelo',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-historico-suelo.component.html',
  styleUrl: './grafico-historico-suelo.component.scss',
})
export class GraficoHistoricoSueloComponent implements OnChanges {
  @Input() reportes: IReporte[] = [];
  @Input() titulo?: string;
  @Input() subtitulo?: string;

  public chartOptions?: any;
  public napaChartOptions?: any;
  public selectedMetric: SoilMetricKey = 'humedad';
  public metricOptions: Array<{ label: string; value: SoilMetricKey }> = [];
  public profileRows: ProfileRow[] = [];
  public resumen = '';
  public napaResumen = '';

  private readonly definitions: SoilMetricDefinition[] = [
    { key: 'humedad', title: 'Humedad de suelo', unit: '%', color: '#2f9fe8', decimals: 1 },
    { key: 'salinidad', title: 'Salinidad', unit: 'mS/m', color: '#8e44ad', decimals: 1 },
    { key: 'temperatura', title: 'Temperatura', unit: 'C', color: '#e74c3c', decimals: 1 },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportes']) {
      this.prepareOptions();
    }
  }

  public onMetricChange(metric: SoilMetricKey): void {
    this.selectedMetric = metric;
    this.prepareOptions();
  }

  public exportarCsv(): void {
    const rows = this.getCsvRows();
    if (!rows.length) return;

    const headers = [
      'Fecha',
      'Profundidad cm',
      'Humedad suelo %',
      'Salinidad mS/m',
      'Temperatura C',
      'Humedad cruda',
      'Unidad cruda humedad',
    ];
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(';'))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-sentek-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private prepareOptions(): void {
    const available = this.definitions.filter((definition) => this.hasMetric(definition.key));
    this.metricOptions = available.map((definition) => ({ label: definition.title, value: definition.key }));

    if (!available.some((definition) => definition.key === this.selectedMetric)) {
      this.selectedMetric = available[0]?.key || 'humedad';
    }

    if (!available.length) {
      this.chartOptions = undefined;
      this.profileRows = [];
      this.resumen = '';
      this.napaChartOptions = this.buildNapaChartOptions();
      return;
    }

    const definition = this.getDefinition(this.selectedMetric);
    const series = this.buildProfileSeries(definition);
    this.profileRows = this.buildProfileRows(definition, series);
    this.resumen = this.buildResumen(definition, series);
    this.chartOptions = this.buildChartOptions(definition, series);
    this.napaChartOptions = this.buildNapaChartOptions();
  }

  private buildProfileSeries(definition: SoilMetricDefinition): any[] {
    const latestByDepth = new Map<number, HistoricalPoint>();

    for (const reporte of [...this.sortedReports()].reverse()) {
      const profile = buildSentekProfile(reporte);
      for (const row of profile) {
        const metric = row[definition.key];
        if (!metric || metric.actual === undefined || metric.actual === null) continue;
        if (latestByDepth.has(row.profundidad)) continue;
        latestByDepth.set(row.profundidad, {
          x: metric.actual,
          y: row.profundidad,
          depth: row.profundidad,
          raw: metric.crudo,
          rawUnit: metric.unidadCruda,
        });
      }
    }

    const data = [...latestByDepth.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, point]) => point);

    return [
      {
        color: definition.color,
        data,
        dataLabels: {
          enabled: true,
          allowOverlap: true,
          align: 'left',
          crop: false,
          overflow: 'allow',
          x: 8,
          formatter: function (this: any) {
            const point = this.point as HistoricalPoint;
            return `${point.depth} cm: ${Number(point.x).toFixed(definition.decimals)} ${definition.unit}`;
          },
          style: {
            color: 'var(--p-text-color)',
            fontSize: '12px',
            fontWeight: '800',
            textOutline: 'none',
          },
        },
        name: definition.title,
        type: 'spline',
        marker: { enabled: true, radius: 4 },
      },
    ];
  }

  private buildChartOptions(definition: SoilMetricDefinition, series: any[]): any {
    const xAxisExtremes = this.buildXAxisExtremes(definition, series);

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 560,
        spacingBottom: 18,
        spacingLeft: 8,
        spacingRight: 18,
        spacingTop: 10,
        type: 'spline',
        zooming: { type: 'xy' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        ...xAxisExtremes,
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 2,
        },
        title: {
          text: `${definition.title} (${definition.unit})`,
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: {
        max: 125,
        min: 0,
        reversed: true,
        tickInterval: 10,
        title: {
          text: 'Profundidad de la sonda (cm)',
          style: { color: definition.color, fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          formatter: function (this: any) {
            return `${this.value} cm`;
          },
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      legend: {
        align: 'center',
        enabled: true,
        itemDistance: 16,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
        layout: 'horizontal',
        verticalAlign: 'bottom',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        formatter: function (this: any) {
          const point = this.point as HistoricalPoint;
          const raw =
            point.raw !== undefined && point.rawUnit
              ? `<br/>Crudo: <strong>${Number(point.raw).toFixed(3)} ${point.rawUnit}</strong>`
              : '';
          return `<span style="color:${this.series.color}">&bull;</span> ${this.series.name}<br/>Profundidad: <strong>${point.depth} cm</strong><br/><strong>${Number(point.x).toFixed(definition.decimals)} ${definition.unit}</strong>${raw}`;
        },
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        spline: {
          animation: { duration: 500 },
          enableMouseTracking: true,
          lineWidth: 2.4,
          marker: {
            lineWidth: 1,
            states: {
              hover: {
                radius: 3.5,
              },
            },
          },
          states: {
            hover: {
              lineWidth: 2.4,
            },
          },
        },
        series: {
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series,
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 430 },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  private buildProfileRows(definition: SoilMetricDefinition, series: any[]): ProfileRow[] {
    const data = ((series?.[0]?.data || []) as HistoricalPoint[]).filter((point) => Number.isFinite(point.x));
    return data.map((point) => ({
      profundidad: point.depth,
      formatted: `${Number(point.x).toFixed(definition.decimals)} ${definition.unit}`,
      raw:
        point.raw !== undefined && point.rawUnit
          ? `${Number(point.raw).toFixed(3)} ${point.rawUnit}`
          : undefined,
    }));
  }

  private buildXAxisExtremes(definition: SoilMetricDefinition, series: any[]): { min?: number; max?: number; tickAmount?: number; startOnTick?: boolean; endOnTick?: boolean } {
    const values = series
      .flatMap((serie) => (serie.data || []).map((point: HistoricalPoint) => Number(point.x)))
      .filter((value) => Number.isFinite(value));

    if (!values.length) return {};

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    const minSpan =
      definition.key === 'humedad'
        ? 8
        : definition.key === 'temperatura'
          ? 4
          : Math.max(20, Math.abs(maxValue) * 0.08);
    const span = Math.max(range, minSpan);
    const center = (minValue + maxValue) / 2;
    const padding = Math.max(span * 0.14, definition.key === 'humedad' ? 1.5 : 0.5);

    let axisMin = center - span / 2 - padding;
    let axisMax = center + span / 2 + padding;

    if (definition.key === 'humedad') {
      axisMin = Math.max(0, axisMin);
      axisMax = Math.min(100, axisMax);
    }

    return {
      endOnTick: false,
      max: this.roundAxisLimit(axisMax, 'ceil'),
      min: this.roundAxisLimit(axisMin, 'floor'),
      startOnTick: false,
      tickAmount: 6,
    };
  }

  private roundAxisLimit(value: number, mode: 'floor' | 'ceil'): number {
    const multiplier = Math.abs(value) >= 100 ? 1 : 10;
    const scaled = value * multiplier;
    return (mode === 'floor' ? Math.floor(scaled) : Math.ceil(scaled)) / multiplier;
  }

  private buildNapaChartOptions(): any | undefined {
    const points = this.buildNapaPoints();

    if (!points.length) {
      this.napaResumen = '';
      return undefined;
    }

    const unit = points.find((point) => !!point.unit)?.unit || 'm';
    const latest = points[points.length - 1];
    this.napaResumen = `${points.length} lecturas - ultima ${Number(latest.y).toFixed(2)} ${unit}`;

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 360,
        spacingBottom: 18,
        spacingLeft: 8,
        spacingRight: 18,
        spacingTop: 10,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 2,
        },
        type: 'datetime',
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: {
        max: 10,
        min: 0,
        title: {
          text: `Altura de napa (${unit})`,
          style: { color: '#0f766e', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '14px' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      legend: {
        enabled: true,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        formatter: function (this: any) {
          const point = this.point as NapaPoint;
          const date = new Date(point.x).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `${date}<br/><strong>${Number(point.y).toFixed(2)} ${point.unit || unit}</strong>`;
        },
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        spline: {
          animation: { duration: 500 },
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          lineWidth: 2,
          marker: {
            enabled: points.length <= 80,
            radius: 2,
          },
          states: {
            hover: {
              lineWidth: 2.6,
            },
          },
        },
        series: {
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series: [
        {
          color: '#14b8a6',
          data: points,
          name: 'Napa',
          type: 'spline',
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private buildNapaPoints(): NapaPoint[] {
    const points: NapaPoint[] = [];

    for (const reporte of this.sortedReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const rawNapa = (reporte?.datos as any)?.valores?.Napa;
      const napaRows = Array.isArray(rawNapa) ? rawNapa : rawNapa ? [rawNapa] : [];

      for (const row of napaRows) {
        const valores = row?.valores || row;
        const rawValue = this.toNumber(
          valores?.actual ??
            valores?.promedio ??
            valores?.altura ??
            valores?.nivel ??
            valores?.value ??
            valores?.valor,
        );
        if (rawValue === undefined) continue;
        const normalized = this.normalizarNapa(rawValue, valores?.unidad || row?.unidad);

        points.push({
          x: timestamp,
          y: normalized,
          unit: 'm',
        });
      }
    }

    return points.sort((a, b) => a.x - b.x);
  }

  private buildResumen(definition: SoilMetricDefinition, series: any[]): string {
    const values = series.flatMap((serie) => serie.data.map((point: HistoricalPoint) => point.x));
    if (!values.length) return 'Sin lecturas historicas para esta variable';
    const average = values.reduce((acc, value) => acc + Number(value), 0) / values.length;
    return `${values.length} profundidades - perfil actual promedio ${average.toFixed(definition.decimals)} ${definition.unit}`;
  }

  private hasMetric(key: SoilMetricKey): boolean {
    return this.sortedReports().some((reporte) =>
      buildSentekProfile(reporte).some((row) => !!row[key])
    );
  }

  private getDefinition(key: SoilMetricKey): SoilMetricDefinition {
    return this.definitions.find((definition) => definition.key === key) || this.definitions[0];
  }

  private sortedReports(): IReporte[] {
    return [...(this.reportes || [])].sort((a, b) => this.getReporteTimestamp(a) - this.getReporteTimestamp(b));
  }

  private getReporteTimestamp(reporte: IReporte): number {
    return new Date(reporte.fecha || reporte.fechaCreacion || '').getTime() || 0;
  }

  private getCsvRows(): unknown[][] {
    const rows: unknown[][] = [];

    for (const reporte of this.sortedReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;
      const fecha = new Date(timestamp).toISOString();
      for (const row of buildSentekProfile(reporte)) {
        rows.push([
          fecha,
          row.profundidad,
          row.humedad?.actual ?? '',
          row.salinidad?.actual ?? '',
          row.temperatura?.actual ?? '',
          row.humedad?.crudo ?? '',
          row.humedad?.unidadCruda ?? '',
        ]);
      }
    }

    return rows;
  }

  private toNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private normalizarNapa(value: number, unit?: string): number {
    const normalizedUnit = String(unit || '').toLowerCase();
    if (normalizedUnit.includes('cm')) {
      return this.round(value / 100, 2);
    }
    if (normalizedUnit.includes('ma') || (value > 4 && value <= 20)) {
      return this.round(Math.max(0, ((value - 4) / 16) * 10), 2);
    }
    return this.round(value, 2);
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  }
}
