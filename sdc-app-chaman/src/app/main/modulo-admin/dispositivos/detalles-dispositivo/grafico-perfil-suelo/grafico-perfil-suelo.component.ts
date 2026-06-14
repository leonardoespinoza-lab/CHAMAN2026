import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../sentek-profile';

type SoilMetricKey = 'humedad' | 'salinidad' | 'temperatura';
type SoilMetricSelection = SoilMetricKey | 'todas';

interface SoilMetricDefinition {
  key: SoilMetricKey;
  title: string;
  unit: string;
  color: string;
  decimals: number;
}

interface SoilPoint {
  x: number;
  y: number;
  raw?: number;
  rawUnit?: string;
  displayValue?: number;
  displayUnit?: string;
}

@Component({
  selector: 'app-grafico-perfil-suelo',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-perfil-suelo.component.html',
  styleUrl: './grafico-perfil-suelo.component.scss',
})
export class GraficoPerfilSueloComponent implements OnChanges {
  @Input() datos: MedicionProfundidad[] = [];
  @Input() titulo?: string;

  public combinedChart?: any;
  public selectedMetric: SoilMetricSelection = 'humedad';
  public metricOptions: Array<{ label: string; value: SoilMetricSelection }> = [];
  public metricSummary = '';

  private datosOrdenados: MedicionProfundidad[] = [];
  private definitions: SoilMetricDefinition[] = [];

