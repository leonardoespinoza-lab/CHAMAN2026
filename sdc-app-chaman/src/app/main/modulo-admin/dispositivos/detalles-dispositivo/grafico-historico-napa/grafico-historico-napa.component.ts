import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IConfiguracionEntradaAnalogica, ILorawanRawFrame, ILorawanRawReading, IReporte } from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { SharedModule } from '../../../../../auxiliares/shared.module';

type DireccionNapa = 'sube' | 'baja' | 'estable' | 'sin-datos';

interface NapaPoint {
  x: number;
  y: number;
  unit: 'm';
  waterColumnM?: number;
  installationDepthM?: number;
}

@Component({
  selector: 'app-grafico-historico-napa',
  imports: [SharedModule, ChartComponent],
  templateUrl: './grafico-historico-napa.component.html',
  styleUrl: './grafico-historico-napa.component.scss',
})
export class GraficoHistoricoNapaComponent implements OnChanges {
  @Input() reportes: IReporte[] = [];
  @Input() rawFrames: ILorawanRawFrame[] = [];
  @Input() titulo = 'Medidor de Napa';
  @Input() subtitulo = 'Profundidad vertical desde el terreno hasta la superficie del agua';
  @Input() fechaDesde?: string;
  @Input() configuracion?: IConfiguracionEntradaAnalogica;

