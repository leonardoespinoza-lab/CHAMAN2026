import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../sentek-profile';

interface SoilMetricChart {
  key: 'humedad' | 'salinidad' | 'temperatura';
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

  public metricCharts: SoilMetricChart[] = [];

  constructor(private translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datos']) {
      this.crearGraficosPerfil();
    }
  }

  private crearGraficosPerfil(): void {
    if (!this.datos.length) {
      this.metricCharts = [];
      return;
    }

    const datosOrdenados = [...this.datos].sort((a, b) => a.profundidad - b.profundidad);
    this.metricCharts = [
      this.buildMetricChart(datosOrdenados, {
        key: 'humedad',
        title: this.translate.instant('Humedad de suelo'),
        unit: 'm3/m3',
        color: '#2f9fe8',
        decimals: 3,
      }),
      this.buildMetricChart(datosOrdenados, {
        key: 'salinidad',
        title: this.translate.instant('Salinidad'),
        unit: 'mS/m',
        color: '#8e44ad',
        decimals: 1,
      }),
      this.buildMetricChart(datosOrdenados, {
        key: 'temperatura',
        title: this.translate.instant('Temperatura'),
        unit: 'C',
        color: '#e74c3c',
        decimals: 1,
      }),
    ].filter(Boolean) as SoilMetricChart[];
  }

  private buildMetricChart(
    datos: MedicionProfundidad[],
    definition: {
      key: 'humedad' | 'salinidad' | 'temperatura';
      title: string;
      unit: string;
      color: string;
      decimals: number;
    }
  ): SoilMetricChart | null {
    const data = datos
      .filter((row) => row[definition.key])
      .map((row) => [row[definition.key]!.actual, row.profundidad]);

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
      options: this.getChartOptions(data, definition),
    };
  }

  private getChartOptions(
    data: number[][],
    definition: {
      title: string;
      unit: string;
      color: string;
      decimals: number;
    }
  ): any {
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
      yAxis: {
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
      },
      legend: { enabled: false },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        pointFormat:
          `<span style="color:{series.color}">●</span> {series.name}: <strong>{point.x:.${definition.decimals}f} ${definition.unit}</strong><br/>Profundidad: {point.y} cm`,
        shadow: true,
        style: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
        },
      },
      plotOptions: {
        spline: {
          animation: { duration: 600 },
          dataLabels: { enabled: false },
          enableMouseTracking: true,
          lineWidth: 2,
          marker: {
            enabled: true,
            radius: 3,
          },
        },
      },
      series: [
        {
          color: definition.color,
          data,
          name: definition.title,
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
}
