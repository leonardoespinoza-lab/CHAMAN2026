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
      this.resumen = '';
      this.napaChartOptions = this.buildNapaChartOptions();
      return;
    }

    const definition = this.getDefinition(this.selectedMetric);
    const series = this.buildSeries(definition);
    this.resumen = this.buildResumen(definition, series);
    this.chartOptions = this.buildChartOptions(definition, series);
    this.napaChartOptions = this.buildNapaChartOptions();
  }

  private buildSeries(definition: SoilMetricDefinition): any[] {
    const byDepth = new Map<number, HistoricalPoint[]>();
    const sortedReports = this.sortedReports();

    for (const reporte of sortedReports) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const profile = buildSentekProfile(reporte);
      for (const row of profile) {
        const metric = row[definition.key];
        if (!metric || metric.actual === undefined || metric.actual === null) continue;
        const current = byDepth.get(row.profundidad) || [];
        current.push({
          x: timestamp,
          y: metric.actual,
          depth: row.profundidad,
          raw: metric.crudo,
          rawUnit: metric.unidadCruda,
        });
        byDepth.set(row.profundidad, current);
      }
    }

    return [...byDepth.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, data]) => ({
        name: `${depth} cm`,
        data,
        type: 'spline',
        marker: { enabled: data.length <= 40, radius: 2 },
      }));
  }

  private buildChartOptions(definition: SoilMetricDefinition, series: any[]): any {
    const yAxisExtremes = this.buildYAxisExtremes(definition, series);

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 640,
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
        ...yAxisExtremes,
        title: {
          text: `${definition.title} (${definition.unit})`,
          style: { color: definition.color, fontSize: '14px', fontWeight: '700' },
        },
        labels: {
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
          const date = new Date(point.x).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const raw =
            point.raw !== undefined && point.rawUnit
              ? `<br/>Crudo: <strong>${Number(point.raw).toFixed(3)} ${point.rawUnit}</strong>`
              : '';
          return `<span style="color:${this.series.color}">&bull;</span> ${this.series.name}<br/>${date}<br/><strong>${Number(point.y).toFixed(definition.decimals)} ${definition.unit}</strong>${raw}`;
        },
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        spline: {
          animation: { duration: 500 },
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          lineWidth: 1.8,
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

  private buildYAxisExtremes(definition: SoilMetricDefinition, series: any[]): { min?: number; max?: number; tickAmount?: number; startOnTick?: boolean; endOnTick?: boolean } {
    const values = series
      .flatMap((serie) => (serie.data || []).map((point: HistoricalPoint) => Number(point.y)))
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

    const unit = points.find((point) => !!point.unit)?.unit || 'cm';
    const latest = points[points.length - 1];
    this.napaResumen = `${points.length} lecturas - ultima ${Number(latest.y).toFixed(1)} ${unit}`;

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
          return `${date}<br/><strong>${Number(point.y).toFixed(1)} ${point.unit || unit}</strong>`;
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
        const value = this.toNumber(
          valores?.actual ??
            valores?.promedio ??
            valores?.altura ??
            valores?.nivel ??
            valores?.value ??
            valores?.valor,
        );
        if (value === undefined) continue;

        points.push({
          x: timestamp,
          y: value,
          unit: valores?.unidad || row?.unidad || 'cm',
        });
      }
    }

    return points.sort((a, b) => a.x - b.x);
  }

  private buildResumen(definition: SoilMetricDefinition, series: any[]): string {
    const values = series.flatMap((serie) => serie.data.map((point: HistoricalPoint) => point.y));
    if (!values.length) return 'Sin lecturas historicas para esta variable';
    const average = values.reduce((acc, value) => acc + Number(value), 0) / values.length;
    return `${series.length} profundidades - ${values.length} lecturas - promedio ${average.toFixed(definition.decimals)} ${definition.unit}`;
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

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  }
}
