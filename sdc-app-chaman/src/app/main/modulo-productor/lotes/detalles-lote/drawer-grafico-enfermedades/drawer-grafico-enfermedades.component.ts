import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SeriesOptionsType, XAxisPlotBandsOptions, XAxisPlotLinesOptions } from 'highcharts';
import { IListado, IPrediccion, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';

export const ETAPAS_TRIGO: string[] = [
  'Siembra',
  'Emergencia',
  'Espiguilla Terminal',
  'Hoja Bandera',
  'Espigazón',
  'Antesis',
  'Llenado de Granos',
  'Maduréz Fisiológica',
];

export const ETAPAS_SOJA: string[] = [
  'Siembra',
  'Emergencia',
  'Floración',
  'Fructificación',
  'Inicio de llenado',
  'Maduréz Fisiológica',
];
export const ETAPAS_MAIZ: string[] = ['Siembra', 'Emergencia', 'Floración', 'Maduréz'];

@Component({
  selector: 'app-drawer-grafico-enfermedades',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './drawer-grafico-enfermedades.component.html',
  styleUrl: './drawer-grafico-enfermedades.component.scss',
})
export class DrawerGraficoEnfermedadesComponent implements OnInit, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public siembra?: IDetalleSiembra;
  private predicciones$?: Subscription;
  private predicciones: IPrediccion[] = [];

  public chartOptions?: Highcharts.Options;

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private translate: TranslateService
  ) {}

  private crearGraficoPredicciones(): void {
    if (this.siembra?.semilla?.cultivo === 'Trigo') {
      this.crearGraficoPrediccionesTrigo();
      return;
    }
    if (this.siembra?.semilla?.cultivo === 'Soja') {
      this.crearGraficoPrediccionesSoja();
      return;
    }
    if (this.siembra?.semilla?.cultivo === 'Maiz') {
      this.crearGraficoPrediccionesMaiz();
      return;
    }
  }

  private chartBasicOptions(
    plotLines: XAxisPlotLinesOptions[],
    plotBands: XAxisPlotBandsOptions[],
    series: SeriesOptionsType[]
  ) {
    const color0 = '#a0a0a0';
    // const color1 = '#dee8eb';
    // const color2 = '#aec6cf';
    // const color3 = '#7ea4b3';
    const color1 = '#22c55e2b';
    const color2 = '#f3d7402b';
    const color3 = '#f44a4a2b';

    const options: Highcharts.Options = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'Lato, sans-serif',
          color: 'var(--p-text-color)',
        },
        spacing: [20, 20, 20, 20], // Mejor espaciado para pantallas grandes
      },
      title: undefined,
      yAxis: {
        max: 40,
        min: 0,
        title: {
          text: this.translate.instant('Porcentaje de probabilidad (%)'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '14px',
          },
        },
        plotBands: [
          // {
          //   from: -5,
          //   to: 0,
          //   color: color0,
          // },
          {
            from: 0,
            to: 15,
            color: color1,
          },
          {
            from: 15,
            to: 20,
            color: color2,
          },
          {
            from: 20,
            to: 40,
            color: color3,
          },
        ],
        labels: {
          style: {
            color: 'var(--p-text-color)',
          },
        },
      },
      xAxis: {
        type: 'datetime',
        plotLines,
        plotBands,
        labels: {
          style: {
            color: 'var(--p-text-color)',
          },
        },
      },
      legend: {
        enabled: true,
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
        },
        itemMarginBottom: 8,
        symbolWidth: 25,
      },
      plotOptions: {
        series: {
          marker: {
            enabled: false,
          },
          label: {
            connectorAllowed: false,
          },
          lineWidth: 3,
        },
      },
      series,
    };

    return options;
  }

  private crearGraficoPrediccionesTrigo(): void {
    if (this.predicciones.length === 0) {
      return;
    }

    const enfermedades = this.predicciones.map((p) => {
      return p.enfermedades!.map((e) => e.enfermedad);
    });
    const enfermedadesUnicas = [...new Set(enfermedades.flat())];

    const series: any[] = [];

    for (const enfermedad of enfermedadesUnicas) {
      series.push({
        type: 'line',
        name: enfermedad,
        data: [],
        lineWidth: 4,
        tooltip: {
          xDateFormat: '%d-%m-%Y',
          pointFormat: '<strong>{point.y}%</strong>',
          headerFormat: '<span style="font-size: 14px">{point.key}</span><br/>',
        },
        dataLabels: {
          enabled: false, // Deshabilitamos para mejor legibilidad en el gráfico expandido
        },
      });
    }

    for (const prediccion of this.predicciones) {
      if (!prediccion.fecha || !prediccion.enfermedades) {
        continue;
      }
      const fecha = new Date(prediccion.fecha).getTime();

      for (const enfermedad of prediccion.enfermedades) {
        const valor = enfermedad.resultado;

        for (const serie of series) {
          if (serie.name === enfermedad.enfermedad) {
            serie.data.push([fecha, valor]);
          }
        }
      }
    }

    const fechaActual = new Date().toISOString();
    const fechaEtapa2 = this.helper.getFechaInicioEtapaTrigo2(this.siembra!, 2, this.siembra?.crono);
    const fechaEtapa3 = this.helper.getFechaInicioEtapaTrigo2(this.siembra!, 3, this.siembra?.crono);
    const fechaEtapa4 = this.helper.getFechaInicioEtapaTrigo2(this.siembra!, 4, this.siembra?.crono);
    const fechaEtapa5 = this.helper.getFechaInicioEtapaTrigo2(this.siembra!, 5, this.siembra?.crono);
    const fechaEtapa6 = this.helper.getFechaInicioEtapaTrigo2(this.siembra!, 6, this.siembra?.crono);

    // PlotLines = Lineas verticales de inicio de etapas
    const plotLines: XAxisPlotLinesOptions[] = [];
    if (fechaEtapa2 && fechaEtapa3 && fechaEtapa4 && fechaEtapa5 && fechaEtapa6) {
      if (fechaEtapa2 <= fechaActual) {
        plotLines.push({
          color: '#f45b5b',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa2).getTime(),
          label: {
            text: this.translate.instant('Espiguilla Terminal'),
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa3 <= fechaActual) {
        plotLines.push({
          color: '#7798bf',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa3).getTime(),
          label: {
            text: this.translate.instant('Hoja Bandera'),
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa4 <= fechaActual) {
        plotLines.push({
          color: '#aaeeee',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa4).getTime(),
          label: {
            text: this.translate.instant('Espigazón'),
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa5 <= fechaActual) {
        plotLines.push({
          color: '#ff0066',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa5).getTime(),
          label: {
            text: this.translate.instant('Antesis'),
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa6 <= fechaActual) {
        plotLines.push({
          color: '#eeaaee',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa6).getTime(),
          label: {
            text: this.translate.instant('Llenado de Granos'),
          },
          zIndex: 3,
        });
      }
    }

    // PlotBands = Bandas de fumigaciones
    const fumigaciones = this.siembra?.fumigaciones;
    const plotBands = [];
    if (fumigaciones) {
      const fechasFumigaciones = fumigaciones?.map((f) => f.fechaFumigacion);

      for (const f of fechasFumigaciones) {
        plotLines.push({
          color: '#defa40',
          dashStyle: 'Dash',
          width: 3,
          value: new Date(f!).getTime(),
          label: {
            text: this.translate.instant('Fumigado'),
          },
          zIndex: 3,
        });
      }

      for (const f of fumigaciones) {
        const from = new Date(f.fechaFumigacion!).getTime();
        const to = from + (f.duracion || 15) * 24 * 60 * 60 * 1000;
        const p: Highcharts.XAxisPlotBandsOptions = {
          from,
          to,
          color: '#defa4028',
          zIndex: 2,
        };
        plotBands.push(p);
      }
    }

    this.chartOptions = this.chartBasicOptions(plotLines, plotBands, series);
  }

  private crearGraficoPrediccionesSoja(): void {
    if (this.predicciones.length === 0) {
      return;
    }

    const enfermedades = this.predicciones.map((p) => {
      return p.enfermedades!.map((e) => e.enfermedad);
    });
    const enfermedadesUnicas = [...new Set(enfermedades.flat())];

    const series: any[] = [];

    for (const enfermedad of enfermedadesUnicas) {
      series.push({
        type: 'line',
        name: enfermedad,
        data: [],
        lineWidth: 5,
        tooltip: {
          xDateFormat: '%d-%m-%Y',
          pointFormat: '<strong>{point.y} %</strong>',
        },
      });
    }

    for (const prediccion of this.predicciones) {
      if (!prediccion.fecha || !prediccion.enfermedades) {
        continue;
      }

      const fecha = new Date(prediccion.fecha).getTime();

      for (const enfermedad of prediccion.enfermedades) {
        const valor = enfermedad.resultado;

        for (const serie of series) {
          if (serie.name === enfermedad.enfermedad) {
            serie.data.push([fecha, valor]);
          }
        }
      }
    }

    const fechaActual = new Date().toISOString();
    const fechaEtapa2 = this.helper.getFechaInicioEtapaSoja2(this.siembra!, 'Emergencia', this.siembra?.crono);
    const fechaEtapa3 = this.helper.getFechaInicioEtapaSoja2(this.siembra!, 'R1', this.siembra?.crono);
    const fechaEtapa4 = this.helper.getFechaInicioEtapaSoja2(this.siembra!, 'R3', this.siembra?.crono);
    const fechaEtapa5 = this.helper.getFechaInicioEtapaSoja2(this.siembra!, 'R5', this.siembra?.crono);
    const fechaEtapa6 = this.helper.getFechaInicioEtapaSoja2(this.siembra!, 'R7', this.siembra?.crono);

    // PlotLines = Lineas verticales de inicio de etapas
    const lines: XAxisPlotLinesOptions[] = [];
    if (fechaEtapa2 && fechaEtapa3 && fechaEtapa4 && fechaEtapa5 && fechaEtapa6) {
      if (fechaEtapa2 <= fechaActual) {
        lines.push({
          color: '#f45b5b',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa2).getTime(),
          label: {
            text: ETAPAS_SOJA[1],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa3 <= fechaActual) {
        lines.push({
          color: '#7798bf',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa3).getTime(),
          label: {
            text: ETAPAS_SOJA[2],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa4 <= fechaActual) {
        lines.push({
          color: '#aaeeee',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa4).getTime(),
          label: {
            text: ETAPAS_SOJA[3],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa5 <= fechaActual) {
        lines.push({
          color: '#ff0066',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa5).getTime(),
          label: {
            text: ETAPAS_SOJA[4],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa6 <= fechaActual) {
        lines.push({
          color: '#eeaaee',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa6).getTime(),
          label: {
            text: ETAPAS_SOJA[5],
          },
          zIndex: 3,
        });
      }
    }

    // PlotBands = Bandas de fumigaciones
    const fumigaciones = this.siembra?.fumigaciones;
    const plotBands = [];
    if (fumigaciones) {
      const fechasFumigaciones = fumigaciones.map((f) => f.fechaFumigacion);

      for (const f of fechasFumigaciones) {
        lines.push({
          color: '#defa40',
          dashStyle: 'Dash',
          width: 3,
          value: new Date(f!).getTime(),
          label: {
            text: this.translate.instant('Fumigado'),
          },
          zIndex: 3,
        });
      }

      for (const f of fumigaciones) {
        const from = new Date(f.fechaFumigacion!).getTime();
        const to = from + (f.duracion || 15) * 24 * 60 * 60 * 1000;
        const p: Highcharts.XAxisPlotBandsOptions = {
          from,
          to,
          color: '#defa4028',
          zIndex: 2,
        };
        plotBands.push(p);
      }
    }

    this.chartOptions = this.chartBasicOptions(lines, plotBands, series);
  }

  private crearGraficoPrediccionesMaiz(): void {
    if (this.predicciones.length === 0) {
      return;
    }

    const enfermedades = this.predicciones.map((p) => {
      return p.enfermedades!.map((e) => e.enfermedad);
    });
    const enfermedadesUnicas = [...new Set(enfermedades.flat())];

    const series: any[] = [];

    for (const enfermedad of enfermedadesUnicas) {
      series.push({
        type: 'line',
        name: enfermedad,
        data: [],
        lineWidth: 5,
        tooltip: {
          xDateFormat: '%d-%m-%Y',
          pointFormat: '<strong>{point.y} %</strong>',
        },
      });
    }

    for (const prediccion of this.predicciones) {
      if (!prediccion.fecha || !prediccion.enfermedades) {
        continue;
      }
      const fecha = new Date(prediccion.fecha).getTime();

      for (const enfermedad of prediccion.enfermedades) {
        const valor = enfermedad.resultado;

        for (const serie of series) {
          if (serie.name === enfermedad.enfermedad) {
            serie.data.push([fecha, valor]);
          }
        }
      }
    }

    const fechaActual = new Date().toISOString();
    const fechaEtapa2 = this.helper.getFechaInicioEtapaMaiz2(this.siembra!, 'Emergencia', this.siembra?.crono);
    const fechaEtapa3 = this.helper.getFechaInicioEtapaMaiz2(this.siembra!, 'Floracion', this.siembra?.crono);
    const fechaEtapa4 = this.helper.getFechaInicioEtapaMaiz2(this.siembra!, 'Madurez', this.siembra?.crono);

    // PlotLines = Lineas verticales de inicio de etapas
    const lines: XAxisPlotLinesOptions[] = [];
    if (fechaEtapa2 && fechaEtapa3 && fechaEtapa4) {
      if (fechaEtapa2 <= fechaActual) {
        lines.push({
          color: '#f45b5b',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa2).getTime(),
          label: {
            text: ETAPAS_MAIZ[1],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa3 <= fechaActual) {
        lines.push({
          color: '#7798bf',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa3).getTime(),
          label: {
            text: ETAPAS_MAIZ[2],
          },
          zIndex: 3,
        });
      }
      if (fechaEtapa4 <= fechaActual) {
        lines.push({
          color: '#aaeeee',
          dashStyle: 'Dot',
          width: 2,
          value: new Date(fechaEtapa4).getTime(),
          label: {
            text: ETAPAS_MAIZ[3],
          },
          zIndex: 3,
        });
      }
    }

    // PlotBands = Bandas de fumigaciones
    const fumigaciones = this.siembra?.fumigaciones;
    const plotBands = [];
    if (fumigaciones) {
      const fechasFumigaciones = this.siembra?.fumigaciones?.map((f) => f.fechaFumigacion);
      if (fechasFumigaciones) {
        for (const f of fechasFumigaciones) {
          lines.push({
            color: '#defa40',
            dashStyle: 'Dash',
            width: 3,
            value: new Date(f!).getTime(),
            label: {
              text: this.translate.instant('Fumigado'),
            },
            zIndex: 3,
          });
        }
      }

      for (const f of fumigaciones) {
        const from = new Date(f.fechaFumigacion!).getTime();
        const to = from + (f.duracion || 15) * 24 * 60 * 60 * 1000;
        const p: Highcharts.XAxisPlotBandsOptions = {
          from,
          to,
          color: '#defa4028',
          zIndex: 2,
        };
        plotBands.push(p);
      }
    }

    this.chartOptions = this.chartBasicOptions(lines, plotBands, series);
  }

  private async listarPredicciones(): Promise<void> {
    if (this.siembra?._id) {
      const filter = {
        idSiembra: this.siembra._id,
      };
      const query: IQueryParam = {
        sort: 'fecha',
        filter: JSON.stringify(filter),
      };
      this.predicciones$?.unsubscribe();
      this.predicciones$ = this.listados.subscribe<IListado<IPrediccion>>('prediccions', query).subscribe((data) => {
        this.predicciones = data.datos;
        this.crearGraficoPredicciones();
        // this.calcularMaximos();
      });
      await this.listados.getLastValue('prediccions', query);
    }
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    await this.listarPredicciones();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.predicciones$?.unsubscribe();
  }
}
