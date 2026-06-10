import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-card-etapa-fenologica',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './card-etapa-fenologica.component.html',
  styleUrl: './card-etapa-fenologica.component.scss',
})
export class CardEtapaFenologicaComponent implements OnInit, OnDestroy {
  @Input() public lote?: IDetallesLote;
  public etapaActual?: string;
  public chartOptions?: Highcharts.Options;

  constructor(public helper: HelperService) {}

  private createChart() {
    this.etapaActual = this.helper.getNombreEtapa(this.lote);
    const fechaInicioEtapaActual = this.helper.getFechaInicioEtapa(this.lote) || new Date('2025-02-20');
    const mesInicio = fechaInicioEtapaActual?.getMonth() || 0 + 1;
    const diaInicio = fechaInicioEtapaActual?.getDate();
    const fechaFinEtapaActual = this.helper.getFechaFinEtapa(this.lote) || new Date('2025-02-20');
    const mesFin = fechaFinEtapaActual?.getMonth() || 0 + 1;
    const diaFin = fechaFinEtapaActual?.getDate();
    const hoy = new Date();
    const mesHoy = new Date().getMonth() + 1;
    const diaHoy = new Date().getDate();

    this.chartOptions = {
      chart: {
        type: 'timeline',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'Lato, sans-serif',
        },
      },
      accessibility: {
        enabled: false,
      },
      xAxis: {
        type: 'datetime',
        visible: false,
      },
      yAxis: {
        visible: false,
      },
      title: {
        text: undefined,
      },
      tooltip: {
        enabled: false,
      },
      colors: ['var(--p-accent-color)'],
      series: [
        {
          type: 'timeline',
          allowPointSelect: false,
          marker: {
            enabled: false,
          },
          dataLabels: {
            allowOverlap: false,
            format: `<span>{point.name}</span>`,
            borderWidth: 0,
            color: 'var(--p-text-color)',
            style: {
              fontWeight: 'bold',
            },
          },
          colorByPoint: false,
          lineWidth: 10,
          linecap: 'square',
          data: [
            {
              x: new Date(fechaInicioEtapaActual).getTime(),
              name: `Inicio ${diaInicio}/${mesInicio}`,
              dataLabels: {
                backgroundColor: 'transparent',
                verticalAlign: 'bottom',
                y: 35,
                connectorWidth: 0,
              },
              marker: {
                symbol: 'circle',
              },
              selected: true,
            },
            {
              x: new Date(hoy).getTime(),
              name: `Hoy ${diaHoy}/${mesHoy}`,
              dataLabels: {
                color: 'black',
                backgroundColor: 'var(--p-accent-color)',
                verticalAlign: 'top',
                y: -40,
                connectorWidth: 4,
              },
              marker: {
                symbol: 'circle',
              },
              selected: true,
            },
            {
              x: new Date(fechaFinEtapaActual).getTime(),
              name: `Fin ${diaFin}/${mesFin}`,
              dataLabels: {
                backgroundColor: 'transparent',
                verticalAlign: 'bottom',
                y: 35,
                connectorWidth: 0,
              },
              marker: {
                symbol: 'circle',
              },
              selected: true,
            },
          ],
        },
      ],
    };
  }

  async ngOnInit(): Promise<void> {
    this.createChart();
  }

  ngOnDestroy(): void {}
}
