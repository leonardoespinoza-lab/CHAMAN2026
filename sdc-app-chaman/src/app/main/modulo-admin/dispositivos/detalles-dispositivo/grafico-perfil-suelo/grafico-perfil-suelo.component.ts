import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../sentek-profile';

type SoilMetricKey = 'humedad' | 'salinidad' | 'temperatura';

interface SoilMetricDefinition {
  key: SoilMetricKey;
  title: string;
  unit: string;
  color: string;
  decimals: number;
}

interface SoilMetricChart {
  key: SoilMetricKey;
  title: string;
  unit: string;
  summary: string;
  options: any;
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
  public metricCharts: SoilMetricChart[] = [];

  constructor(private translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datos']) {
      this.crearGraficosPerfil();
    }
  }

  private crearGraficosPerfil(): void {
    if (!this.datos.length) {
      this.combinedChart = undefined;
      this.metricCharts = [];
      return;
    }

    const datosOrdenados = [...this.datos].sort((a, b) => a.profundidad - b.profundidad);
    const definitions = this.getMetricDefinitions(datosOrdenados).filter((definition) =>
      datosOrdenados.some((row) => !!row[definition.key])
    );

    this.combinedChart = definitions.length
      ? this.getCombinedChartOptions(datosOrdenados, definitions)
      : undefined;
    this.metricCharts = definitions
      .map((definition) => this.buildMetricChart(datosOrdenados, definition))
      .filter(Boolean) as SoilMetricChart[];
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

  private buildMetricChart(datos: MedicionProfundidad[], definition: SoilMetricDefinition): SoilMetricChart | null {
    const data = this.getSeriesData(datos, definition.key);

    if (!data.length) {
      return null;
    }

    const valores = data.map(([value]) => Number(value));
    const promedio = valores.reduce((acc, value) => acc + value, 0) / valores.length;

    return {
      key: definition.key,
      title: definition.title,
      unit: definition.unit,
      summary: `Promedio ${promedio.toFixed(definition.decimals)} ${definition.unit}`,
      options: this.getSingleChartOptions(data, definition),
    };
  }

  private getCombinedChartOptions(datos: MedicionProfundidad[], definitions: SoilMetricDefinition[]): any {
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 380,
        inverted: true,
        spacingBottom: 12,
        spacingLeft: 8,
        spacingRight: 16,
        spacingTop: 8,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        type: 'spline',
        width: null,
      },
      title: { text: undefined },
      xAxis: definitions.map((definition, index) => ({
        title: {
          text: `${definition.title} (${definition.unit})`,
          style: {
            color: definition.color,
            fontSize: '13px',
            fontWeight: '700',
          },
        },
        labels: {
          style: {
            color: definition.color,
            fontSize: '12px',
          },
        },
        gridLineColor: index === 0 ? 'var(--p-surface-border)' : 'transparent',
        gridLineWidth: index === 0 ? 1 : 0,
        lineColor: definition.color,
        opposite: index > 0,
        offset: index > 1 ? 34 : 0,
      })),
      yAxis: this.getDepthAxis(),
      legend: this.getLegendOptions(),
      tooltip: this.getTooltipOptions(),
      plotOptions: this.getPlotOptions(),
      series: definitions.map((definition, index) => ({
        color: definition.color,
        data: this.getSeriesData(datos, definition.key),
        name: `${definition.title} (${definition.unit})`,
        type: 'spline',
        xAxis: index,
      })),
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 340 },
              xAxis: definitions.map((definition) => ({
                title: { text: definition.unit },
              })),
            },
          },
        ],
      },
    };
  }

  private getSingleChartOptions(data: number[][], definition: SoilMetricDefinition): any {
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 280,
        inverted: true,
        spacingBottom: 8,
        spacingLeft: 8,
        spacingRight: 8,
        spacingTop: 8,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        type: 'spline',
        width: null,
      },
      title: { text: undefined },
      xAxis: {
        title: {
          text: `${definition.title} (${definition.unit})`,
          style: {
            color: 'var(--p-text-color)',
            fontSize: '13px',
            fontWeight: '600',
          },
        },
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '12px',
          },
        },
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
      },
      yAxis: this.getDepthAxis(),
      legend: { enabled: false },
      tooltip: this.getTooltipOptions(),
      plotOptions: this.getPlotOptions(),
      series: [
        {
          color: definition.color,
          data,
          name: `${definition.title} (${definition.unit})`,
          type: 'spline',
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 250 },
            },
          },
        ],
      },
    };
  }

  private getSeriesData(datos: MedicionProfundidad[], key: SoilMetricKey): number[][] {
    return datos
      .filter((row) => row[key])
      .map((row) => [row[key]!.actual, row.profundidad]);
  }

  private getUnit(datos: MedicionProfundidad[], key: SoilMetricKey, fallback: string): string {
    return datos.find((row) => row[key])?.[key]?.unidad || fallback;
  }

  private getDepthAxis(): any {
    return {
      title: {
        text: this.translate.instant('Profundidad (cm)'),
        style: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
          fontWeight: '600',
        },
      },
      labels: {
        style: {
          color: 'var(--p-text-color)',
          fontSize: '12px',
        },
      },
      gridLineColor: 'var(--p-surface-border)',
      gridLineWidth: 1,
      reversed: true,
    };
  }

  private getLegendOptions(): any {
    return {
      align: 'center',
      enabled: true,
      itemDistance: 18,
      itemStyle: {
        color: 'var(--p-text-color)',
        fontSize: '13px',
        fontWeight: '700',
      },
      layout: 'horizontal',
      verticalAlign: 'bottom',
    };
  }

  private getTooltipOptions(): any {
    return {
      backgroundColor: 'var(--p-content-background)',
      borderColor: 'var(--p-surface-border)',
      borderRadius: 8,
      borderWidth: 1,
      pointFormat: '<span style="color:{series.color}">●</span> {series.name}: <strong>{point.x:.1f}</strong><br/>Profundidad: {point.y} cm',
      shadow: true,
      style: {
        color: 'var(--p-text-color)',
        fontSize: '13px',
      },
    };
  }

  private getPlotOptions(): any {
    return {
      spline: {
        animation: { duration: 600 },
        dataLabels: { enabled: false },
        enableMouseTracking: true,
        lineWidth: 2.5,
        marker: {
          enabled: true,
          radius: 3,
        },
      },
    };
  }
}
