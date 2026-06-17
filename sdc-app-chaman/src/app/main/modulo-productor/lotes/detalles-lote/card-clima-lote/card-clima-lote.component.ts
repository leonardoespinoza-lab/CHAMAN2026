import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import { IClimaEstacionMeteorologica, IPronosticoEstacionMeteorologica } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

interface MetricClima {
  label: string;
  value: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'info';
  fill?: number;
}

interface DiaClima {
  fecha?: string;
  label: string;
  estado: string;
  temp: string;
  humedad: string;
  lluvia: string;
  probabilidad: string;
  viento: string;
  et0: string;
  vpd: string;
  lluviaPct: number;
  humedadPct: number;
}

interface SerieClima {
  label: string;
  color: string;
  valores: Array<number | null>;
  tipo?: 'spline' | 'column';
  unidad?: string;
  yAxis?: number;
  decimales?: number;
}

interface PanelClima {
  titulo: string;
  subtitulo: string;
  options: Highcharts.Options;
}

@Component({
  selector: 'app-card-clima-lote',
  imports: [CommonModule, SharedModule, ChartComponent],
  templateUrl: './card-clima-lote.component.html',
  styleUrl: './card-clima-lote.component.scss',
})
export class CardClimaLoteComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;

  public pronosticos: IPronosticoEstacionMeteorologica[] = [];
  public climaActual?: IClimaEstacionMeteorologica;
  public fuente = 'Open-Meteo';
  public metricas: MetricClima[] = [];
  public dias: DiaClima[] = [];
  public paneles: PanelClima[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.prepararVista();
    }
  }

  private prepararVista(): void {
    this.pronosticos = this.lote?.establecimiento?.prediccionClimatica?.pronosticos?.slice(0, 7) || [];
    this.climaActual = this.lote?.establecimiento?.climaActual?.clima;
    this.fuente = this.pronosticos[0]?.fuente || this.climaActual?.fuente || 'Open-Meteo';
    this.metricas = this.crearMetricas();
    this.dias = this.crearDias();
    this.paneles = this.crearPaneles();
  }

  private crearMetricas(): MetricClima[] {
    const lluvia24 = this.lluvias[0] || 0;
    const lluvia72 = this.suma(this.lluvias.slice(0, 3));
    const et072 = this.suma(this.et0s.slice(0, 3));
    const balance = this.redondear(lluvia72 - et072);
    const humedadMax72 = this.max(this.humedadesMax.slice(0, 3));
    const probLluvia = this.max(this.probabilidadesLluvia);
    const vpdMax72 = this.max(this.vpds.slice(0, 3));
    const vientoMax72 = this.max(this.vientos.slice(0, 3));

    return [
      {
        label: 'Lluvia 24 h',
        value: this.formatear(lluvia24, 'mm'),
        detail: 'Proximo dia',
        tone: lluvia24 > 0 ? 'info' : 'ok',
        fill: this.limitar((lluvia24 / 20) * 100),
      },
      {
        label: 'Lluvia 72 h',
        value: this.formatear(lluvia72, 'mm'),
        detail: 'Ventana enfermedades',
        tone: lluvia72 > 4 ? 'warn' : 'ok',
        fill: this.limitar((lluvia72 / 35) * 100),
      },
      { label: 'HR max 72 h', value: this.formatear(humedadMax72, '%'), detail: 'Mojado foliar probable', tone: humedadMax72 > 92 ? 'warn' : 'ok' },
      { label: 'ET0 72 h', value: this.formatear(et072, 'mm'), detail: 'Demanda atmosferica', tone: 'info' },
      { label: 'Balance 72 h', value: this.formatear(balance, 'mm'), detail: 'Lluvia menos ET0', tone: balance < -2 ? 'warn' : 'ok' },
      { label: 'Prob. lluvia', value: this.formatear(probLluvia, '%'), detail: 'Maxima diaria', tone: probLluvia > 60 ? 'warn' : 'ok' },
      { label: 'VPD max', value: this.formatear(vpdMax72, 'kPa'), detail: 'Secado del ambiente', tone: vpdMax72 > 1.2 ? 'warn' : 'ok' },
      { label: 'Viento max', value: this.formatear(vientoMax72, 'km/h'), detail: 'Aireacion / aplicaciones', tone: vientoMax72 > 25 ? 'warn' : 'info' },
    ];
  }

  private crearDias(): DiaClima[] {
    const lluviaMax = Math.max(...this.lluvias, 1);

    return this.pronosticos.map((p, index) => {
      const tempMax = this.numero(p.temperatura?.max);
      const tempMin = this.numero(p.temperatura?.min);
      const humedad = this.numero(p.humedad?.max ?? p.humedad?.avg) || 0;
      const lluvia = this.numero(p.lluvia) || 0;
      const probabilidad = this.numero(p.probabilidadLluvia) || 0;
      const vpd = this.calcularVpd(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max));

      return {
        fecha: p.fecha,
        label: index === 0 ? 'Hoy' : this.nombreDia(p.fecha),
        estado: this.estadoDia(humedad, lluvia, probabilidad),
        temp: `${this.valor(tempMin)} / ${this.valor(tempMax)} C`,
        humedad: this.formatear(humedad, '%'),
        lluvia: this.formatear(lluvia, 'mm'),
        probabilidad: this.formatear(probabilidad, '%'),
        viento: this.formatear(this.numero(p.velocidadViento?.max ?? p.velocidadViento?.avg), 'km/h'),
        et0: this.formatear(this.numero(p.et0), 'mm'),
        vpd: this.formatear(vpd, 'kPa'),
        lluviaPct: Math.max(4, (lluvia / lluviaMax) * 100),
        humedadPct: Math.max(4, humedad),
      };
    });
  }

  private crearPaneles(): PanelClima[] {
    const puntoRocio = this.pronosticos.map((p) =>
      this.calcularPuntoRocio(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max)),
    );

    return [
      this.crearPanel('Temperatura', 'Media y punto de rocio', [
        this.crearSerie('Temp C', '#23c8c4', this.temperaturasSerie, 'spline', ' C', 0, 1),
        this.crearSerie('Punto rocio C', '#7f8ea3', puntoRocio, 'spline', ' C', 0, 1),
      ]),
      this.crearPanel('Lluvia', 'mm por dia y probabilidad', [
        this.crearSerie('Lluvia mm', '#8fd5bf', this.lluviasSerie, 'column', ' mm', 0, 1),
        this.crearSerie('Prob. lluvia %', '#5c7cfa', this.probabilidadesSerie, 'spline', ' %', 1, 0),
      ]),
      this.crearPanel('Humedad', 'HR maxima diaria', [
        this.crearSerie('HR %', '#35a7ff', this.humedadesMaxSerie, 'spline', ' %', 0, 0),
      ]),
      this.crearPanel('ET0 y VPD', 'Demanda atmosferica', [
        this.crearSerie('ET0 mm', '#f4a340', this.et0Serie, 'spline', ' mm', 0, 1),
        this.crearSerie('VPD kPa', '#e05d4f', this.vpdSerie, 'spline', ' kPa', 1, 2),
      ]),
    ].filter((panel): panel is PanelClima => !!panel);
  }

  private get temperaturas(): number[] {
    return this.temperaturasSerie.filter((value): value is number => value !== null);
  }

  private get humedadesMax(): number[] {
    return this.humedadesMaxSerie.filter((value): value is number => value !== null);
  }

  private get lluvias(): number[] {
    return this.pronosticos.map((p) => this.numero(p.lluvia) || 0);
  }

  private get vientos(): number[] {
    return this.pronosticos.map((p) => this.numero(p.velocidadViento?.max ?? p.velocidadViento?.avg) || 0);
  }

  private get et0s(): number[] {
    return this.pronosticos.map((p) => this.numero(p.et0) || 0);
  }

  private get probabilidadesLluvia(): number[] {
    return this.pronosticos.map((p) => this.numero(p.probabilidadLluvia) || 0);
  }

  private get vpds(): number[] {
    return this.vpdSerie.filter((value): value is number => value !== null);
  }

  private get temperaturasSerie(): Array<number | null> {
    return this.pronosticos.map((p) => this.numero(p.temperatura?.avg ?? p.temperatura?.max));
  }

  private get humedadesMaxSerie(): Array<number | null> {
    return this.pronosticos.map((p) => this.numero(p.humedad?.max ?? p.humedad?.avg));
  }

  private get lluviasSerie(): Array<number | null> {
    return this.pronosticos.map((p) => this.numero(p.lluvia) ?? 0);
  }

  private get probabilidadesSerie(): Array<number | null> {
    return this.pronosticos.map((p) => this.numero(p.probabilidadLluvia) ?? 0);
  }

  private get et0Serie(): Array<number | null> {
    return this.pronosticos.map((p) => this.numero(p.et0) ?? 0);
  }

  private get vpdSerie(): Array<number | null> {
    return this.pronosticos.map((p) =>
      this.calcularVpd(this.numero(p.temperatura?.avg ?? p.temperatura?.max), this.numero(p.humedad?.avg ?? p.humedad?.max)),
    );
  }

  private crearSerie(
    label: string,
    color: string,
    valores: Array<number | null>,
    tipo: 'spline' | 'column' = 'spline',
    unidad = '',
    yAxis = 0,
    decimales = 1,
  ): SerieClima {
    return {
      label,
      color,
      valores: valores.map((value) => (value === null ? null : this.redondear(value))),
      tipo,
      unidad,
      yAxis,
      decimales,
    };
  }

  private crearPanel(titulo: string, subtitulo: string, series: SerieClima[]): PanelClima | undefined {
    if (!series.some((serie) => serie.valores.filter((value) => value !== null).length > 1)) {
      return undefined;
    }
    return {
      titulo,
      subtitulo,
      options: this.crearOpcionesGrafico(series),
    };
  }

  private crearOpcionesGrafico(series: SerieClima[]): Highcharts.Options {
    const tieneEjeSecundario = series.some((serie) => serie.yAxis === 1);
    const unidadPrimaria = series.find((serie) => (serie.yAxis || 0) === 0)?.unidad?.trim() || '';
    const unidadSecundaria = series.find((serie) => serie.yAxis === 1)?.unidad?.trim() || '';

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 250,
        spacingBottom: 16,
        spacingLeft: 8,
        spacingRight: 14,
        spacingTop: 8,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        categories: this.dias.map((dia) => dia.label),
        crosshair: {
          color: 'rgba(34, 211, 200, 0.24)',
          width: 1,
        },
        gridLineColor: 'rgba(119, 150, 180, 0.16)',
        gridLineWidth: 1,
        labels: {
          style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '650' },
        },
      },
      yAxis: [
        {
          title: {
            text: unidadPrimaria || undefined,
            style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '750' },
          },
          labels: {
            style: { color: 'var(--p-text-color)', fontSize: '13px' },
          },
          gridLineColor: 'rgba(119, 150, 180, 0.18)',
          gridLineWidth: 1,
          min: series.every((serie) => serie.label.includes('HR') || serie.label.includes('Prob')) ? 0 : undefined,
          max: series.every((serie) => serie.label.includes('HR') || serie.label.includes('Prob')) ? 100 : undefined,
        },
        ...(tieneEjeSecundario
          ? [
              {
                title: {
                  text: unidadSecundaria || undefined,
                  style: { color: 'var(--p-text-muted-color)', fontSize: '13px', fontWeight: '750' },
                },
                labels: {
                  style: { color: 'var(--p-text-muted-color)', fontSize: '13px' },
                },
                gridLineWidth: 0,
                max: unidadSecundaria === '%' ? 100 : undefined,
                min: 0,
                opposite: true,
              } as Highcharts.YAxisOptions,
            ]
          : []),
      ],
      legend: {
        align: 'center',
        enabled: true,
        itemDistance: 16,
        itemStyle: {
          color: 'var(--p-text-color)',
          fontSize: '13px',
          fontWeight: '750',
        },
        verticalAlign: 'bottom',
      },
      tooltip: {
        backgroundColor: 'var(--p-content-background)',
        borderColor: 'var(--p-surface-border)',
        borderRadius: 8,
        borderWidth: 1,
        shared: true,
        shadow: true,
        style: { color: 'var(--p-text-color)', fontSize: '13px' },
      },
      plotOptions: {
        column: {
          borderRadius: 5,
          borderWidth: 0,
          groupPadding: 0.12,
          pointPadding: 0.08,
        },
        spline: {
          animation: { duration: 450 },
          lineWidth: 1.9,
          marker: {
            enabled: true,
            radius: 2.8,
            states: { hover: { radius: 4 } },
          },
          states: { hover: { lineWidth: 2.5 } },
        },
        series: {
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series: series.map((serie) => ({
        color: serie.color,
        data: serie.valores,
        name: serie.label,
        type: serie.tipo || 'spline',
        yAxis: serie.yAxis || 0,
        tooltip: {
          valueDecimals: serie.decimales ?? 1,
          valueSuffix: serie.unidad || '',
        },
      })) as Highcharts.SeriesOptionsType[],
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 760 },
            chartOptions: {
              chart: { height: 260 },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  private calcularPuntoRocio(temp?: number | null, humedad?: number | null): number | null {
    if (temp == null || humedad == null || humedad <= 0) {
      return null;
    }
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(humedad / 100);
    return this.redondear((b * alpha) / (a - alpha));
  }

  private calcularVpd(temp?: number | null, humedad?: number | null): number | null {
    if (temp == null || humedad == null) {
      return null;
    }
    const svp = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
    return this.redondear(svp * (1 - humedad / 100));
  }

  private estadoDia(humedad: number, lluvia: number, probabilidad: number): string {
    if (lluvia > 3 || probabilidad >= 70) return 'Lluvia probable';
    if (humedad >= 94) return 'Alta humedad';
    if (humedad >= 86) return 'Monitorear';
    return 'Estable';
  }

  private nombreDia(fecha?: string): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
  }

  private formatear(value: number | null, unit: string): string {
    if (value === null || Number.isNaN(value)) {
      return 'N/A';
    }
    return `${value} ${unit}`;
  }

  private valor(value: number | null): string {
    return value === null || Number.isNaN(value) ? '-' : `${value}`;
  }

  private suma(values: number[]): number {
    return this.redondear(values.reduce((acc, value) => acc + value, 0));
  }

  private max(values: number[]): number {
    return this.redondear(Math.max(...values, 0));
  }

  private numero(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    return this.redondear(value);
  }

  private redondear(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private limitar(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, value));
  }
}