  constructor(private translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datos']) {
      this.crearGraficosPerfil();
    }
  }

  public onMetricChange(metric: SoilMetricSelection): void {
    this.selectedMetric = metric;
    this.rebuildChart();
  }

  public exportarCsv(): void {
    if (!this.datosOrdenados.length) return;

    const headers = [
      'Profundidad cm',
      'Humedad suelo %',
      'Salinidad mS/m',
      'Temperatura C',
      'Lectura cruda humedad',
      'Unidad cruda humedad',
    ];
    const rows = this.datosOrdenados.map((row) => [
      row.profundidad,
      row.humedad?.actual ?? '',
      row.salinidad?.actual ?? '',
      row.temperatura?.actual ?? '',
      row.humedad?.crudo ?? '',
      row.humedad?.unidadCruda ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(';'))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `perfil-sentek-${fecha}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private crearGraficosPerfil(): void {
    if (!this.datos.length) {
      this.datosOrdenados = [];
      this.definitions = [];
      this.metricOptions = [];
      this.metricSummary = '';
      this.combinedChart = undefined;
      return;
    }

    this.datosOrdenados = [...this.datos].sort((a, b) => a.profundidad - b.profundidad);
    this.definitions = this.getMetricDefinitions(this.datosOrdenados).filter((definition) =>
      this.datosOrdenados.some((row) => !!row[definition.key])
    );
    this.metricOptions = [
      ...this.definitions.map((definition) => ({ label: definition.title, value: definition.key })),
      ...(this.definitions.length > 1 ? [{ label: this.translate.instant('Todas'), value: 'todas' as const }] : []),
    ];

    if (!this.metricOptions.some((option) => option.value === this.selectedMetric)) {
      this.selectedMetric = this.definitions[0]?.key || 'humedad';
    }

    this.rebuildChart();
  }

  private rebuildChart(): void {
    if (!this.definitions.length) {
      this.metricSummary = '';
      this.combinedChart = undefined;
      return;
    }

    this.metricSummary = this.getMetricSummary();
    this.combinedChart = this.getCombinedChartOptions();
  }

  private getMetricDefinitions(datos: MedicionProfundidad[]): SoilMetricDefinition[] {
    return [
      {
        key: 'humedad',
        title: this.translate.instant('Humedad de suelo'),
        unit: this.getUnit(datos, 'humedad', '%'),
        color: '#2f9fe8',
        decimals: 1,
      },
      {
        key: 'salinidad',
        title: this.translate.instant('Salinidad'),
        unit: this.getUnit(datos, 'salinidad', 'mS/m'),
        color: '#8e44ad',
        decimals: 1,
      },
      {
        key: 'temperatura',
        title: this.translate.instant('Temperatura'),
        unit: this.getUnit(datos, 'temperatura', 'C'),
        color: '#e74c3c',
        decimals: 1,
      },
    ];
  }

  private getCombinedChartOptions(): any {
    const selectedDefinitions =
      this.selectedMetric === 'todas'
        ? this.definitions
        : this.definitions.filter((definition) => definition.key === this.selectedMetric);
    const relativeMode = this.selectedMetric === 'todas';

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 380,
        spacingBottom: 14,
        spacingLeft: 8,
        spacingRight: 12,
        spacingTop: 8,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        type: 'spline',
        width: null,
      },
      title: { text: undefined },
      xAxis: this.getDepthXAxis(),
      yAxis: relativeMode
        ? this.getRelativeYAxis()
        : this.getMetricYAxis(selectedDefinitions[0]),
      legend: this.getLegendOptions(),
      tooltip: this.getTooltipOptions(relativeMode),
      plotOptions: this.getPlotOptions(),
      series: selectedDefinitions.map((definition) => ({
        color: definition.color,
        data: relativeMode
          ? this.getRelativeSeriesData(definition)
          : this.getSeriesData(this.datosOrdenados, definition.key),
        name: relativeMode ? definition.title : `${definition.title} (${definition.unit})`,
        type: 'spline',
      })),
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 330 },
              legend: {
                itemStyle: { fontSize: '12px' },
              },
            },
          },
        ],
      },
    };
  }

  private getSeriesData(datos: MedicionProfundidad[], key: SoilMetricKey): SoilPoint[] {
    return datos
      .filter((row) => row[key])
      .map((row) => ({
        x: row.profundidad,
        y: row[key]!.actual,
        raw: row[key]!.crudo,
        rawUnit: row[key]!.unidadCruda,
        displayValue: row[key]!.actual,
        displayUnit: row[key]!.unidad,
      }));
  }

  private getRelativeSeriesData(definition: SoilMetricDefinition): SoilPoint[] {
    const points = this.getSeriesData(this.datosOrdenados, definition.key);
    const values = points.map((point) => Number(point.y)).filter((value) => Number.isFinite(value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return points.map((point) => {
      const relative = range > 0 ? ((Number(point.y) - min) / range) * 100 : 50;
      return {
        ...point,
        y: definition.key === 'humedad' ? Number(point.y) : relative,
        displayValue: Number(point.y),
        displayUnit: definition.unit,
      };
    });
  }

  private getMetricSummary(): string {
    if (this.selectedMetric === 'todas') {
      return 'Curvas normalizadas para comparar tendencia por profundidad';
    }

    const definition = this.definitions.find((item) => item.key === this.selectedMetric);
    if (!definition) return '';
    const values = this.getSeriesData(this.datosOrdenados, definition.key).map((point) => Number(point.y));
    if (!values.length) return definition.title;
    const average = values.reduce((acc, value) => acc + value, 0) / values.length;
    return `Promedio ${average.toFixed(definition.decimals)} ${definition.unit}`;
  }

  private getUnit(datos: MedicionProfundidad[], key: SoilMetricKey, fallback: string): string {
    return datos.find((row) => row[key])?.[key]?.unidad || fallback;
  }

  private getDepthXAxis(): any {
    return {
      title: {
        text: this.translate.instant('Profundidad (cm)'),
        style: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
      },
      labels: {
        style: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
        },
      },
      gridLineColor: 'var(--p-surface-border)',
      gridLineWidth: 1,
    };
  }

  private getMetricYAxis(definition?: SoilMetricDefinition): any {
    return {
      ...(definition ? this.getAxisBounds(definition) : {}),
      title: {
        text: definition ? `${definition.title} (${definition.unit})` : undefined,
        style: {
          color: definition?.color || 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
      },
      labels: {
        style: {
          color: definition?.color || 'var(--p-text-color)',
          fontSize: '13px',
        },
      },
      gridLineColor: 'var(--p-surface-border)',
      gridLineWidth: 1,
      lineColor: definition?.color,
    };
  }

  private getRelativeYAxis(): any {
    return {
      min: 0,
      max: 100,
      title: {
        text: 'Indice relativo / humedad (%)',
        style: {
          color: 'var(--p-text-color)',
          fontSize: '14px',
          fontWeight: '700',
        },
      },
      labels: {
        style: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
        },
      },
      gridLineColor: 'var(--p-surface-border)',
      gridLineWidth: 1,
    };
  }

  private getLegendOptions(): any {
    return {
      align: 'center',
      enabled: true,
      itemDistance: 18,
      itemStyle: {
        color: 'var(--p-text-color)',
        fontSize: '14px',
        fontWeight: '700',
      },
      layout: 'horizontal',
      verticalAlign: 'bottom',
    };
  }

  private getTooltipOptions(relativeMode: boolean): any {
    return {
      backgroundColor: 'var(--p-content-background)',
      borderColor: 'var(--p-surface-border)',
      borderRadius: 8,
      borderWidth: 1,
      formatter: function (this: any) {
        const point = this.point as SoilPoint;
        const display =
          relativeMode && point.displayValue != null
            ? `${Number(point.displayValue).toFixed(1)} ${point.displayUnit || ''}`
            : `${Number(point.y).toFixed(1)}`;
        const relative =
          relativeMode && point.displayValue != null
            ? `<br/><span>Indice relativo: <strong>${Number(point.y).toFixed(1)}%</strong></span>`
            : '';
        const raw =
          point.raw !== undefined && point.rawUnit
            ? `<br/><span>Lectura cruda: <strong>${Number(point.raw).toFixed(3)} ${point.rawUnit}</strong></span>`
            : '';
        return `<span style="color:${this.series.color}">●</span> ${this.series.name}: <strong>${display}</strong><br/>Profundidad: ${point.x} cm${relative}${raw}`;
      },
      shadow: true,
      style: {
        color: 'var(--p-text-color)',
        fontSize: '13px',
      },
    };
  }

  private getAxisBounds(definition: SoilMetricDefinition): any {
    if (definition.key === 'humedad') {
      return { min: 0, max: 100 };
    }
    return {};
  }

  private getPlotOptions(): any {
    return {
      spline: {
        animation: { duration: 600 },
        dataLabels: { enabled: false },
        enableMouseTracking: true,
        lineWidth: 3,
        marker: {
          enabled: true,
          radius: 4,
        },
      },
    };
  }

  private csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  }
}