  public chartOptions?: any;
  public puntos: NapaPoint[] = [];
  public napaActualM?: number;
  public napaActualFecha?: number;
  public columnaAguaActualM?: number;
  public profundidadSensorEfectivaM?: number;
  public napaEscalaMaximaM = 6;
  public readonly perfilSueloTopPct = 24;
  public readonly perfilSueloBottomPct = 8;
  public direccion: DireccionNapa = 'sin-datos';
  public variacionCm?: number;
  public posicionAguaPct = 60;
  public alturaFlechaPct = 36;
  public senalSinCalibrar = false;
  public alertaEntradaAnalogica = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reportes'] || changes['rawFrames'] || changes['fechaDesde'] || changes['configuracion']) {
      this.preparar();
    }
  }

  public get tendenciaLabel(): string {
    if (this.direccion === 'sin-datos' || this.variacionCm === undefined) return 'Sin tendencia calculable';
    if (this.direccion === 'estable') return 'Estable respecto de la lectura anterior';
    return `${this.direccion === 'sube' ? 'Subio' : 'Bajo'} ${Math.abs(this.variacionCm).toFixed(0)} cm`;
  }

  public get puntosRecientes(): NapaPoint[] {
    return this.puntos.slice(-8).reverse();
  }

  public profundidadEscala(fraction: number): string {
    return `${this.redondear(this.napaEscalaMaximaM * fraction, 1).toFixed(1)} m`;
  }

  private preparar(): void {
    this.alertaEntradaAnalogica = this.detectarFaltaEntradaAnalogica();
    this.puntos = this.construirPuntos();
    this.senalSinCalibrar =
      !this.puntos.length &&
      this.framesFiltrados().some((frame) =>
        (frame.readings || []).some(
          (reading) => reading.variable === 'corriente_analogica' && reading.quality !== 'invalid'
        )
      );

    if (!this.puntos.length) {
      this.napaActualM = undefined;
      this.napaActualFecha = undefined;
      this.columnaAguaActualM = undefined;
      this.profundidadSensorEfectivaM = this.numeroPositivo(this.configuracion?.profundidadInstalacionM);
      this.napaEscalaMaximaM = this.profundidadSensorEfectivaM ?? 6;
      this.direccion = 'sin-datos';
      this.variacionCm = undefined;
      this.chartOptions = undefined;
      return;
    }

    const latest = this.puntos[this.puntos.length - 1];
    this.napaActualM = latest.y;
    this.napaActualFecha = latest.x;
    this.profundidadSensorEfectivaM =
      this.numeroPositivo(this.configuracion?.profundidadInstalacionM) ||
      this.numeroPositivo(latest.installationDepthM) ||
      this.ultimaProfundidadInstalada();
    this.napaEscalaMaximaM = this.profundidadSensorEfectivaM ?? 6;
    this.columnaAguaActualM =
      this.numeroNoNegativo(latest.waterColumnM) ??
      (this.profundidadSensorEfectivaM !== undefined
        ? this.redondear(Math.max(0, this.profundidadSensorEfectivaM - latest.y), 3)
        : undefined);

    const previous = this.puntos[this.puntos.length - 2];
    if (!previous) {
      this.direccion = 'sin-datos';
      this.variacionCm = undefined;
    } else {
      const deltaDepthCm = this.redondear((latest.y - previous.y) * 100, 1);
      this.variacionCm = deltaDepthCm;
      this.direccion = Math.abs(deltaDepthCm) < 1 ? 'estable' : deltaDepthCm < 0 ? 'sube' : 'baja';
    }

    const relativeDepth = Math.min(1, Math.max(0, latest.y / this.napaEscalaMaximaM));
    const perfilSueloHeightPct = 100 - this.perfilSueloTopPct - this.perfilSueloBottomPct;
    this.posicionAguaPct = this.redondear(this.perfilSueloTopPct + relativeDepth * perfilSueloHeightPct, 1);
    this.alturaFlechaPct = this.redondear(Math.max(2, this.posicionAguaPct - this.perfilSueloTopPct), 1);
    this.chartOptions = this.construirGrafico();
  }

  private construirPuntos(): NapaPoint[] {
    const rawPoints: NapaPoint[] = [];
    for (const frame of this.framesFiltrados()) {
      const timestamp = new Date(frame.timestamp).getTime();
      if (!Number.isFinite(timestamp)) continue;
      for (const reading of frame.readings || []) {
        const point = this.puntoDesdeLectura(timestamp, reading);
        if (point) rawPoints.push(point);
      }
    }

    const points = rawPoints.length ? rawPoints : this.puntosDesdeReportes();
    const unique = new Map<string, NapaPoint>();
    points.sort((a, b) => a.x - b.x).forEach((point) => unique.set(`${point.x}:${point.y}`, point));
    return [...unique.values()].sort((a, b) => a.x - b.x);
  }

  private puntoDesdeLectura(timestamp: number, reading: ILorawanRawReading): NapaPoint | undefined {
    if (
      reading.variable !== 'nivel_napa' ||
      reading.quality === 'invalid' ||
      (reading.serviceId && reading.serviceId !== 'nivel-napa')
    ) {
      return undefined;
    }
    const value = this.normalizarMetros(reading.value, reading.unit);
    const installationDepth =
      this.numeroPositivo(reading.installationDepthM) ||
      this.numeroPositivo(this.configuracion?.profundidadInstalacionM);
    if (!this.profundidadRacional(value, installationDepth)) return undefined;
    return {
      x: timestamp,
      y: value,
      unit: 'm',
      waterColumnM: this.numeroNoNegativo(reading.waterColumnM),
      installationDepthM: installationDepth,
    };
  }

  private puntosDesdeReportes(): NapaPoint[] {
    const points: NapaPoint[] = [];
    for (const reporte of this.reportesFiltrados()) {
      const timestamp = new Date(reporte.fecha || reporte.fechaCreacion || '').getTime();
      if (!Number.isFinite(timestamp)) continue;
      const rawNapa = (reporte.datos as any)?.valores?.Napa;
      const rows = Array.isArray(rawNapa) ? rawNapa : rawNapa ? [rawNapa] : [];
      for (const row of rows) {
        const valores = row?.valores || row;
        const rawValue = this.numero(
          valores?.actual ?? valores?.altura ?? valores?.nivel ?? valores?.value ?? valores?.valor
        );
        if (rawValue === undefined) continue;
        const depth = this.normalizarMetros(rawValue, valores?.unidad || row?.unidad);
        const installationDepth =
          this.numeroPositivo(valores?.profundidadInstalacion) ||
          this.numeroPositivo(this.configuracion?.profundidadInstalacionM);
        if (!this.profundidadRacional(depth, installationDepth)) continue;
        points.push({
          x: timestamp,
          y: depth,
          unit: 'm',
          waterColumnM: this.numeroNoNegativo(valores?.columnaAgua),
          installationDepthM: installationDepth,
        });
      }
    }
    return points;
  }

  private construirGrafico(): any {
    const installationDepth = this.numeroPositivo(this.profundidadSensorEfectivaM);
    const data = this.puntos.map((point, index) => {
      const waterColumnM =
        this.numeroNoNegativo(point.waterColumnM) ??
        (installationDepth !== undefined ? this.redondear(Math.max(0, installationDepth - point.y), 3) : undefined);
      return {
        ...point,
        depthLabel: `${point.y.toFixed(2).replace('.', ',')} m`,
        marker:
          index === this.puntos.length - 1
            ? {
                enabled: true,
                fillColor: '#ffffff',
                lineColor: '#075985',
                lineWidth: 2,
                radius: 4,
              }
            : undefined,
        waterColumnLabel: waterColumnM !== undefined ? `${waterColumnM.toFixed(2).replace('.', ',')} m` : '—',
        waterColumnM,
      };
    });
    const maxContinuityMs = 60 * 60 * 1000;
    const seriesData: any[] = [];
    data.forEach((point, index) => {
      const previous = data[index - 1];
      if (previous && point.x - previous.x > maxContinuityMs) {
        seriesData.push({
          custom: { isGap: true },
          marker: { enabled: false },
          x: previous.x + Math.floor((point.x - previous.x) / 2),
          y: null,
        });
      }
      seriesData.push(point);
    });

    return {
      time: { timezone: 'America/Argentina/Buenos_Aires' },
      chart: {
        animation: false,
        backgroundColor: 'transparent',
        margin: [0, 0, 0, 0],
        spacing: [0, 0, 0, 0],
        type: 'spline',
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        crosshair: { color: 'rgba(255, 255, 255, 0.48)', dashStyle: 'ShortDash', width: 1 },
        dateTimeLabelFormats: {
          day: '%d/%m',
          hour: '%H:%M',
          minute: '%H:%M',
          month: '%b',
          week: '%d/%m',
        },
        gridLineWidth: 0,
        labels: {
          reserveSpace: false,
          y: -8,
          style: {
            color: '#f8fafc',
            fontSize: '10px',
            fontWeight: '700',
            textOutline: '2px rgba(30, 41, 59, 0.72)',
          },
        },
        lineColor: 'rgba(255, 255, 255, 0.46)',
        lineWidth: 1,
        maxPadding: 0.02,
        minPadding: 0.02,
        tickLength: 0,
        tickPixelInterval: 150,
        title: { text: undefined },
      },
      yAxis: {
        endOnTick: false,
        gridLineColor: 'rgba(255, 255, 255, 0.16)',
        gridLineDashStyle: 'ShortDash',
        gridLineWidth: 1,
        labels: { enabled: false },
        lineWidth: 0,
        min: 0,
        max: this.napaEscalaMaximaM,
        reversed: true,
        startOnTick: false,
        tickPositions: [0, 0.25, 0.5, 0.75, 1].map((fraction) => this.redondear(this.napaEscalaMaximaM * fraction, 2)),
        tickWidth: 0,
        title: { text: undefined },
      },
      tooltip: {
        distance: 14,
        followPointer: false,
        headerFormat: '{point.key}<br/>',
        outside: false,
        padding: 10,
        pointFormat: '{point.depthLabel} bajo el terreno<br/>Columna de agua: {point.waterColumnLabel}',
        split: false,
        useHTML: false,
        xDateFormat: '%d/%m/%Y %H:%M',
      },
      plotOptions: {
        spline: {
          animation: false,
          lineWidth: 3.5,
          marker: {
            enabled: false,
            fillColor: '#e0f2fe',
            lineColor: '#075985',
            lineWidth: 1,
            radius: 3,
            states: {
              hover: {
                enabled: true,
                fillColor: '#ffffff',
                lineColor: '#075985',
                lineWidth: 2,
                radius: 4,
              },
            },
          },
          shadow: { color: 'rgba(3, 105, 161, 0.5)', offsetX: 0, offsetY: 1, opacity: 0.5, width: 5 },
        },
        series: { animation: false, connectNulls: false, turboThreshold: 0 },
      },
      series: [
        {
          id: 'napa-historica-integrada',
          name: 'Profundidad de napa',
          type: 'spline',
          color: '#e0f2fe',
          data: seriesData,
        },
      ],
      legend: { enabled: false },
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private profundidadRacional(depth: number, installationDepth?: number): boolean {
    if (!Number.isFinite(depth) || depth < 0) return false;
    return installationDepth === undefined || depth <= installationDepth + 0.05;
  }

  private ultimaProfundidadInstalada(): number | undefined {
    for (let index = this.puntos.length - 1; index >= 0; index--) {
      const depth = this.numeroPositivo(this.puntos[index].installationDepthM);
      if (depth !== undefined) return depth;
    }
    return undefined;
  }

  private framesFiltrados(): ILorawanRawFrame[] {
    const desde = this.timestampDesde();
    return (this.rawFrames || []).filter((frame) => {
      const timestamp = new Date(frame.timestamp).getTime();
      return Number.isFinite(timestamp) && (desde === undefined || timestamp >= desde);
    });
  }

  private detectarFaltaEntradaAnalogica(): string {
    const recent = [...this.framesFiltrados()]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-20);
    if (!recent.length) return '';

    const hasAnalog = recent.some((frame) =>
      (frame.readings || []).some(
        (reading) => reading.variable === 'corriente_analogica' || reading.variable === 'nivel_napa'
      )
    );
    if (hasAnalog) return '';

    return `Alerta del controlador: las ultimas ${recent.length} tramas no incluyen la entrada analogica 4-20 mA. La curva conserva mediciones anteriores, pero la napa no se esta actualizando.`;
  }

  private reportesFiltrados(): IReporte[] {
    const desde = this.timestampDesde();
    return (this.reportes || []).filter((reporte) => {
      const timestamp = new Date(reporte.fecha || reporte.fechaCreacion || '').getTime();
      return Number.isFinite(timestamp) && (desde === undefined || timestamp >= desde);
    });
  }

  private timestampDesde(): number | undefined {
    if (!this.fechaDesde) return undefined;
    const timestamp = new Date(this.fechaDesde).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private normalizarMetros(value: number, unit?: string): number {
    const meters = String(unit || '')
      .toLowerCase()
      .includes('cm')
      ? value / 100
      : value;
    return this.redondear(meters, 3);
  }

  private numero(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private numeroPositivo(value: unknown): number | undefined {
    const parsed = this.numero(value);
    return parsed !== undefined && parsed > 0 ? parsed : undefined;
  }

  private numeroNoNegativo(value: unknown): number | undefined {
    const parsed = this.numero(value);
    return parsed !== undefined && parsed >= 0 ? parsed : undefined;
  }

  private redondear(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
