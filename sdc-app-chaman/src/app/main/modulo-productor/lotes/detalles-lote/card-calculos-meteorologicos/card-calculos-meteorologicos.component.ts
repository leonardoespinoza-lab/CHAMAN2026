import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  IRespuestaAgrometeorologiaSiembra,
  IResumenAgrometeorologico,
  ISerieAgrometeorologicaDia,
  ISiembra,
} from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';

type Periodo = 7 | 30 | 90 | 'ciclo';
type Grafico = 'termico' | 'agua' | 'atmosfera' | 'radiacion' | 'suelo';

interface MetricaResumen {
  label: string;
  value: string;
  detail: string;
  tone: 'thermal' | 'water' | 'atmosphere' | 'neutral';
}

@Component({
  selector: 'app-card-calculos-meteorologicos',
  imports: [CommonModule, ChartComponent],
  templateUrl: './card-calculos-meteorologicos.component.html',
  styleUrl: './card-calculos-meteorologicos.component.scss',
})
export class CardCalculosMeteorologicosComponent implements OnChanges {
  private readonly siembraService = inject(SiembraService);

  @Input() siembra?: ISiembra;

  public loading = false;
  public error?: string;
  public data?: IRespuestaAgrometeorologiaSiembra;
  public periodo: Periodo = 30;
  public grafico: Grafico = 'termico';
  public chartOptions?: Highcharts.Options;
  public metricas: MetricaResumen[] = [];

  public readonly periodos: Array<{ label: string; value: Periodo }> = [
    { label: '7 dias', value: 7 },
    { label: '30 dias', value: 30 },
    { label: '90 dias', value: 90 },
    { label: 'Ciclo vigente', value: 'ciclo' },
  ];

  public readonly graficos: Array<{ label: string; value: Grafico; icon: string }> = [
    { label: 'Termico', value: 'termico', icon: 'pi pi-sun' },
    { label: 'Agua', value: 'agua', icon: 'pi pi-chart-bar' },
    { label: 'Atmosfera', value: 'atmosfera', icon: 'pi pi-cloud' },
    { label: 'Radiacion y ET', value: 'radiacion', icon: 'pi pi-bolt' },
    { label: 'Suelo', value: 'suelo', icon: 'pi pi-database' },
  ];

  private requestKey = '';

  public get mostrarSuelo(): boolean {
    return !!this.data?.series.some(
      (dia) =>
        this.esNumero(dia.metrics.rootZoneSoilMoistureM3M3) ||
        this.esNumero(dia.metrics.rootZoneSoilTemperatureC) ||
        this.esNumero(dia.metrics.availableWaterPercentage)
    );
  }

  public get graficoLabel(): string {
    return this.graficos.find((item) => item.value === this.grafico)?.label || 'Seguimiento meteorologico';
  }

  public get fuenteLabel(): string {
    switch (this.data?.dataSource.type) {
      case 'station':
        return this.data.dataSource.stationName || 'Central meteorologica';
      case 'mixed':
        return `${this.data.dataSource.stationName || 'Central'} + Open-Meteo`;
      case 'open_meteo':
        return 'Open-Meteo';
      default:
        return 'Sin fuente disponible';
    }
  }

  public get fuenteDetail(): string {
    if (!this.data) return '';
    const completitud = this.numero(this.data.dataSource.completenessPercentage, 0);
    const actualizacion = this.fechaHora(this.data.dataSource.lastCalculatedAt);
    return `${completitud}% de cobertura de variables${actualizacion ? ` - actualizado ${actualizacion}` : ''}`;
  }

  public get historialLabel(): string {
    switch (this.data?.dataSource.type) {
      case 'station':
        return 'Medido';
      case 'mixed':
        return 'Historico mixto';
      case 'open_meteo':
        return 'Reanalisis modelado';
      default:
        return 'Historico';
    }
  }

  public get sueloTieneSensor(): boolean {
    return !!this.data?.series.some((dia) =>
      [dia.sourceByVariable.soilMoistureM3M3, dia.sourceByVariable.soilTemperatureC].some(
        (source) => String(source || '').includes('station') || source === 'mixed'
      )
    );
  }

