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
import {
  construirSeriesSanitariasHistoricas,
  escaparTextoSanitario,
  unidadSerieSanitaria,
} from './serie-sanitaria-historica';

export const COLORES_SERIE_SANITARIA_TRIGO: Record<string, string> = {
  'trigo.mancha_amarilla': '#13b8ad',
  'trigo.roya_hoja': '#2f9fe5',
  'trigo.roya_anaranjada': '#e6a117',
  'trigo.mancha_hoja': '#7567d8',
  'trigo.fusarium_espiga': '#cf4f72',
};

const COLORES_CEBADA: Record<string, string> = {
  'cebada.mancha_red': '#13b8ad',
  'cebada.escaldadura': '#2f9fe5',
  'cebada.roya_hoja': '#36b56b',
  'cebada.fusariosis_espiga': '#e6b84f',
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
  public seriesSinLecturas: { nombre: string; estado: string }[] = [];

  public get mostrarUmbrales(): boolean {
    // Cebada reúne índices diarios y de ventana, además de versiones históricas.
    // Una única banda de riesgo daría a entender que son equivalentes.
    return this.siembra?.semilla?.cultivo !== 'Cebada';
  }

  public get umbralesRiesgo(): { medio: number; alto: number } {
    return getUmbralesRiesgoSanitario(this.siembra?.semilla?.cultivo);
  }

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private translate: TranslateService
  ) {}

  private crearGraficoPredicciones(): void {
    this.seriesSinLecturas = [];
    this.chartOptions = undefined;
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
    const componente = this;

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
          text: this.translate.instant('Escala del indicador (0–100)'),
          style: {
            color: 'var(--p-text-color)',
            fontSize: '13px',
            fontWeight: '700',
          },
        },
        plotBands: this.mostrarUmbrales
          ? [
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
            ]
          : [],
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
        useHTML: true,
        style: { whiteSpace: 'normal', width: 280 },
        formatter: function () {
          const punto = this.points?.[0] || this;
          return componente.formatearTooltip(Number(this.x), punto.series.chart.series);
        },
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
          connectNulls: false,
          dashStyle: 'Solid',
        },
      },
      series,
    };

    return options;
  }

  private formatearTooltip(fecha: number, series: Highcharts.Series[]): string {
    const idioma = this.translate.currentLang === 'br' ? 'pt-BR' : this.translate.currentLang || 'es-AR';
    const numero = new Intl.NumberFormat(idioma, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const dia = new Intl.DateTimeFormat(idioma, { timeZone: 'UTC' }).format(fecha);
    const filas = series
      .filter((serie) => serie.visible)
      .flatMap((serie) => {
        const meta = serie.options.custom || {};
        if (
          (meta['desde'] !== undefined && fecha < meta['desde']) ||
          (meta['hasta'] !== undefined && fecha > meta['hasta'])
        )
          return [];
        const punto = serie.data.find((p) => p.x === fecha);
        if (!punto) return [];
        const detalle = punto.options.custom || {};
        const estado = detalle['estado'];
        const valor =
          estado === 'fuera_ventana'
            ? this.translate.instant('Fuera de ventana')
            : punto.y === null || punto.y === undefined
              ? this.translate.instant('Sin datos')
              : `${numero.format(punto.y)} ${this.translate.instant(meta['unidad'] || '/100')}`;
        const calidad = detalle['calidad'] === 'baja' ? ` · ${this.translate.instant('Datos a revisar')}` : '';
        return [
          `<div style="margin-top:8px"><span>${escaparTextoSanitario(serie.name)}</span><br/><strong>${escaparTextoSanitario(valor)}</strong>${escaparTextoSanitario(calidad)}</div>`,
        ];
      });
    return `<div style="max-width:260px;white-space:normal"><strong>${escaparTextoSanitario(dia)}</strong>${filas.join('')}</div>`;
  }

  private crearSeriesHistoricas(): SeriesOptionsType[] {
    const historicas = construirSeriesSanitariasHistoricas(this.predicciones);
    const colores = new Map<string, string>();
    const paleta = ['#13b8ad', '#2f9fe5', '#36b56b', '#e6b84f', '#7567d8'];
    this.seriesSinLecturas = [];
    return historicas.map((serie) => {
      const hermanas = historicas.filter((s) => s.idEnfermedad === serie.idEnfermedad);
      const ultima = Math.max(...hermanas.map((s) => s.hasta || 0));
      const tieneLecturas = serie.data.some((p) => p.y !== null);
      if (!tieneLecturas && serie.hasta === ultima) {
        const estado = serie.data.find((p) => p.x === serie.hasta)?.custom.estado;
        this.seriesSinLecturas.push({
          nombre: serie.nombre,
          estado: estado === 'fuera_ventana' ? 'Fuera de ventana' : 'Sin datos',
        });
      }
      if (!colores.has(serie.idEnfermedad))
        colores.set(serie.idEnfermedad, COLORES_CEBADA[serie.idEnfermedad] || paleta[colores.size % paleta.length]);
      return {
        type: 'line',
        id: `${serie.idEnfermedad}-${serie.versionEtiqueta}`,
        name: hermanas.length > 1 ? `${serie.nombre} · ${serie.versionEtiqueta}` : serie.nombre,
        color: colores.get(serie.idEnfermedad),
        data: serie.data,
        connectNulls: false,
        lineWidth: 4,
        dashStyle: 'Solid',
        marker: { enabled: serie.data.filter((p) => p.y !== null).length === 1, radius: 3 },
        custom: {
          idEnfermedad: serie.idEnfermedad,
          version: serie.versionEtiqueta,
          desde: serie.desde,
          hasta: serie.hasta,
          unidad: '/100',
        },
      };
    });
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
            unidad: unidadSerieSanitaria(serie.idEnfermedad, serie.version),
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

    const series = this.crearSeriesHistoricas();

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

    const series = this.crearSeriesHistoricas();

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

    const series = this.crearSeriesHistoricas();

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
