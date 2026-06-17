import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  esCultivoPerenne,
  IDispositivo,
  IFrioAcumulado,
  IFrioTermicoCultivo,
  IReporte,
  ISerieFrioTermicoDia,
  ISiembra,
} from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
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

@Component({
  selector: 'app-card-frio-termico',
  imports: [CommonModule, SharedModule, GraficoHistoricoAmbienteComponent, ChartComponent],
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
  public metricas: MetricFrio[] = [];
  public serieReciente: ISerieFrioTermicoDia[] = [];
  public chartFrioOptions?: Highcharts.Options;

  private ultimoKeyFrio = '';
  private ultimoKeyHistorico = '';

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
      return !!frio && (
        this.esNumero(frio.horasFrio) ||
        this.esNumero(frio.horasFrioEfectivas) ||
        this.esNumero(frio.porcionesFrio)
      );
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
      return `${cultivo}: frio, HFE y CP acumulados por ${dispositivo}. Open-Meteo respalda pronostico, grados dia y riesgo sanitario.`;
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

  private crearMetricas(): MetricFrio[] {
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
    const porcionesFrio = this.esNumero(frio?.porcionesFrio)
      ? Number(frio?.porcionesFrio)
      : this.esNumero(horasFrioEfectivas)
        ? this.calcularPorcionesFrio(Number(horasFrioEfectivas))
        : data?.acumulados.porcionesFrio;
    const factorActual = this.esNumero(frio?.factorEfectivoActual)
      ? Number(frio?.factorEfectivoActual)
      : this.esNumero(frio?.ultimaTemperatura)
        ? this.hfeFactor(Number(frio?.ultimaTemperatura))
        : undefined;

    const metricas: MetricFrio[] = [];

    if (this.esNumero(horasFrio) || this.esNumero(horasFrioObjetivo)) {
      const pct = this.porcentaje(horasFrio, horasFrioObjetivo);
      metricas.push({
        label: 'Horas frio (HF)',
        value: this.esNumero(horasFrio)
          ? `${this.numero(horasFrio, this.usaSensorFrio ? 2 : 1)} h`
          : '-',
        detail: this.detalleObjetivo(horasFrio, horasFrioObjetivo, 'h', 0),
        pct,
        tone: pct !== undefined && pct >= 85 ? 'ok' : 'info',
      });
    }

    if (this.esNumero(horasFrioEfectivas) || this.esNumero(horasFrioEfectivasObjetivo)) {
      const pct = this.porcentaje(horasFrioEfectivas, horasFrioEfectivasObjetivo);
      metricas.push({
        label: 'Frio efectivo (HFE)',
        value: this.esNumero(horasFrioEfectivas)
          ? `${this.numero(horasFrioEfectivas, this.usaSensorFrio ? 2 : 1)} HFE`
          : '-',
        detail: this.detalleObjetivo(horasFrioEfectivas, horasFrioEfectivasObjetivo, 'HFE', 0),
        pct,
        tone: pct !== undefined && pct >= 85 ? 'ok' : 'info',
      });
    }

    if (this.esNumero(porcionesFrio) || this.esNumero(porcionesFrioObjetivo)) {
      const pct = this.porcentaje(porcionesFrio, porcionesFrioObjetivo);
      metricas.push({
        label: 'Chill portions (CP)',
        value: this.esNumero(porcionesFrio) ? `${this.numero(porcionesFrio, 2)} CP` : '-',
        detail: this.detalleObjetivo(porcionesFrio, porcionesFrioObjetivo, 'CP', 1),
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

  private crearChartFrioOptions(): Highcharts.Options | undefined {
    const serie = this.serieReciente;
    const hayTemperatura = serie.filter((dia) => this.esNumero(dia.temperaturaMin) || this.esNumero(dia.temperaturaMax)).length > 1;
    const hayLluvia = serie.some((dia) => this.esNumero(dia.lluvia));

    if (!hayTemperatura && !hayLluvia) {
      return undefined;
    }

    const categorias = serie.map((dia) => this.labelDia(dia.fecha));
    const tempMin = serie.map((dia) => (this.esNumero(dia.temperaturaMin) ? Number(dia.temperaturaMin) : null));
    const tempMax = serie.map((dia) => (this.esNumero(dia.temperaturaMax) ? Number(dia.temperaturaMax) : null));
    const lluvia = serie.map((dia) => (this.esNumero(dia.lluvia) ? Number(dia.lluvia) : 0));

    return {
      chart: {
        backgroundColor: 'transparent',
        height: 300,
        spacingBottom: 18,
        spacingLeft: 8,
        spacingRight: 18,
        spacingTop: 10,
        type: 'spline',
        zooming: { type: 'x' },
        style: {
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
      title: { text: undefined },
      xAxis: {
        categories: categorias,
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
            text: 'Temperatura (C)',
            style: { color: 'var(--p-text-color)', fontSize: '13px', fontWeight: '750' },
          },
          labels: {
            style: { color: 'var(--p-text-color)', fontSize: '13px' },
          },
          gridLineColor: 'rgba(119, 150, 180, 0.18)',
          gridLineWidth: 1,
        },
        {
          min: 0,
          opposite: true,
          title: {
            text: 'Lluvia (mm)',
            style: { color: 'var(--p-text-muted-color)', fontSize: '13px', fontWeight: '750' },
          },
          labels: {
            style: { color: 'var(--p-text-muted-color)', fontSize: '13px' },
          },
          gridLineWidth: 0,
        },
      ],
      legend: {
        align: 'center',
        enabled: true,
        itemDistance: 18,
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
          color: '#9ee2c9',
          groupPadding: 0.08,
          pointPadding: 0.08,
        },
        spline: {
          animation: { duration: 450 },
          lineWidth: 1.9,
          marker: {
            enabled: serie.length <= 65,
            radius: 2.7,
            states: { hover: { radius: 4 } },
          },
          states: { hover: { lineWidth: 2.5 } },
        },
        series: {
          connectNulls: false,
          turboThreshold: 0,
        },
      },
      series: [
        {
          name: 'Temp min (C)',
          color: '#2d9bf0',
          data: tempMin,
          type: 'spline',
          tooltip: { valueDecimals: 1, valueSuffix: ' C' },
        },
        {
          name: 'Temp max (C)',
          color: '#f0524a',
          data: tempMax,
          type: 'spline',
          tooltip: { valueDecimals: 1, valueSuffix: ' C' },
        },
        {
          name: 'Lluvia mm',
          color: '#9ee2c9',
          data: lluvia,
          type: 'column',
          yAxis: 1,
          tooltip: { valueDecimals: 1, valueSuffix: ' mm' },
        },
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
      responsive: {
        rules: [
          {
            condition: { maxWidth: 760 },
            chartOptions: {
              chart: { height: 280 },
              legend: { itemStyle: { fontSize: '12px' } },
            },
          },
        ],
      },
    };
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['lote'] || changes['siembra']) {
      this.prepararVista();
      await Promise.all([this.cargar(), this.cargarHistoricoSensor()]);
    }
  }

  public async cambiarPeriodoSensor(dias: number): Promise<void> {
    this.diasHistoricoSensor = dias;
    await this.cargarHistoricoSensor(true);
  }

  public async cargar(force = false): Promise<void> {
    if (!this.mostrar) {
      this.data = undefined;
      this.prepararVista();
      return;
    }
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    this.error = undefined;
    if (!centro?.lat || !centro?.lng) {
      if (!this.frioSensor) {
        this.error = 'Sin coordenadas para calcular frio y grados dia.';
      }
      this.prepararVista();
      return;
    }

    const key = this.frioRequestKey();
    if (!force && key && key === this.ultimoKeyFrio && this.data) {
      this.prepararVista();
      return;
    }

    this.data = undefined;
    this.prepararVista();
    this.loading = true;
    try {
      const requerimientoFrio = this.siembra?.semilla?.requerimientoFrio || {};
      this.data = await this.climaService.getFrioTermico(centro.lat, centro.lng, {
        cultivo: this.siembra?.semilla?.cultivo,
        horasFrioObjetivo: requerimientoFrio.horasFrio,
        horasFrioEfectivasObjetivo: requerimientoFrio.horasFrioEfectivas,
        porcionesFrioObjetivo: requerimientoFrio.porcionesFrio,
      });
      this.ultimoKeyFrio = key;
    } catch (error: any) {
      if (!this.frioSensor) {
        this.error = error?.error?.message || error?.message || 'No se pudo calcular frio termico.';
      }
    } finally {
      this.loading = false;
      this.prepararVista();
    }
  }

  private prepararVista(): void {
    this.metricas = this.crearMetricas();
    this.serieReciente = (this.data?.serie || []).slice(-60);
    this.chartFrioOptions = this.crearChartFrioOptions();
  }

  private async cargarHistoricoSensor(force = false): Promise<void> {
    const dispositivo = this.dispositivoFrio;
    const id = dispositivo?.deveui || dispositivo?._id;
    if (!id) {
      this.reportesSensorFrio = [];
      return;
    }

    const key = `${id}|${this.diasHistoricoSensor}`;
    if (!force && key === this.ultimoKeyHistorico && this.reportesSensorFrio.length) {
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
      this.ultimoKeyHistorico = key;
    } catch (error) {
      console.error('Error al cargar historico ambiental para frio', error);
      this.reportesSensorFrio = dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : [];
    } finally {
      this.loadingHistoricoSensor = false;
    }
  }

  private frioRequestKey(): string {
    const centro = this.lote?.ubicacion?.centro || this.lote?.establecimiento?.ubicacion?.[0]?.centro;
    const requerimientoFrio = this.siembra?.semilla?.requerimientoFrio || {};
    return [
      centro?.lat,
      centro?.lng,
      this.siembra?.semilla?.cultivo,
      requerimientoFrio.horasFrio,
      requerimientoFrio.horasFrioEfectivas,
      requerimientoFrio.porcionesFrio,
    ].join('|');
  }

  private porcentaje(valor?: number, objetivo?: number): number | undefined {
    if (!this.esNumero(valor) || !this.esNumero(objetivo) || Number(objetivo) <= 0) {
      return undefined;
    }
    return Math.max(0, Math.min(100, (Number(valor) / Number(objetivo)) * 100));
  }

  private calcularPorcionesFrio(horasFrioEfectivas: number): number {
    if (!this.esNumero(horasFrioEfectivas)) return 0;
    return Number((Number(horasFrioEfectivas) / 28).toFixed(2));
  }

  private detalleObjetivo(
    valor: number | undefined,
    objetivo: number | undefined,
    unidad: string,
    decimales = 1,
  ): string {
    if (!this.esNumero(objetivo)) return 'Objetivo sin cargar';

    const unidadLabel = unidad ? ` ${unidad}` : '';
    const objetivoLabel = `${this.numero(Number(objetivo), decimales)}${unidadLabel}`;

    if (!this.esNumero(valor)) return `Objetivo ${objetivoLabel}`;

    const faltante = Math.max(0, Number(objetivo) - Number(valor));
    return `Objetivo ${objetivoLabel} - faltan ${this.numero(faltante, decimales)}${unidadLabel}`;
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

  private labelDia(fecha?: string): string {
    if (!fecha) return '-';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return fecha;
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
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
