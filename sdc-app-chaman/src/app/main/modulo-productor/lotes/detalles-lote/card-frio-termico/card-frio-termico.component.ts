import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  esCultivoPerenne,
  IDispositivo,
  IFrioAcumulado,
  IFrioTermicoCultivo,
  IReporte,
  ISerieFrioTermicoDia,
  ISiembra,
} from 'modelos/src';
import { ClimaService } from '../../../../../auxiliares/http/clima.service';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { GraficoHistoricoAmbienteComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component';
import { IDetallesLote } from '../detalles-lote.component';

interface MetricFrio {
  label: string;
  value: string;
  detail: string;
  pct?: number;
  tone?: 'ok' | 'warn' | 'info';
}

interface SeriePath {
  label: string;
  color: string;
  path: string;
  puntos: Array<{ x: number; y: number; valor: number; fecha: string }>;
}

@Component({
  selector: 'app-card-frio-termico',
  imports: [CommonModule, SharedModule, GraficoHistoricoAmbienteComponent],
  templateUrl: './card-frio-termico.component.html',
  styleUrl: './card-frio-termico.component.scss',
})
export class CardFrioTermicoComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;

  public loading = false;
  public data?: IFrioTermicoCultivo;
  public error?: string;
  public reportesSensorFrio: IReporte[] = [];
  public loadingHistoricoSensor = false;
  public diasHistoricoSensor = 7;

  constructor(
    private climaService: ClimaService,
    private reporteService: ReporteService,
  ) {}

  public get mostrar(): boolean {
    return esCultivoPerenne(this.siembra?.semilla?.cultivo);
  }

  public get dispositivoFrio(): IDispositivo | undefined {
    return (this.lote?.dispositivos || []).find((dispositivo) => {
      const frio = dispositivo.frioAcumulado;
      return !!frio && (this.esNumero(frio.horasFrio) || this.esNumero(frio.horasFrioEfectivas));
    });
  }

  public get frioSensor(): IFrioAcumulado | undefined {
    return this.dispositivoFrio?.frioAcumulado;
  }

  public get usaSensorFrio(): boolean {
    return !!this.frioSensor;
  }

  public get fuenteFrioLabel(): string {
    if (this.usaSensorFrio && this.data) return 'Sensor LoRa + Open-Meteo';
    if (this.usaSensorFrio) return 'Sensor LoRa';
    return this.data?.fuente || 'Open-Meteo';
  }

  public get tituloHistoricoSensor(): string {
    return `Historico ambiental - ${this.dispositivoFrio?.nombre || 'sensor asociado'}`;
  }

  public get subtituloHistoricoSensor(): string {
    return 'Temperatura, humedad relativa y bateria medidas por el sensor asignado al lote';
  }

  public get lecturaPrincipal(): string {
    if (this.frioSensor) {
      const cultivo = this.siembra?.semilla?.cultivo || 'Plantacion';
      const dispositivo = this.dispositivoFrio?.nombre || this.dispositivoFrio?.deveui || 'sensor asociado';
      return `${cultivo}: frio acumulado medido por ${dispositivo}. Open-Meteo se usa como respaldo para pronostico, grados dia y riesgo sanitario.`;
    }
    return this.data?.lectura || 'Calculando frio y acumulacion termica.';
  }

  public get periodoFrioLabel(): string {
    if (this.frioSensor) {
      const desde = this.fechaCorta(this.frioSensor.fechaInicio);
      const hasta = this.fechaCorta(this.frioSensor.fechaUltimoCalculo);
      const termico = this.data?.periodoTermico?.desde
        ? ` Termico desde ${this.data.periodoTermico.desde}.`
        : '';
      return `Frio sensor ${desde || 'inicio no definido'} a ${hasta || 'ultimo reporte no definido'}.${termico}`;
    }
    if (this.data) {
      return `Frio ${this.data.periodoFrio.desde} a ${this.data.periodoFrio.hasta}. Termico desde ${this.data.periodoTermico.desde}.`;
    }
    return '';
  }

  public get metricas(): MetricFrio[] {
    const data = this.data;
    const frio = this.frioSensor;
    if (!data && !frio) return [];

    const requerimientoSemilla = this.siembra?.semilla?.requerimientoFrio || {};
    const requerimientos = data?.requerimientos || {};
    const horasFrioObjetivo = requerimientos.horasFrioObjetivo ?? requerimientoSemilla.horasFrio;
    const horasFrioEfectivasObjetivo =
      requerimientos.horasFrioEfectivasObjetivo ?? requerimientoSemilla.horasFrioEfectivas;
    const porcionesFrioObjetivo = requerimientos.porcionesFrioObjetivo ?? requerimientoSemilla.porcionesFrio;

    const horasFrio = this.esNumero(frio?.horasFrio) ? Number(frio?.horasFrio) : data?.acumulados.horasFrio;
    const horasFrioEfectivas = this.esNumero(frio?.horasFrioEfectivas)
      ? Number(frio?.horasFrioEfectivas)
      : data?.acumulados.horasFrioEfectivas;
    const factorActual = this.esNumero(frio?.factorEfectivoActual)
      ? Number(frio?.factorEfectivoActual)
      : this.esNumero(frio?.ultimaTemperatura)
        ? this.hfeFactor(Number(frio?.ultimaTemperatura))
        : undefined;

    const metricas: MetricFrio[] = [];

    if (this.esNumero(horasFrio)) {
      const pct = this.porcentaje(horasFrio, horasFrioObjetivo);
      metricas.push({
        label: 'Horas frio',
        value: `${this.numero(horasFrio, this.usaSensorFrio ? 2 : 1)} h`,
        detail: `Objetivo ${horasFrioObjetivo || '-'} h`,
        pct,
        tone: pct !== undefined && pct >= 85 ? 'ok' : 'info',
      });
    }

    if (this.esNumero(horasFrioEfectivas)) {
      const pct = this.porcentaje(horasFrioEfectivas, horasFrioEfectivasObjetivo);
      metricas.push({
        label: 'Frio efectivo',
        value: `${this.numero(horasFrioEfectivas, this.usaSensorFrio ? 2 : 1)} h`,
        detail: `Objetivo ${horasFrioEfectivasObjetivo || '-'} h`,
        pct,
        tone: pct !== undefined && pct >= 85 ? 'ok' : 'info',
      });
    }

    if (this.esNumero(factorActual)) {
      metricas.push({
        label: 'f(T) actual',
        value: `${this.numero(factorActual, 3)}`,
        detail: this.esNumero(frio?.ultimaTemperatura)
          ? `Ultima temp. ${this.numero(Number(frio?.ultimaTemperatura), 1)} C`
          : 'Factor horario efectivo',
        tone: 'info',
      });
    }

    if (data) {
      const porcionesPct = this.porcentaje(data.acumulados.porcionesFrio, porcionesFrioObjetivo);
      metricas.push({
        label: 'Porciones frio',
        value: `${data.acumulados.porcionesFrio}`,
        detail: `Objetivo ${porcionesFrioObjetivo || '-'}`,
        pct: porcionesPct,
        tone: porcionesPct !== undefined && porcionesPct >= 85 ? 'ok' : 'info',
      });

      metricas.push({
        label: 'Grados dia',
        value: `${data.acumulados.gradosDia} GD`,
        detail: `Base ${data.requerimientos.temperaturaBaseGradosDia || 10} C`,
        pct: data.progreso.brotacionPct,
        tone: data.progreso.brotacionPct >= 80 ? 'warn' : 'info',
      });

      metricas.push({
        label: 'Riesgo helada',
        value: data.riesgoHelada.nivel.toUpperCase(),
        detail: data.riesgoHelada.fechaCritica
          ? `${data.riesgoHelada.fechaCritica} / ${data.riesgoHelada.temperaturaMinima} C`
          : 'Sin alerta inmediata',
        tone: data.riesgoHelada.nivel === 'bajo' ? 'ok' : 'warn',
      });
    }

    return metricas;
  }

  public get seriesTemperatura(): SeriePath[] {
    const serie = this.serieReciente;
    return [
      this.crearPath('Temp min', '#2d9bf0', serie.map((dia) => dia.temperaturaMin), serie),
      this.crearPath('Temp max', '#f0524a', serie.map((dia) => dia.temperaturaMax), serie),
    ].filter((item) => item.path);
  }

  public get serieReciente(): ISerieFrioTermicoDia[] {
    return (this.data?.serie || []).slice(-60);
  }

  public get lluviaMaxima(): number {
    return Math.max(...this.serieReciente.map((dia) => dia.lluvia || 0), 1);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['lote'] || changes['siembra']) {
      await Promise.all([this.cargar(), this.cargarHistoricoSensor()]);
    }
  }

  public async cambiarPeriodoSensor(dias: number): Promise<void> {
    this.diasHistoricoSensor = dias;
    await this.cargarHistoricoSensor();
  }

  public async cargar(): Promise<void> {
    if (!this.mostrar) return;
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    this.data = undefined;
    this.error = undefined;
    if (!centro?.lat || !centro?.lng) {
      if (!this.frioSensor) {
        this.error = 'Sin coordenadas para calcular frio y grados dia.';
      }
      return;
    }

    this.loading = true;
    try {
      const requerimientoFrio = this.siembra?.semilla?.requerimientoFrio || {};
      this.data = await this.climaService.getFrioTermico(centro.lat, centro.lng, {
        cultivo: this.siembra?.semilla?.cultivo,
        horasFrioObjetivo: requerimientoFrio.horasFrio,
        horasFrioEfectivasObjetivo: requerimientoFrio.horasFrioEfectivas,
        porcionesFrioObjetivo: requerimientoFrio.porcionesFrio,
      });
    } catch (error: any) {
      if (!this.frioSensor) {
        this.error = error?.error?.message || error?.message || 'No se pudo calcular frio termico.';
      }
    } finally {
      this.loading = false;
    }
  }

  public barraLluvia(dia: ISerieFrioTermicoDia): number {
    return Math.max(2, ((dia.lluvia || 0) / this.lluviaMaxima) * 100);
  }

  public anchoBarraLluvia(): number {
    return Math.max(2, 320 / Math.max(this.serieReciente.length, 1) - 2);
  }

  private async cargarHistoricoSensor(): Promise<void> {
    const dispositivo = this.dispositivoFrio;
    const id = dispositivo?.deveui || dispositivo?._id;
    if (!id) {
      this.reportesSensorFrio = [];
      return;
    }

    this.loadingHistoricoSensor = true;
    try {
      const response = await this.reporteService.historico(String(id), this.diasHistoricoSensor, 2500);
      this.reportesSensorFrio = response.datos?.length
        ? response.datos
        : dispositivo.ultimoReporte
          ? [dispositivo.ultimoReporte]
          : [];
    } catch (error) {
      console.error('Error al cargar historico ambiental para frio', error);
      this.reportesSensorFrio = dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : [];
    } finally {
      this.loadingHistoricoSensor = false;
    }
  }

  private crearPath(
    label: string,
    color: string,
    valores: Array<number | undefined>,
    serie: ISerieFrioTermicoDia[],
  ): SeriePath {
    const puntosBase = valores
      .map((valor, index) => ({ valor, index }))
      .filter((item): item is { valor: number; index: number } => typeof item.valor === 'number');
    if (puntosBase.length < 2) {
      return { label, color, path: '', puntos: [] };
    }

    const width = 320;
    const height = 96;
    const min = Math.min(...puntosBase.map((item) => item.valor));
    const max = Math.max(...puntosBase.map((item) => item.valor));
    const range = Math.max(max - min, 1);
    const puntos = puntosBase.map((item) => ({
      x: puntosBase.length === 1 ? width / 2 : (item.index / Math.max(serie.length - 1, 1)) * width,
      y: height - ((item.valor - min) / range) * (height - 14) - 7,
      valor: item.valor,
      fecha: serie[item.index]?.fecha || '',
    }));
    return {
      label,
      color,
      puntos,
      path: puntos.map((punto, index) => `${index === 0 ? 'M' : 'L'} ${punto.x.toFixed(1)} ${punto.y.toFixed(1)}`).join(' '),
    };
  }

  private porcentaje(valor?: number, objetivo?: number): number | undefined {
    if (!this.esNumero(valor) || !this.esNumero(objetivo) || Number(objetivo) <= 0) {
      return undefined;
    }
    return Math.max(0, Math.min(100, (Number(valor) / Number(objetivo)) * 100));
  }

  private numero(valor?: number, decimales = 1): string {
    if (!this.esNumero(valor)) return '-';
    return Number(valor).toLocaleString('es-AR', {
      maximumFractionDigits: decimales,
      minimumFractionDigits: decimales,
    });
  }

  private esNumero(valor?: number): boolean {
    return typeof valor === 'number' && Number.isFinite(valor);
  }

  private fechaCorta(fecha?: string): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  private hfeFactor(temp: number): number {
    const points = [
      [-5, 0],
      [0, 0.2],
      [1, 0.45],
      [2, 0.65],
      [3, 0.799],
      [4, 0.905],
      [5, 0.975],
      [6, 1],
      [7, 0.975],
      [8, 0.905],
      [9, 0.799],
      [10, 0.68],
      [11, 0.54],
      [12, 0.407],
      [13, 0.29],
      [14, 0.18],
      [15, 0.08],
      [16, 0],
      [18, 0],
    ];
    if (temp <= points[0][0]) return points[0][1];
    if (temp >= points[points.length - 1][0]) return 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      if (temp >= x1 && temp <= x2) {
        const t = (temp - x1) / (x2 - x1);
        return y1 + t * (y2 - y1);
      }
    }
    return 0;
  }
}
