import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SeriesOptionsType, XAxisPlotBandsOptions, XAxisPlotLinesOptions } from 'highcharts';
import { getUmbralesRiesgoSanitario, IListado, IPrediccion, IQueryParam } from 'modelos/src';
import { Subscription } from 'rxjs';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';
import { construirSeriesSanitariasTrigo, seleccionarSeriesVigentesTrigo } from './serie-sanitaria-trigo';

export const COLORES_SERIE_SANITARIA_TRIGO: Record<string, string> = {
  'trigo.mancha_amarilla': '#13b8ad',
  'trigo.roya_hoja': '#2f9fe5',
  'trigo.roya_anaranjada': '#e6a117',
  'trigo.mancha_hoja': '#7567d8',
  'trigo.fusarium_espiga': '#cf4f72',
};

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
export const ETAPAS_CEBADA: string[] = [
  'Siembra',
  'Emergencia',
  'Primer Nudo',
  'Hoja Bandera',
  'Espigazon',
  'Antesis',
  'Llenado de Granos',
  'Madurez Fisiologica',
];

@Component({
  selector: 'app-drawer-grafico-enfermedades',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './drawer-grafico-enfermedades.component.html',
  styleUrl: './drawer-grafico-enfermedades.component.scss',
})
export class DrawerGraficoEnfermedadesComponent implements OnInit, OnChanges, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Input() public embedded = false;
  @Input() public refreshToken = 0;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public siembra?: IDetalleSiembra;
  private predicciones$?: Subscription;
  private initialized = false;
  public predicciones: IPrediccion[] = [];

  public chartOptions?: Highcharts.Options;

  public get umbralesRiesgo(): { medio: number; alto: number } {
    return getUmbralesRiesgoSanitario(this.siembra?.semilla?.cultivo);
  }

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
    if (this.siembra?.semilla?.cultivo === 'Cebada') {
      this.crearGraficoPrediccionesCebada();
      return;
    }
  }

  private chartBasicOptions(
    plotLines: XAxisPlotLinesOptions[],
    plotBands: XAxisPlotBandsOptions[],
    series: SeriesOptionsType[],
    scale?: {
      title?: string;
      max?: number;
    }
  ) {
    // const color1 = '#dee8eb';
    // const color2 = '#aec6cf';
    // const color3 = '#7ea4b3';
    const color1 = 'rgba(54, 181, 107, 0.13)';
    const color2 = 'rgba(230, 184, 79, 0.16)';
    const color3 = 'rgba(224, 82, 70, 0.14)';
    const max = scale?.max ?? 100;
    const bajoHasta = this.umbralesRiesgo.medio;
    const medioHasta = this.umbralesRiesgo.alto;

    const options: Highcharts.Options = {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: 'var(--p-text-color)',
        },
        spacing: this.embedded ? [12, 14, 12, 10] : [22, 22, 18, 18],
      },
      title: {
        text: this.embedded ? undefined : scale?.title || this.translate.instant('Evolucion de salidas sanitarias'),
        align: 'left',
      },
      subtitle: {
        text: this.embedded
          ? undefined
          : this.translate.instant(
              'Valor calculado por cada modelo; no equivale por si solo a presencia o probabilidad de enfermedad.'
            ),
        align: 'left',
      },
      yAxis: {
        max,
        min: 0,
        title: {
          text: this.translate.instant('Valor calculado (%)'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '13px',
            fontWeight: '700',
          },
        },
        plotBands: [
          {
            from: 0,
            to: bajoHasta,
            color: color1,
          },
          {
            from: bajoHasta,
            to: medioHasta,
            color: color2,
          },
          {
            from: medioHasta,
            to: max,
            color: color3,
          },
        ],
        labels: {
          style: {
            color: 'var(--p-text-color)',
            fontSize: '12px',
            fontWeight: '650',
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
            fontSize: '12px',
            fontWeight: '650',
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
      tooltip: {
        shared: true,
        xDateFormat: '%d/%m/%Y',
      },
      plotOptions: {
        series: {
          marker: {
            enabled: false,
          },
          label: {
            connectorAllowed: false,
          },
          lineWidth: 2.5,
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

    const series: any[] = seleccionarSeriesVigentesTrigo(construirSeriesSanitariasTrigo(this.predicciones)).map(
      (serie) => {
        return {
          type: 'line',
          id: `${serie.idEnfermedad}-${serie.versionEtiqueta}`,
          name: serie.nombre,
          color: COLORES_SERIE_SANITARIA_TRIGO[serie.idEnfermedad] || '#64748b',
          data: serie.data,
          connectNulls: false,
          lineWidth: 4,
          dashStyle: 'Solid',
          opacity: 1,
          showInLegend: true,
          custom: {
            idEnfermedad: serie.idEnfermedad,
            version: serie.versionEtiqueta,
            tieneLecturas: serie.tieneLecturas,
          },
          tooltip: {
            xDateFormat: '%d-%m-%Y',
            pointFormat: '<span>{series.name}</span><br/><strong>{point.y}%</strong>',
            headerFormat: '<span style="font-size: 14px">{point.key}</span><br/>',
          },
          dataLabels: {
            enabled: false,
          },
        };
      }
    );

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
    if (!this.embedded) {
      this.chartOptions.subtitle = {
        text: this.translate.instant(
          'Cada version del motor se muestra por separado. Los cortes indican dias fuera de ventana, sin datos o con calidad insuficiente.'
        ),
        align: 'left',
      };
    }
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

  private crearGraficoPrediccionesCebada(): void {
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
          enabled: false,
        },
      });
    }

    for (const prediccion of this.predicciones) {
      if (!prediccion.fecha || !prediccion.enfermedades) {
        continue;
      }
      const fecha = new Date(prediccion.fecha).getTime();

      for (const enfermedad of prediccion.enfermedades) {
        for (const serie of series) {
          if (serie.name === enfermedad.enfermedad) {
            serie.data.push([fecha, enfermedad.resultado]);
          }
        }
      }
    }

    const fechaActual = new Date().toISOString();
    const hitos = [
      {
        fecha: this.helper.getFechaInicioEtapaCebada2(this.siembra!, 'Primer Nudo', this.siembra?.crono),
        texto: ETAPAS_CEBADA[2],
        color: '#f45b5b',
      },
      {
        fecha: this.helper.getFechaInicioEtapaCebada2(this.siembra!, 'Hoja Bandera', this.siembra?.crono),
        texto: ETAPAS_CEBADA[3],
        color: '#7798bf',
      },
      {
        fecha: this.helper.getFechaInicioEtapaCebada2(this.siembra!, 'Espigazon', this.siembra?.crono),
        texto: ETAPAS_CEBADA[4],
        color: '#aaeeee',
      },
      {
        fecha: this.helper.getFechaInicioEtapaCebada2(this.siembra!, 'Antesis', this.siembra?.crono),
        texto: ETAPAS_CEBADA[5],
        color: '#ff0066',
      },
      {
        fecha: this.helper.getFechaInicioEtapaCebada2(this.siembra!, 'Llenado de Granos', this.siembra?.crono),
        texto: ETAPAS_CEBADA[6],
        color: '#eeaaee',
      },
    ];

    const lines: XAxisPlotLinesOptions[] = [];
    for (const hito of hitos) {
      if (hito.fecha && hito.fecha <= fechaActual) {
        lines.push({
          color: hito.color,
          dashStyle: 'Dot',
          width: 2,
          value: new Date(hito.fecha).getTime(),
          label: {
            text: this.translate.instant(hito.texto),
          },
          zIndex: 3,
        });
      }
    }

    const fumigaciones = this.siembra?.fumigaciones;
    const plotBands: XAxisPlotBandsOptions[] = [];
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
        plotBands.push({
          from,
          to,
          color: '#defa4028',
          zIndex: 2,
        });
      }
    }

    this.chartOptions = this.chartBasicOptions(lines, plotBands, series, {
      title: this.translate.instant('Evolucion de riesgo sanitario - Cebada'),
      max: 100,
    });
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
    this.initialized = true;
    this.loading = true;
    await this.listarPredicciones();
    this.loading = false;
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.initialized || !changes['refreshToken'] || changes['refreshToken'].firstChange) return;

    this.loading = true;
    await this.listarPredicciones();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.predicciones$?.unsubscribe();
  }
}
