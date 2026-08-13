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

interface RainPoint {
  x: number;
  y: number;
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
  @Input() fechaDesde?: string;

  public chartOptions?: any;
  public napaChartOptions?: any;
  public selectedMetric: SoilMetricKey = 'humedad';
  public metricOptions: Array<{ label: string; value: SoilMetricKey }> = [];
  public profileRows: ProfileRow[] = [];
  public resumen = '';
  public napaResumen = '';
  public assignmentNotice = '';

  private readonly definitions: SoilMetricDefinition[] = [
    { key: 'humedad', title: 'Humedad de suelo', unit: '%', color: '#2f9fe8', decimals: 1 },
    { key: 'salinidad', title: 'Salinidad', unit: 'mS/m', color: '#8e44ad', decimals: 1 },
    { key: 'temperatura', title: 'Temperatura', unit: 'C', color: '#e74c3c', decimals: 1 },
  ];

  private readonly depthColors = [
    '#22d3c8',
    '#2f9fe8',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#10b981',
    '#64748b',
    '#ec4899',
    '#14b8a6',
    '#84cc16',
    '#f97316',
    '#06b6d4',
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportes'] || changes['fechaDesde']) {
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
    const csv = [headers, ...rows].map((row) => row.map((value) => this.csvCell(value)).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-sentek-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private prepareOptions(): void {
    this.assignmentNotice = this.buildAssignmentNotice();
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
    const series = this.buildHistoricalSeries(definition);
    const latestPoints = this.buildLatestDepthPoints(definition);
    this.profileRows = this.buildProfileRows(definition, latestPoints);
    this.resumen = this.buildResumen(definition, series, latestPoints);
    this.chartOptions = this.buildStackedTimeSeriesChartOptions(definition, series);
    this.napaChartOptions = this.buildNapaChartOptions();
  }

  private buildHistoricalSeries(definition: SoilMetricDefinition): any[] {
    const byDepth = new Map<number, HistoricalPoint[]>();

    for (const reporte of this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const profile = buildSentekProfile(reporte);
      for (const row of profile) {
        const metric = row[definition.key];
        if (!metric || metric.actual === undefined || metric.actual === null || !Number.isFinite(metric.actual)) {
          continue;
        }

        if (!byDepth.has(row.profundidad)) {
          byDepth.set(row.profundidad, []);
        }

        byDepth.get(row.profundidad)!.push({
          x: timestamp,
          y: metric.actual,
          depth: row.profundidad,
          raw: metric.crudo,
          rawUnit: metric.unidadCruda,
        });
      }
    }

    return [...byDepth.entries()]
      .sort(([a], [b]) => a - b)
      .map(([depth, data], index) => ({
        color: this.depthColors[index % this.depthColors.length],
        data: data.sort((a, b) => a.x - b.x),
        lineWidth: 2,
        marker: { enabled: data.length <= 36, radius: 2 },
        name: `${depth} cm`,
        type: 'spline',
        turboThreshold: 0,
        custom: { decimals: definition.decimals, unit: definition.unit },
      }));
  }

  private buildLatestDepthPoints(definition: SoilMetricDefinition): HistoricalPoint[] {
    const latestByDepth = new Map<number, HistoricalPoint>();

    for (const reporte of [...this.filteredReports()].reverse()) {
      const timestamp = this.getReporteTimestamp(reporte) || Date.now();
      const profile = buildSentekProfile(reporte);

      for (const row of profile) {
        const metric = row[definition.key];
        if (
          !metric ||
          metric.actual === undefined ||
          metric.actual === null ||
          !Number.isFinite(metric.actual) ||
          latestByDepth.has(row.profundidad)
        ) {
          continue;
        }

        latestByDepth.set(row.profundidad, {
          x: timestamp,
          y: metric.actual,
          depth: row.profundidad,
          raw: metric.crudo,
          rawUnit: metric.unidadCruda,
        });
      }
    }

    return [...latestByDepth.values()].sort((a, b) => a.depth - b.depth);
  }

  private buildStackedTimeSeriesChartOptions(definition: SoilMetricDefinition, series: any[]): any {
    const rainPoints = this.buildRainPoints();
    const hasRain = rainPoints.length > 0;
    const depthCount = Math.max(series.length, 1);
    const chartHeight = Math.min(900, Math.max(540, depthCount * 98 + (hasRain ? 155 : 120)));
    const topGap = 2.2;
    const rainHeight = hasRain ? 14 : 0;
    const soilStart = hasRain ? rainHeight + topGap : 0;
    const soilAvailable = 88 - soilStart;
    const soilGap = 1.4;
    const soilHeight = Math.max(8, (soilAvailable - soilGap * Math.max(depthCount - 1, 0)) / depthCount);
    const yAxis: any[] = [];

    if (hasRain) {
      yAxis.push({
        title: {
          text: 'Lluvia (mm)',
          style: { color: '#1d72b8', fontSize: '13px', fontWeight: '800' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '12px', fontWeight: '700' },
        },
        min: 0,
        top: '0%',
        height: `${rainHeight}%`,
        offset: 0,
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      });
    }

    series.forEach((item, index) => {
      const top = soilStart + index * (soilHeight + soilGap);
      yAxis.push({
        max: definition.key === 'humedad' ? 100 : undefined,
        min: definition.key === 'humedad' ? 0 : undefined,
        title: {
          text: item.name,
          margin: 8,
          style: { color: item.color || definition.color, fontSize: '13px', fontWeight: '900' },
        },
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '12px', fontWeight: '700' },
        },
        endOnTick: true,
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        height: `${soilHeight}%`,
        top: `${top}%`,
        offset: 0,
      });
    });

    const plottedSeries = [
      ...(hasRain
        ? [
            {
              color: '#1d72b8',
              custom: { decimals: 1, unit: 'mm' },
              data: rainPoints,
              name: 'Lluvia',
              pointPadding: 0.08,
              tooltip: { valueSuffix: ' mm' },
              type: 'column',
              yAxis: 0,
            },
          ]
        : []),
      ...series.map((item, index) => ({
        ...item,
        yAxis: index + (hasRain ? 1 : 0),
      })),
    ];

    return {
      chart: {
        backgroundColor: 'transparent',
        height: chartHeight,
        spacingBottom: 22,
        spacingLeft: 8,
        spacingRight: 20,
        spacingTop: 8,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 2,
        },
        title: {
          text: 'Fecha y hora',
          style: { color: 'var(--p-text-color)', fontSize: '14px', fontWeight: '700' },
        },
        labels: {
          format: '{value:%d/%m<br/>%H:%M}',
          style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '600' },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis,
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
        shared: true,
        shadow: true,
        xDateFormat: '%d/%m/%Y %H:%M',
        valueDecimals: definition.decimals,
        valueSuffix: ` ${definition.unit}`,
        pointFormatter: function (this: any) {
          const point = this as HistoricalPoint & { color?: string; series?: any };
          const custom = point.series?.userOptions?.custom || {};
          const decimals = custom.decimals ?? definition.decimals;
          const unit = custom.unit || definition.unit;
          const raw =
            point.raw !== undefined && point.rawUnit
              ? ` <span style="color:#60708a">(crudo ${Number(point.raw).toFixed(3)} ${point.rawUnit})</span>`
              : '';
          return `<br/><span style="color:${point.color}">&bull;</span> ${point.series?.name || ''}: <strong>${Number(point.y).toFixed(decimals)} ${unit}</strong>${raw}`;
        },
        style: { color: 'var(--p-text-color)', fontSize: '14px' },
      },
      plotOptions: {
        column: {
          borderWidth: 0,
          pointPadding: 0.08,
          groupPadding: 0.05,
        },
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
      series: plottedSeries,
      credits: { enabled: false },
      accessibility: { enabled: false },
      lang: { noData: 'Sin lecturas historicas para esta variable.' },
      noData: { style: { color: '#60708a', fontWeight: '700' } },
      time: { useUTC: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: Math.min(chartHeight, 560) },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  private buildProfileRows(definition: SoilMetricDefinition, latestPoints: HistoricalPoint[]): ProfileRow[] {
    return latestPoints.map((point) => ({
      profundidad: point.depth,
      formatted: `${Number(point.y).toFixed(definition.decimals)} ${definition.unit}`,
      raw: point.raw !== undefined && point.rawUnit ? `${Number(point.raw).toFixed(3)} ${point.rawUnit}` : undefined,
    }));
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
          text: `Profundidad de napa desde el terreno (${unit})`,
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
          name: 'Profundidad de napa',
          type: 'spline',
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private buildNapaPoints(): NapaPoint[] {
    const points: NapaPoint[] = [];

    for (const reporte of this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const rawNapa = (reporte?.datos as any)?.valores?.Napa;
      const napaRows = Array.isArray(rawNapa) ? rawNapa : rawNapa ? [rawNapa] : [];

      for (const row of napaRows) {
        const valores = row?.valores || row;
        const rawValue = this.toNumber(
          valores?.actual ?? valores?.promedio ?? valores?.altura ?? valores?.nivel ?? valores?.value ?? valores?.valor
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

  private buildRainPoints(): RainPoint[] {
    const points: RainPoint[] = [];

    for (const reporte of this.filteredReports()) {
      const timestamp = this.getReporteTimestamp(reporte);
      if (!timestamp) continue;

      const value = this.extractRainValue(reporte);
      if (value === undefined) continue;

      points.push({
        x: timestamp,
        y: Math.max(0, value),
      });
    }

    return points.sort((a, b) => a.x - b.x);
  }

  private buildResumen(definition: SoilMetricDefinition, series: any[], latestPoints: HistoricalPoint[]): string {
    const pointCount = series.reduce((sum, item) => sum + (item.data?.length || 0), 0);
    if (!pointCount) return 'Sin lecturas historicas para esta variable';

    const average = latestPoints.length
      ? latestPoints.reduce((sum, point) => sum + point.y, 0) / latestPoints.length
      : undefined;
    const averageText =
      average === undefined ? '' : ` - promedio actual ${average.toFixed(definition.decimals)} ${definition.unit}`;

    return `${series.length} profundidades - ${pointCount} lecturas${averageText}`;
  }

  private hasMetric(key: SoilMetricKey): boolean {
    return this.filteredReports().some((reporte) => buildSentekProfile(reporte).some((row) => !!row[key]));
  }

  private getDefinition(key: SoilMetricKey): SoilMetricDefinition {
    return this.definitions.find((definition) => definition.key === key) || this.definitions[0];
  }

  private sortedReports(): IReporte[] {
    return [...(this.reportes || [])].sort((a, b) => this.getReporteTimestamp(a) - this.getReporteTimestamp(b));
  }

  private filteredReports(): IReporte[] {
    const desde = this.getFechaDesdeMs();
    return this.sortedReports().filter((reporte) => {
      const timestamp = this.getReporteTimestamp(reporte);
      return !desde || (!!timestamp && timestamp >= desde);
    });
  }

  private getFechaDesdeMs(): number {
    if (!this.fechaDesde) return 0;
    const timestamp = new Date(this.fechaDesde).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private buildAssignmentNotice(): string {
    const timestamp = this.getFechaDesdeMs();
    if (!timestamp) return '';

    const fecha = new Date(timestamp).toLocaleString('es-AR', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    return `Tramo operativo actual desde ${fecha}. El historico tecnico completo queda conservado por DevEUI.`;
  }

  private getReporteTimestamp(reporte: IReporte): number {
    return new Date(reporte.fecha || reporte.fechaCreacion || '').getTime() || 0;
  }

  private getCsvRows(): unknown[][] {
    const rows: unknown[][] = [];

    for (const reporte of this.filteredReports()) {
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

  private extractRainValue(reporte: IReporte): number | undefined {
    const valores = (reporte?.datos as any)?.valores || {};
    const keys = ['Pluviometro', 'Lluvia', 'Precipitacion', 'Rain', 'Rainfall'];

    for (const key of keys) {
      const value = this.extractRainValueFromRows(valores[key]);
      if (value !== undefined) {
        return value;
      }
    }

    for (const [key, raw] of Object.entries(valores)) {
      const normalizedKey = this.normalizeKey(key);
      if (
        normalizedKey.includes('pluvio') ||
        normalizedKey.includes('lluvia') ||
        normalizedKey.includes('precipitacion') ||
        normalizedKey.includes('rain')
      ) {
        const value = this.extractRainValueFromRows(raw);
        if (value !== undefined) {
          return value;
        }
      }
    }

    return undefined;
  }

  private extractRainValueFromRows(raw: unknown): number | undefined {
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];

    for (const row of rows) {
      const rowValues = (row as any)?.valores || row;
      const value = this.toNumber(
        (rowValues as any)?.suma ??
          (rowValues as any)?.acumulado ??
          (rowValues as any)?.actual ??
          (rowValues as any)?.promedio ??
          (rowValues as any)?.value ??
          (rowValues as any)?.valor
      );
      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  private normalizeKey(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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
