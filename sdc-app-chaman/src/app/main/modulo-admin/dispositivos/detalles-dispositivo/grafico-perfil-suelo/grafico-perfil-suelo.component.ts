import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SeriesOptionsType } from 'highcharts';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../detalles-dispositivo.component';

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
    // Ordenar datos por profundidad (de menor a mayor)
    const datosOrdenados = [...this.datos].sort((a, b) => a.profundidad - b.profundidad);

    // Preparar datos para humedad - En modo invertido: [x, y] = [valor, profundidad]
    const datosHumedad = datosOrdenados.map((d) => [d.humedad.actual, d.profundidad]);

    // Preparar datos para temperatura - En modo invertido: [x, y] = [valor, profundidad]
    const datosTemperatura = datosOrdenados.map((d) => [d.temperatura.actual, d.profundidad]);

    const series: SeriesOptionsType[] = [
      {
        name: this.translate.instant('Humedad') + ' (%)',
        data: datosHumedad,
        type: 'spline',
        color: '#3498db', // Azul similar al drawer-clima
        lineWidth: 2,
        marker: {
          enabled: true,
          radius: 3,
          fillColor: '#3498db',
        },
        tooltip: {
          pointFormat:
            '<span style="color:{point.color}">●</span> {series.name}: <strong>{point.x:.1f}%</strong><br/>Profundidad: {point.y} cm',
        },
      },
      {
        name: this.translate.instant('Temperatura') + ' (°C)',
        data: datosTemperatura,
        type: 'spline',
        color: '#e74c3c', // Rojo similar al drawer-clima
        lineWidth: 2,
        marker: {
          enabled: true,
          radius: 3,
          fillColor: '#e74c3c',
        },
        tooltip: {
          pointFormat:
            '<span style="color:{point.color}">●</span> {series.name}: <strong>{point.x:.1f}°C</strong><br/>Profundidad: {point.y} cm',
        },
      },
    ];

    this.chartOptions = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        height: 400,
        width: null, // Permite que se ajuste al contenedor
        spacingTop: 10,
        spacingRight: 10,
        spacingBottom: 10,
        spacingLeft: 10,
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        inverted: true, // Esto invierte los ejes para mostrar profundidad vertical
      },
      title: {
        text: this.titulo || this.translate.instant('Perfil de Humedad y Temperatura del Suelo'),
        style: {
          fontSize: '16px',
          fontWeight: '600',
          color: 'var(--p-text-color)',
        },
        margin: 6,
      },
      xAxis: {
        // En modo invertido, xAxis controla el eje horizontal (valores)
        title: {
          text: this.translate.instant('Humedad (%) / Temperatura (°C)'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '13px',
            fontWeight: '500',
          },
        },
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '12px',
          },
        },
        lineColor: 'var(--p-surface-border)',
        tickColor: 'var(--p-surface-border)',
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        tickLength: 5,
      },
      yAxis: {
        // En modo invertido, yAxis se convierte en el eje vertical (profundidad)
        title: {
          text: this.translate.instant('Profundidad (cm)'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '13px',
            fontWeight: '500',
          },
        },
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '12px',
          },
        },
        reversed: true, // Profundidad mayor hacia abajo
        gridLineColor: 'var(--p-surface-border)',
        gridLineWidth: 1,
        lineColor: 'var(--p-surface-border)',
        lineWidth: 1,
        tickColor: 'var(--p-surface-border)',
      },
      legend: {
        enabled: true,
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '12px',
          fontWeight: '500',
        },
        itemHoverStyle: {
          color: 'var(--p-text-color)',
        },
        itemHiddenStyle: {
          color: 'var(--p-text-color-secondary)',
        },
        symbolHeight: 8,
        symbolWidth: 10,
        symbolRadius: 4,
        margin: 20,
        itemMarginTop: 5,
        itemMarginBottom: 5,
        itemDistance: 15,
        y: 10,
      },
      tooltip: {
        shared: false,
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderWidth: 1,
        borderRadius: 8,
        shadow: true,
        style: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
        },
      },
      plotOptions: {
        line: {
          dataLabels: {
            enabled: false,
          },
          enableMouseTracking: true,
          lineWidth: 2,
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
          },
          states: {
            hover: {
              lineWidthPlus: 1,
            },
          },
        },
      },
      series,
      credits: {
        enabled: false,
      },
      accessibility: {
        enabled: false,
      },
      responsive: {
        rules: [
          {
            condition: {
              maxWidth: 768,
            },
            chartOptions: {
              chart: {
                height: 350,
              },
              title: {
                style: {
                  fontSize: '12px',
                },
              },
              legend: {
                itemStyle: {
                  fontSize: '9px',
                },
              },
            },
          },
        ],
      },
    };
  }
}
