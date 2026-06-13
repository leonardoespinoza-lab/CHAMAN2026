import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SeriesOptionsType } from 'highcharts';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../sentek-profile';

@Component({
  selector: 'app-grafico-perfil-suelo',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-perfil-suelo.component.html',
  styleUrl: './grafico-perfil-suelo.component.scss',
})
export class GraficoPerfilSueloComponent implements OnChanges {
  @Input() datos: MedicionProfundidad[] = [];
  @Input() titulo?: string;

  public chartOptions?: any;

  constructor(private translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datos'] && this.datos.length > 0) {
      this.crearGraficoPerfil();
    }
  }

  private crearGraficoPerfil(): void {
    const datosOrdenados = [...this.datos].sort((a, b) => a.profundidad - b.profundidad);
    const series = this.buildSeries(datosOrdenados);

    this.chartOptions = {
      chart: {
        backgroundColor: 'transparent',
        height: 430,
        inverted: true,
        spacingBottom: 10,
        spacingLeft: 10,
        spacingRight: 10,
        spacingTop: 10,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        type: 'line',
        width: null,
      },
      title: {
        text: this.titulo || this.translate.instant('Perfil de suelo'),
        margin: 8,
        style: {
          color: 'var(--p-text-color)',
          fontSize: '18px',
          fontWeight: '700',
        },
      },
      xAxis: {
        title: {
          text: this.translate.instant('Lectura del sensor'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '14px',
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
            fontSize: '14px',
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
      legend: {
        align: 'center',
        enabled: true,
        itemDistance: 18,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
          fontWeight: '600',
        },
        layout: 'horizontal',
        verticalAlign: 'bottom',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        pointFormat:
          '<span style="color:{series.color}">●</span> {series.name}: <strong>{point.x:.3f}</strong><br/>Profundidad: {point.y} cm',
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
      series,
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 768 },
            chartOptions: {
              chart: { height: 360 },
              title: { style: { fontSize: '14px' } },
              legend: { itemStyle: { fontSize: '11px' } },
            },
          },
        ],
      },
    };
  }

  private buildSeries(datos: MedicionProfundidad[]): SeriesOptionsType[] {
    const definitions = [
      {
        key: 'humedad' as const,
        name: `${this.translate.instant('Humedad')} (m3/m3)`,
        color: '#2f9fe8',
      },
      {
        key: 'salinidad' as const,
        name: `${this.translate.instant('Salinidad')} (mS/m)`,
        color: '#8e44ad',
      },
      {
        key: 'temperatura' as const,
        name: `${this.translate.instant('Temperatura')} (C)`,
        color: '#e74c3c',
      },
    ];

    return definitions
      .map((definition) => {
        const data = datos
          .filter((row) => row[definition.key])
          .map((row) => [row[definition.key]!.actual, row.profundidad]);

        if (!data.length) {
          return null;
        }

        return {
          color: definition.color,
          data,
          name: definition.name,
          type: 'spline',
        } as SeriesOptionsType;
      })
      .filter(Boolean) as SeriesOptionsType[];
  }
}