  public get sueloModelado(): boolean {
    return !!this.data?.series.some((dia) =>
      [dia.sourceByVariable.soilMoistureM3M3, dia.sourceByVariable.soilTemperatureC].some(
        (source) => String(source || '').includes('open_meteo') || source === 'mixed'
      )
    );
  }

  public get sueloSubtitle(): string {
    if (this.sueloTieneSensor && this.sueloModelado) {
      return 'Sensor del lote prioritario; Open-Meteo completa las capas ausentes';
    }
    if (this.sueloTieneSensor) return 'Lecturas de sensores asociados al lote';
    if (this.sueloModelado) {
      return 'Modelo de suelo Open-Meteo por capas; no reemplaza una sonda en el lote';
    }
    return 'Balance hidrico estimado; requiere validacion con medicion de campo';
  }

  public get hayDatos(): boolean {
    return !!this.data?.series.length;
  }

  public get advertenciaFuente(): string | undefined {
    return this.data?.warnings.find((warning) =>
      /central asociada|central meteorologica|Open-Meteo automaticamente/i.test(warning)
    );
  }

  public get estadosSerie(): string[] {
    const series = this.data?.series || [];
    const states: string[] = [];
    if (series.some((dia) => !dia.isForecast && (String(dia.source).includes('station') || dia.source === 'mixed'))) {
      states.push('Observado');
    }
    if (
      series.some(
        (dia) =>
          !dia.isForecast &&
          (String(dia.source).includes('open_meteo') || dia.source === 'mixed' || dia.source === 'gap_filled')
      )
    ) {
      states.push('Estimado');
    }
    if (series.some((dia) => dia.isForecast)) states.push('Pronostico');
    return states;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siembra']) {
      this.periodo = 30;
      this.grafico = 'termico';
      void this.cargar();
    }
  }

  public async cambiarPeriodo(periodo: Periodo): Promise<void> {
    if (this.periodo === periodo) return;
    this.periodo = periodo;
    await this.cargar();
  }

  public cambiarGrafico(grafico: Grafico): void {
    if (grafico === 'suelo' && !this.mostrarSuelo) return;
    this.grafico = grafico;
    this.chartOptions = this.crearGrafico();
  }

  public async cargar(force = false): Promise<void> {
    const id = this.siembra?._id;
    if (!id) {
      this.data = undefined;
      return;
    }

    const desde = this.desdePeriodo();
    const key = `${id}|${desde || 'ciclo'}`;
    if (!force && key === this.requestKey && this.data) return;

    this.loading = true;
    this.error = undefined;
    try {
      this.data = await this.siembraService.agrometeorologia(id, desde);
      this.requestKey = key;
      if (this.grafico === 'suelo' && !this.mostrarSuelo) this.grafico = 'termico';
      this.prepararVista();
    } catch (error: any) {
      this.data = undefined;
      this.error = error?.error?.message || error?.message || 'No se pudieron leer los calculos meteorologicos.';
    } finally {
      this.loading = false;
    }
  }

  private prepararVista(): void {
    const r = this.data?.summary;
    const detalleGdd = r ? this.detalleGdd(r) : '';
    this.metricas = !r
      ? []
      : [
          {
            label: 'Grados dia cerrados',
            value: this.valor(r.gddAccumulated, 'GDD', 0),
            detail: detalleGdd,
            tone: 'thermal',
          },
          {
            label: 'Lluvia acumulada',
            value: this.valor(r.rainAccumulatedMm, 'mm'),
            detail: 'Precipitacion del ciclo',
            tone: 'water',
          },
          {
            label: 'ET del cultivo',
            value: this.valor(r.etcAccumulatedMm, 'mm'),
            detail: `ET0 ${this.valor(r.et0AccumulatedMm, 'mm')}`,
            tone: 'water',
          },
          {
            label: 'Agua disponible',
            value: this.valor(r.availableWaterPercentage, '%', 0),
            detail: `Deficit ${this.valor(r.waterDeficitMm, 'mm')}${this.sueloTieneSensor ? '' : ' · modelo sin sonda'}`,
            tone: 'water',
          },
          {
            label: 'VPD actual',
            value: this.valor(r.vpdMeanKpa, 'kPa', 2),
            detail: 'Demanda atmosferica media',
            tone: 'atmosphere',
          },
          {
            label: 'Fotoperiodo',
            value: this.valor(r.currentPhotoperiodHours, 'h', 1),
            detail: 'Duracion astronomica del dia',
            tone: 'neutral',
          },
        ];
    this.chartOptions = this.crearGrafico();
  }

  private crearGrafico(): Highcharts.Options | undefined {
    const serie = this.data?.series || [];
    if (!serie.length) return undefined;
    switch (this.grafico) {
      case 'agua':
        return this.graficoAgua(serie);
      case 'atmosfera':
        return this.graficoAtmosfera(serie);
      case 'radiacion':
        return this.graficoRadiacion(serie);
      case 'suelo':
        return this.graficoSuelo(serie);
      default:
        return this.graficoTermico(serie);
    }
  }

  private graficoTermico(dias: ISerieAgrometeorologicaDia[]): Highcharts.Options {
    return this.baseChart(
      dias,
      'Temperatura y tiempo termico',
      'Evolucion diaria; el tramo punteado corresponde al pronostico',
      [
        this.linea('Temp min', dias, (d) => d.metrics.temperatureMinC, '#2d9bf0', 0, ' C'),
        this.linea('Temp media', dias, (d) => d.metrics.temperatureMeanC, '#18a999', 0, ' C'),
        this.linea('Temp max', dias, (d) => d.metrics.temperatureMaxC, '#ef6c55', 0, ' C'),
        this.linea('GDD acumulado', dias, (d) => d.metrics.gddAccumulated, '#7a64d1', 1, ' GDD'),
        this.eventos(
          'Helada',
          dias,
          (d) => d.metrics.frostDay,
          (d) => d.metrics.temperatureMinC,
          '#2679c9'
        ),
        this.eventos(
          'Estres termico',
          dias,
          (d) => d.metrics.thermalStressDay,
          (d) => d.metrics.temperatureMaxC,
          '#d84332'
        ),
      ],
      [this.eje('Temperatura (C)'), this.eje('GDD acumulado', true, 0)]
    );
  }

  private graficoAgua(dias: ISerieAgrometeorologicaDia[]): Highcharts.Options {
    return this.baseChart(
      dias,
      'Balance hidrico diario',
      'Lluvia y riego frente a demanda del cultivo y deficit estimado',
      [
        this.columnas('Lluvia', dias, (d) => d.metrics.precipitationMm, '#54c4bc', 0, ' mm'),
        this.columnas('Riego registrado', dias, (d) => d.metrics.irrigationMm, '#52a7f2', 0, ' mm'),
        this.linea('ET0', dias, (d) => d.metrics.et0Mm, '#f0a33b', 0, ' mm'),
        this.linea('ET cultivo', dias, (d) => d.metrics.etcMm, '#ef6c55', 0, ' mm'),
        this.linea('Deficit', dias, (d) => d.metrics.waterDeficitMm, '#7a64d1', 1, ' mm'),
        this.linea('Agua disponible', dias, (d) => d.metrics.availableWaterPercentage, '#18a999', 2, ' %'),
      ],
      [
        this.eje('Flujo diario (mm)', false, 0),
        this.eje('Deficit (mm)', true, 0),
        this.eje('Agua disponible (%)', true, 0, 100, false),
      ]
    );
  }

  private graficoAtmosfera(dias: ISerieAgrometeorologicaDia[]): Highcharts.Options {
    return this.baseChart(
      dias,
      'Humedad y demanda atmosferica',
      'Humedad relativa, VPD y horas estimadas de mojado foliar',
      [
        this.linea('HR media', dias, (d) => d.metrics.relativeHumidityMeanPct, '#2d9bf0', 0, ' %'),
        this.linea('VPD medio', dias, (d) => d.metrics.vpdMeanKpa, '#ef6c55', 1, ' kPa'),
        this.linea('VPD max', dias, (d) => d.metrics.vpdMaxKpa, '#f0a33b', 1, ' kPa'),
        this.columnas('Mojado foliar', dias, (d) => d.metrics.leafWetnessHours, '#9ee2c9', 2, ' h'),
      ],
      [
        this.eje('Humedad relativa (%)', false, 0, 100),
        this.eje('VPD (kPa)', true, 0),
        this.eje('Mojado (h)', true, 0, 24, false),
      ]
    );
  }

  private graficoRadiacion(dias: ISerieAgrometeorologicaDia[]): Highcharts.Options {
    const acumulado = this.periodo === 'ciclo';
    return this.baseChart(
      dias,
      'Radiacion, fotoperiodo y evapotranspiracion',
      'Energia disponible y demanda atmosferica del cultivo',
      [
        acumulado
          ? this.linea(
              'Radiacion acumulada',
              dias,
              (d) => d.metrics.solarRadiationAccumulatedMjM2,
              '#f2c14e',
              0,
              ' MJ/m2'
            )
          : this.columnas('Radiacion', dias, (d) => d.metrics.solarRadiationMjM2, '#f2c14e', 0, ' MJ/m2'),
        this.linea('Fotoperiodo', dias, (d) => d.metrics.photoperiodHours, '#7a64d1', 1, ' h'),
        this.linea(
          acumulado ? 'ET0 acumulada' : 'ET0',
          dias,
          (d) => (acumulado ? d.metrics.et0AccumulatedMm : d.metrics.et0Mm),
          '#f0a33b',
          2,
          ' mm'
        ),
        this.linea(
          acumulado ? 'ET cultivo acumulada' : 'ET cultivo',
          dias,
          (d) => (acumulado ? d.metrics.etcAccumulatedMm : d.metrics.etcMm),
          '#ef6c55',
          2,
          ' mm'
        ),
      ],
      [
        this.eje('Radiacion (MJ/m2)', false, 0),
        this.eje('Fotoperiodo (h)', true, 0),
        this.eje('ET (mm)', true, 0, undefined, false),
      ]
    );
  }

  private graficoSuelo(dias: ISerieAgrometeorologicaDia[]): Highcharts.Options {
    const moistureDepths = [...new Set(dias.flatMap((dia) => Object.keys(dia.metrics.soilMoistureM3M3 || {})))];
    const temperatureDepths = [...new Set(dias.flatMap((dia) => Object.keys(dia.metrics.soilTemperatureC || {})))];
    const palette = ['#2d9bf0', '#18a999', '#7a64d1', '#4d839f'];
    const depthSeries: Highcharts.SeriesOptionsType[] = [
      ...moistureDepths
        .slice(0, 4)
        .map((depth, index) =>
          this.linea(
            `Humedad ${depth} cm`,
            dias,
            (d) => d.metrics.soilMoistureM3M3?.[depth],
            palette[index],
            0,
            ' m3/m3'
          )
        ),
      ...temperatureDepths
        .slice(0, 4)
        .map((depth, index) =>
          this.linea(
            `Temp ${depth} cm`,
            dias,
            (d) => d.metrics.soilTemperatureC?.[depth],
            ['#ef6c55', '#f0a33b', '#bd6a4a', '#805f47'][index],
            2,
            ' C'
          )
        ),
    ];
    return this.baseChart(
      dias,
      'Estado estimado de la zona radicular',
      this.sueloSubtitle,
      [
        ...depthSeries,
        ...(moistureDepths.length
          ? []
          : [
              this.linea(
                'Humedad zona radicular',
                dias,
                (d) => d.metrics.rootZoneSoilMoistureM3M3,
                '#2d9bf0',
                0,
                ' m3/m3'
              ),
            ]),
        this.linea('Agua disponible', dias, (d) => d.metrics.availableWaterPercentage, '#18a999', 1, ' %'),
        ...(temperatureDepths.length
          ? []
          : [this.linea('Temp zona radicular', dias, (d) => d.metrics.rootZoneSoilTemperatureC, '#ef6c55', 2, ' C')]),
      ],
      [
        this.eje('Humedad (m3/m3)', false, 0),
        this.eje('Agua disponible (%)', true, 0, 100),
        this.eje('Temperatura (C)', true, undefined, undefined, false),
      ]
    );
  }

  private baseChart(
    dias: ISerieAgrometeorologicaDia[],
    titulo: string,
    subtitulo: string,
    series: Highcharts.SeriesOptionsType[],
    yAxis: Highcharts.YAxisOptions[]
  ): Highcharts.Options {
    const firstForecast = dias.findIndex((dia) => dia.isForecast);
    const todayIndex = dias.findIndex((dia) => dia.date === new Date().toISOString().slice(0, 10));
    const plotLines: Highcharts.XAxisPlotLinesOptions[] = [];
    if (todayIndex >= 0) {
      plotLines.push({
        value: todayIndex,
        color: '#15877b',
        width: 1.5,
        zIndex: 5,
        label: { text: 'Hoy', rotation: 0, y: -7, style: { color: '#15877b', fontSize: '11px', fontWeight: '700' } },
      });
    }
    if (firstForecast >= 0) {
      plotLines.push({
        value: firstForecast - 0.5,
        color: '#78909c',
        width: 1,
        dashStyle: 'Dash',
        zIndex: 4,
        label: { text: 'Pronostico', rotation: 0, y: 12, style: { color: '#5f7181', fontSize: '11px' } },
      });
    }
    return {
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        spacing: [20, 24, 14, 18],
        zooming: { type: 'x' },
      },
      title: { text: titulo, align: 'left', style: { fontSize: '15px', fontWeight: '800' } },
      subtitle: { text: subtitulo, align: 'left', style: { fontSize: '12px' } },
      xAxis: {
        categories: dias.map((dia) => this.fechaCorta(dia.date)),
        crosshair: true,
        lineWidth: 0,
        tickLength: 0,
        plotLines,
        plotBands: this.bandasFenologicas(dias),
        labels: {
          step: Math.max(1, Math.ceil(dias.length / 12)),
          style: { color: '#607286', fontSize: '11px', fontWeight: '600' },
        },
      },
      yAxis,
      series,
      tooltip: {
        shared: true,
        useHTML: true,
        formatter: function () {
          const context = this as any;
          const index = Number(context.x);
          const dia = dias[index];
          const cabecera = `<strong>${dia?.date || context.key}</strong>${dia?.stage ? `<br><span>Etapa: ${dia.stage}</span>` : ''}`;
          const filas = (context.points || [])
            .map((point: any) => {
              const value = Number(point.y).toLocaleString('es-AR', {
                maximumFractionDigits: 2,
              });
              return `<br><span style="color:${point.color}">&#9679;</span> ${point.series.name}: <b>${value}</b>${point.series.userOptions?.custom?.suffix || ''}`;
            })
            .join('');
          return `${cabecera}${filas}`;
        },
      },
      legend: {
        align: 'center',
        verticalAlign: 'bottom',
        layout: 'horizontal',
        margin: 16,
        itemDistance: 16,
        itemMarginBottom: 5,
        navigation: { enabled: true },
      },
      plotOptions: {
        series: {
          connectNulls: false,
          turboThreshold: 0,
          lineWidth: 2.3,
          marker: { enabled: dias.length <= 45, radius: 2.4 },
          states: { hover: { lineWidthPlus: 0.5 }, inactive: { opacity: 0.42 } },
        },
        column: { borderWidth: 0, borderRadius: 3, groupPadding: 0.08, pointPadding: 0.06 },
      },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 700 },
            chartOptions: {
              chart: { spacing: [18, 10, 16, 10] },
              title: { style: { fontSize: '14px' } },
              subtitle: { style: { fontSize: '11px' } },
              xAxis: {
                labels: {
                  step: Math.max(1, Math.ceil(dias.length / 6)),
                  style: { color: '#607286', fontSize: '10px', fontWeight: '600' },
                },
              },
              legend: {
                itemDistance: 10,
                itemStyle: { fontSize: '11px' },
                symbolWidth: 16,
              },
            },
          },
        ],
      },
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private linea(
    name: string,
    dias: ISerieAgrometeorologicaDia[],
    valor: (dia: ISerieAgrometeorologicaDia) => number | undefined,
    color: string,
    yAxis: number,
    suffix: string
  ): Highcharts.SeriesLineOptions {
    const firstForecast = dias.findIndex((dia) => dia.isForecast);
    return {
      name,
      type: 'line',
      color,
      yAxis,
      data: dias.map((dia) => (this.esNumero(valor(dia)) ? Number(valor(dia)) : null)),
      zoneAxis: 'x',
      zones: firstForecast >= 0 ? [{ value: firstForecast, dashStyle: 'Solid' }, { dashStyle: 'Dash' }] : undefined,
      custom: { suffix },
    } as Highcharts.SeriesLineOptions;
  }

  private eventos(
    name: string,
    dias: ISerieAgrometeorologicaDia[],
    active: (dia: ISerieAgrometeorologicaDia) => boolean | undefined,
    value: (dia: ISerieAgrometeorologicaDia) => number | undefined,
    color: string
  ): Highcharts.SeriesScatterOptions {
    return {
      name,
      type: 'scatter',
      color,
      yAxis: 0,
      data: dias.map((dia, index) =>
        active(dia) && this.esNumero(value(dia)) ? { x: index, y: Number(value(dia)) } : null
      ),
      marker: { enabled: true, radius: 5, symbol: 'triangle' },
      custom: { suffix: ' C' },
    } as Highcharts.SeriesScatterOptions;
  }

  private columnas(
    name: string,
    dias: ISerieAgrometeorologicaDia[],
    valor: (dia: ISerieAgrometeorologicaDia) => number | undefined,
    color: string,
    yAxis: number,
    suffix: string
  ): Highcharts.SeriesColumnOptions {
    return {
      name,
      type: 'column',
      color,
      yAxis,
      data: dias.map((dia) => ({
        y: this.esNumero(valor(dia)) ? Number(valor(dia)) : null,
        color: dia.isForecast ? `${color}88` : color,
      })),
      custom: { suffix },
    } as Highcharts.SeriesColumnOptions;
  }

  private eje(title: string, opposite = false, min?: number, max?: number, visible = true): Highcharts.YAxisOptions {
    return {
      opposite,
      min,
      max,
      visible,
      gridLineColor: 'rgba(119, 150, 180, 0.16)',
      labels: { style: { color: '#607286', fontSize: '11px' } },
      title: { text: title, style: { color: '#33485c', fontSize: '11px', fontWeight: '700' } },
    };
  }

  private bandasFenologicas(dias: ISerieAgrometeorologicaDia[]): Highcharts.XAxisPlotBandsOptions[] {
    const bands: Highcharts.XAxisPlotBandsOptions[] = [];
    let start = 0;
    for (let i = 1; i <= dias.length; i++) {
      if (i === dias.length || dias[i]?.stage !== dias[start]?.stage) {
        const stage = dias[start]?.stage;
        if (stage) {
          bands.push({
            from: start - 0.5,
            to: i - 0.5,
            color: bands.length % 2 ? 'rgba(24,169,153,0.035)' : 'rgba(24,169,153,0.075)',
            label: {
              text: stage,
              align: 'center',
              y: 14,
              style: { color: '#317269', fontSize: '10px', fontWeight: '700' },
            },
          });
        }
        start = i;
      }
    }
    return bands;
  }

  private desdePeriodo(): string | undefined {
    if (this.periodo === 'ciclo') return this.siembra?.fechaSiembra;
    const date = new Date();
    date.setDate(date.getDate() - Number(this.periodo) + 1);
    return date.toISOString().slice(0, 10);
  }

  private valor(valor: number | undefined, unidad: string, decimales = 1): string {
    return this.esNumero(valor) ? `${this.numero(valor, decimales)} ${unidad}` : 'Sin dato';
  }

  private numero(valor: number | undefined, decimales = 1): string {
    if (!this.esNumero(valor)) return '-';
    return Number(valor).toLocaleString('es-AR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });
  }

  private fechaCorta(fecha: string): string {
    const date = new Date(`${fecha}T12:00:00`);
    if (Number.isNaN(date.getTime())) return fecha;
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${date.getDate()} ${meses[date.getMonth()]}`;
  }

  private fechaHora(fecha?: string): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private detalleGdd(resumen: IResumenAgrometeorologico): string {
    const partes = [
      resumen.gddThroughDate
        ? `Cerrado al ${this.fechaCorta(resumen.gddThroughDate)}`
        : 'Sin incluir el pronostico',
    ];
    if (this.esNumero(resumen.gddBaseTemperatureC)) {
      partes.push(`Tb ${this.numero(resumen.gddBaseTemperatureC, 0)} C`);
    }
    if (this.esNumero(resumen.gddUpperTemperatureC)) {
      partes.push(`techo ${this.numero(resumen.gddUpperTemperatureC, 0)} C`);
    }
    return partes.join(' · ');
  }

  private esNumero(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor);
  }
}
