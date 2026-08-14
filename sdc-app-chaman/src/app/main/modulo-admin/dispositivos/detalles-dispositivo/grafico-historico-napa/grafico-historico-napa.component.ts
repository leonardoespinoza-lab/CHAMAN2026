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

  public get longitudCableM(): number | undefined {
    return this.numeroPositivo(this.configuracion?.longitudCableM);
  }

  public get tramoCableExteriorM(): number | undefined {
    return this.numeroNoNegativo(this.configuracion?.tramoCableExteriorM);
  }

  public get formulaDisponible(): boolean {
    return this.profundidadSensorEfectivaM !== undefined && this.columnaAguaActualM !== undefined;
  }

  public get puntosRecientes(): NapaPoint[] {
    return this.puntos.slice(-8).reverse();
  }

  public profundidadEscala(fraction: number): string {
    return this.profundidadSensorEfectivaM === undefined
      ? '—'
      : `${this.redondear(this.profundidadSensorEfectivaM * fraction, 1).toFixed(1)} m`;
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

    const visualDepth = this.profundidadSensorEfectivaM || Math.max(1, Math.ceil(latest.y));
    const relativeDepth = Math.min(1, Math.max(0, latest.y / visualDepth));
    this.posicionAguaPct = this.redondear(24 + relativeDepth * 68, 1);
    this.alturaFlechaPct = this.redondear(Math.max(2, this.posicionAguaPct - 24), 1);
    this.chartOptions = this.construirGrafico(visualDepth);
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

  private construirGrafico(maxDepth: number): any {
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 370,
        type: 'areaspline',
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      xAxis: {
        type: 'datetime',
        title: { text: 'Fecha y hora' },
        crosshair: { color: 'rgba(14, 165, 233, 0.28)', width: 2 },
      },
      yAxis: {
        min: 0,
        max: maxDepth,
        reversed: true,
        title: { text: 'Profundidad bajo el terreno (m)' },
        plotLines: [
          {
            value: 0,
            color: '#70543b',
            width: 3,
            zIndex: 5,
            label: { text: 'Terreno · 0 m', align: 'left', x: 8, y: -7 },
          },
        ],
      },
      tooltip: {
        formatter: function (this: any) {
          const point = this.point as NapaPoint;
          const date = new Date(point.x).toLocaleString('es-AR');
          return `${date}<br/><strong>${Number(point.y).toFixed(2)} m bajo el terreno</strong>`;
        },
      },
      plotOptions: {
        areaspline: {
          lineWidth: 3,
          marker: { enabled: this.puntos.length <= 90, radius: 3.5 },
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(14, 165, 233, 0.08)'],
              [1, 'rgba(14, 165, 233, 0.48)'],
            ],
          },
        },
        series: { turboThreshold: 0 },
      },
      series: [
        {
          name: 'Nivel de napa',
          type: 'areaspline',
          color: '#0284c7',
          data: this.puntos,
        },
      ],
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
        (reading) =>
          reading.variable === 'corriente_analogica' || reading.variable === 'nivel_napa',
      ),
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
