import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  esCultivoPerenne,
  IDispositivo,
  IFrioAcumulado,
  IReporte,
  IRespuestaAgrometeorologiaSiembra,
  IResumenAgrometeorologico,
  ISerieAgrometeorologicaDia,
  ISiembra,
} from 'modelos/src';
import { ChartComponent } from '../../../../../auxiliares/componentes/chart/chart.component';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { GraficoHistoricoAmbienteComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component';
import { IDetallesLote } from '../detalles-lote.component';

interface MetricaFrio {
  label: string;
  value: string;
  detail: string;
  source: string;
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
  private static readonly agrometCache = new Map<string, IRespuestaAgrometeorologiaSiembra>();
  private static readonly agrometPending = new Map<string, Promise<IRespuestaAgrometeorologiaSiembra>>();
  private static readonly historicoSensorCache = new Map<string, IReporte[]>();
  private static readonly historicoSensorPending = new Map<string, Promise<IReporte[]>>();

  private readonly siembraService = inject(SiembraService);
  private readonly reporteService = inject(ReporteService);

  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;

  public loading = false;
  public data?: IRespuestaAgrometeorologiaSiembra;
  public error?: string;
  public reportesSensorFrio: IReporte[] = [];
  public loadingHistoricoSensor = false;
  public diasHistoricoSensor = 7;
  public metricas: MetricaFrio[] = [];
  public chartFrioOptions?: Highcharts.Options;

  private ultimoKeyHistorico = '';
  private requestSequence = 0;

  public get mostrar(): boolean {
    const semilla = this.siembra?.semilla;
    const cultivo = this.normalizar(semilla?.cultivo);
    const parametros = semilla?.parametrosAgrometeorologicos;
    const requisito = semilla?.requerimientoFrio;
    return !!(
      esCultivoPerenne(semilla?.cultivo) ||
      cultivo === 'trigo' ||
      cultivo === 'cebada' ||
      parametros?.procesoTermico === 'dormancia_perenne' ||
      parametros?.procesoTermico === 'vernalizacion_anual' ||
      requisito?.modeloRector === 'HF' ||
      requisito?.modeloRector === 'CP' ||
      this.esNumero(requisito?.horasFrio) ||
      this.esNumero(requisito?.porcionesFrio) ||
      this.data?.summary.thermalProcess === 'dormancia_perenne' ||
      this.data?.summary.thermalProcess === 'vernalizacion_anual'
    );
  }

  public get dispositivoFrio(): IDispositivo | undefined {
    const dispositivos = this.lote?.dispositivos || [];
    const conTemperaturaAire = (dispositivo: IDispositivo): boolean =>
      !!(
        dispositivo.sensores?.includes('Temperatura') ||
        dispositivo.ultimoReporte?.datos?.valores?.['Temperatura']?.length
      );
    return (
      dispositivos.find((dispositivo) => !!dispositivo.frioAcumulado && conTemperaturaAire(dispositivo)) ||
      dispositivos.find((dispositivo) => !!dispositivo.frioAcumulado) ||
      dispositivos.find(conTemperaturaAire)
    );
  }

  public get frioSensor(): IFrioAcumulado | undefined {
    return this.dispositivoFrio?.frioAcumulado;
  }

  public get usaSensorFrio(): boolean {
    return !!this.dispositivoFrio;
  }

  public get tituloHistoricoSensor(): string {
    return `Histórico ambiental - ${this.dispositivoFrio?.nombre || 'sensor LoRa asociado'}`;
  }

  public get subtituloHistoricoSensor(): string {
    return 'Temperatura, humedad relativa y batería medidas realmente en el lote';
  }

  public get fuenteFrioLabel(): string {
    if (!this.data) return this.usaSensorFrio ? 'Sensor LoRa' : 'Sin serie consolidada';
    const fuente = this.data.dataSource;
    const respaldo =
      fuente.type === 'station'
        ? fuente.stationName || 'central meteorológica'
        : fuente.type === 'open_meteo'
          ? 'Open-Meteo'
          : fuente.type === 'mixed'
            ? 'fuentes integradas'
            : fuente.type === 'sensor'
              ? 'sensor de campo'
              : 'sin respaldo';
    return this.usaSensorFrio ? `Sensor LoRa + ${respaldo}` : respaldo;
  }

  public get lecturaPrincipal(): string {
    const resumen = this.data?.summary;
    const cultivo = this.siembra?.semilla?.cultivo || 'Cultivo';
    if (resumen?.thermalProcess === 'vernalizacion_anual') {
      return `${cultivo}: la vernalización se informa como exposición térmica en la ventana varietal; no se confunde con horas de frío de frutales.`;
    }
    if (this.esDormanciaPerenne) {
      return `${cultivo}: HF, Unidades Utah y Porciones de Frío son modelos independientes. El cumplimiento varietal sólo usa el modelo rector validado y requiere confirmación fenológica a campo.`;
    }
    return `${cultivo}: seguimiento térmico visible, sin declarar cumplimiento biológico hasta contar con parámetros varietales documentados.`;
  }

  public get periodoFrioLabel(): string {
    const resumen = this.data?.summary;
    if (!resumen) return '';
    const frio = resumen.coldSeasonStart
      ? `Temporada de frío desde ${this.fechaCorta(resumen.coldSeasonStart)}`
      : 'Temporada de frío sin inicio consolidado';
    const cierre = resumen.coldThroughDate ? ` hasta ${this.fechaCorta(resumen.coldThroughDate)}` : '';
    const gdd = resumen.gddThroughDate ? ` · GDD cerrados al ${this.fechaCorta(resumen.gddThroughDate)}` : '';
    return `${frio}${cierre}${gdd}`;
  }

  public get calidadFrioLabel(): string {
    const campo = this.data?.summary.fieldCold;
    if (!campo && this.usaSensorFrio && this.esNumero(this.frioSensor?.horasFrio)) {
      return 'LoRa visible; acumulado canónico pendiente de reproceso';
    }
    if (!campo && this.usaSensorFrio) return 'LoRa visible como serie ambiental';
    if (!campo) return 'Serie canónica sin lectura LoRa de frío consolidada';
    if (campo.quality === 'reference') return 'LoRa visible como referencia no calibrada';
    if (campo.interpretation === 'insufficient_data') {
      return 'LoRa calificado, temporada incompleta';
    }
    return 'LoRa de campo calificado';
  }

  public get calidadFrioDetalle(): string {
    const campo = this.data?.summary.fieldCold;
    if (!campo) {
      if (this.usaSensorFrio) {
        const actualizado = this.frioSensor?.fechaUltimoCalculo
          ? ` Vista previa del dispositivo actualizada ${this.fechaHora(this.frioSensor.fechaUltimoCalculo)}.`
          : '';
        return `El histórico real permanece visible. HF/Utah/CP sólo gobiernan decisiones cuando el motor canónico termina de auditar cobertura, brechas y calibración.${actualizado}`;
      }
      return 'La jerarquía automática usa sensor calificado, luego central válida y finalmente Open-Meteo.';
    }
    const partes = [
      this.esNumero(campo.temperatureCoveragePercentage)
        ? `${this.numero(campo.temperatureCoveragePercentage, 0)}% de cobertura horaria`
        : 'cobertura sin consolidar',
      this.esNumero(campo.maximumGapHours) ? `brecha máxima ${this.numero(campo.maximumGapHours, 0)} h` : '',
      campo.lastObservationAt ? `última lectura ${this.fechaHora(campo.lastObservationAt)}` : '',
    ].filter(Boolean);
    const regla =
      campo.quality === 'reference'
        ? 'Se grafica y audita, pero no mueve GDD, fenología ni cumplimiento varietal.'
        : 'Puede integrar el motor canónico; las brechas se completan con la siguiente fuente disponible.';
    return `${partes.join(' · ')}. ${regla}`;
  }

  public get advertenciasFrio(): string[] {
    return (this.data?.warnings || []).filter((warning) =>
      /fr[ií]o|chill|vernal|LoRa|temperatura de campo|cobertura horaria|biofix/i.test(warning)
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      this.data = undefined;
      this.metricas = [];
      this.chartFrioOptions = undefined;
      void this.cargar();
      setTimeout(() => void this.cargarHistoricoSensor(), 0);
    }
  }

  public async cargar(force = false): Promise<void> {
    const sequence = ++this.requestSequence;
    const id = this.siembra?._id;
    if (!id || !this.mostrar) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = undefined;
    try {
      if (force) {
        const response = await this.siembraService.reprocesarAgrometeorologia(id, true);
        if (sequence !== this.requestSequence) return;
        this.data = response;
        CardFrioTermicoComponent.agrometCache.set(id, response);
      } else {
        const cached = CardFrioTermicoComponent.agrometCache.get(id);
        if (cached) {
          this.data = cached;
        } else {
          let request = CardFrioTermicoComponent.agrometPending.get(id);
          if (!request) {
            request = this.siembraService.agrometeorologia(id);
            CardFrioTermicoComponent.agrometPending.set(id, request);
          }
          const response = await request;
          if (sequence !== this.requestSequence) return;
          this.data = response;
          CardFrioTermicoComponent.agrometCache.set(id, response);
        }
      }
      if (sequence !== this.requestSequence) return;
      this.prepararVista();
    } catch (error: any) {
      if (sequence !== this.requestSequence) return;
      this.error = error?.error?.message || error?.message || 'No se pudo leer la acumulación térmica.';
    } finally {
      CardFrioTermicoComponent.agrometPending.delete(id);
      if (sequence === this.requestSequence) this.loading = false;
    }
  }

  public async cambiarPeriodoSensor(dias: number): Promise<void> {
    this.diasHistoricoSensor = dias;
    await this.cargarHistoricoSensor(true);
  }

  private prepararVista(): void {
    this.metricas = this.crearMetricas();
    this.chartFrioOptions = this.crearChartFrioOptions();
  }

  private crearMetricas(): MetricaFrio[] {
    const resumen = this.data?.summary;
    if (!resumen) return this.crearMetricasSensorPreview();
    const metricas: MetricaFrio[] = [];
    const campo = resumen.fieldCold;
    const dormancia = this.esDormanciaPerenne;

    if (dormancia) {
      metricas.push(this.metricaRequisito(resumen));
      if (campo) {
        metricas.push(...this.crearMetricasFrioCampo(campo));
      } else if (this.esNumero(this.frioSensor?.horasFrio)) {
        metricas.push(...this.crearMetricasSensorPreview());
      } else {
        metricas.push(...this.crearMetricasFrioCanonico(resumen));
      }
    }

    if (resumen.thermalProcess === 'vernalizacion_anual') {
      metricas.push({
        label: 'Vernalización varietal',
        value: this.esNumero(resumen.vernalizationAccumulated)
          ? `${this.numero(resumen.vernalizationAccumulated, 2)} días eq.`
          : 'Sin acumulado válido',
        detail: this.detalleVernalizacion(resumen),
        source: resumen.parametersSource || 'Perfil varietal',
        tone: resumen.vernalizationInterpretation === 'datos_insuficientes' ? 'warn' : 'info',
      });
    }

    if (campo) metricas.push(...this.crearMetricaHfeLegacy());
    metricas.push({
      label: 'Grados día',
      value: this.esNumero(resumen.gddAccumulated) ? `${this.numero(resumen.gddAccumulated, 1)} GDD` : 'Incompleto',
      detail:
        resumen.gddAccumulationComplete === false
          ? 'Faltan días térmicos; no se publica un total parcial como completo'
          : `Base ${this.numero(resumen.gddBaseTemperatureC, 1)} °C`,
      source: 'Motor térmico canónico',
      tone: resumen.gddAccumulationComplete === false ? 'warn' : 'info',
    });

    return metricas.filter(
      (metrica, index, array) =>
        metrica.value !== '-' || array.findIndex((candidate) => candidate.label === metrica.label) === index
    );
  }

  private crearMetricasFrioCanonico(resumen: IResumenAgrometeorologico): MetricaFrio[] {
    return [
      this.metrica(
        'Horas de frío (HF)',
        resumen.chillingHoursAccumulated,
        'HF',
        'Horas entre 0 y 7,2 °C',
        'Serie canónica',
        1
      ),
      this.metrica(
        'Unidades Utah',
        resumen.utahChillUnitsAccumulated,
        'UF',
        'Modelo Utah; puede descontar calor',
        'Serie canónica',
        1
      ),
      this.metrica(
        'Porciones de frío',
        resumen.chillPortionsAccumulated,
        'CP',
        (resumen.chillingMaximumGapHours || 0) > 0
          ? 'Dynamic Model; cota inferior por brechas'
          : 'Dynamic Model horario',
        'Serie canónica',
        2
      ),
    ];
  }

  private crearMetricasFrioCampo(campo: NonNullable<IResumenAgrometeorologico['fieldCold']>): MetricaFrio[] {
    const source = campo.sensorNames?.join(', ') || 'Sensor LoRa';
    const tone: MetricaFrio['tone'] = campo.quality === 'qualified' ? 'ok' : 'warn';
    const quality = campo.quality === 'qualified' ? 'serie LoRa calificada' : 'referencia LoRa no calibrada';
    const coverage = this.esNumero(campo.temperatureCoveragePercentage)
      ? `${this.numero(campo.temperatureCoveragePercentage, 0)}% de horas cubiertas`
      : 'cobertura horaria sin consolidar';
    const completeness = campo.continuitySufficient
      ? 'serie continua'
      : 'acumulado parcial por brechas';
    return [
      this.metrica(
        'Horas frío medidas por LoRa (HF)',
        campo.chillingHoursAccumulated,
        'HF',
        `0 a 7,2 °C · ${coverage} · ${completeness} · ${quality}`,
        source,
        1,
        tone
      ),
      this.metrica(
        'Utah sobre lecturas LoRa',
        campo.utahChillUnitsAccumulated,
        'UF',
        `Modelo Utah · ${coverage} · ${completeness}`,
        source,
        1,
        tone
      ),
      this.metrica(
        'Porciones sobre lecturas LoRa',
        campo.chillPortionsAccumulated,
        'CP',
        `Dynamic Model · ${coverage} · ${completeness} · ${quality}`,
        source,
        2,
        tone
      ),
    ];
  }

  private crearMetricasSensorPreview(): MetricaFrio[] {
    const frio = this.frioSensor;
    if (!frio) return [];
    const source = this.dispositivoFrio?.nombre || 'Sensor LoRa';
    const metricas: MetricaFrio[] = [];
    if (this.esNumero(frio.horasFrio)) {
      metricas.push(
        this.metrica(
          'Horas frío del sensor (vista previa)',
          frio.horasFrio,
          'HF',
          `Acumulado 0 a 7,2 °C${this.periodoPreviewSensor()}`,
          source,
          2,
          'warn'
        )
      );
    }
    const hfe = this.valorFrioLegacy('horasFrioEfectivas');
    if (this.esNumero(hfe)) {
      metricas.push({
        label: 'Frío efectivo (HFE hist.)',
        value: `${this.numero(hfe, 2)} HFE`,
        detail: 'Indicador histórico de referencia; no gobierna decisiones nuevas',
        source,
        tone: 'warn',
      });
    }
    const cp = this.valorFrioLegacy('porcionesFrio');
    if (this.esNumero(cp)) {
      metricas.push({
        label: 'Porciones históricas (ref.)',
        value: `${this.numero(cp, 2)} CP`,
        detail: 'Estimación legacy; esperar Dynamic Model canónico para decidir',
        source,
        tone: 'warn',
      });
    }
    return metricas;
  }

  private metricaRequisito(resumen: IResumenAgrometeorologico): MetricaFrio {
    const requisito = resumen.coldRequirement;
    const unit = requisito?.model === 'HF' || requisito?.model === 'CP' ? requisito.model : '';
    const value = this.esNumero(requisito?.progressPercentage)
      ? `${this.numero(requisito?.progressPercentage, 0)}%`
      : requisito?.interpretation === 'datos_insuficientes'
        ? 'Datos insuficientes'
        : 'Sin calibrar';
    const objective = this.esNumero(requisito?.target)
      ? `Objetivo ${this.numero(requisito?.target, unit === 'CP' ? 2 : 0)} ${unit}`
      : 'Sin objetivo varietal validado';
    const interpretation = requisito?.compatible
      ? 'clima compatible; confirmar etapa a campo'
      : requisito?.interpretation === 'datos_insuficientes'
        ? 'no se calcula avance biológico con cobertura incompleta'
        : 'en acumulación';
    return {
      label: 'Requisito varietal rector',
      value,
      detail: `${objective} · ${interpretation}`,
      source: requisito?.source || 'Pendiente de fuente varietal',
      pct: requisito?.progressPercentage,
      tone: requisito?.compatible ? 'ok' : 'warn',
    };
  }

  private crearMetricaHfeLegacy(): MetricaFrio[] {
    const hfe = this.valorFrioLegacy('horasFrioEfectivas');
    if (!this.esNumero(hfe)) return [];
    return [
      {
        label: 'Frío efectivo (HFE ref.)',
        value: `${this.numero(hfe, 2)} HFE`,
        detail: 'Referencia histórica; no gobierna decisiones nuevas',
        source: this.dispositivoFrio?.nombre || 'Sensor LoRa',
        tone: 'warn',
      },
    ];
  }

  private get esDormanciaPerenne(): boolean {
    return !!(
      this.data?.summary.thermalProcess === 'dormancia_perenne' ||
      esCultivoPerenne(this.siembra?.semilla?.cultivo) ||
      this.siembra?.semilla?.parametrosAgrometeorologicos?.procesoTermico === 'dormancia_perenne'
    );
  }

  private valorFrioLegacy(key: 'horasFrioEfectivas' | 'porcionesFrio' | 'factorEfectivoActual'): number | undefined {
    const direct = this.frioSensor?.[key];
    if (this.esNumero(direct)) return direct;
    const raw = (this.frioSensor as any)?.legacy?.frio?.raw?.[key];
    return this.esNumero(raw) ? raw : undefined;
  }

  private periodoPreviewSensor(): string {
    const desde = this.frioSensor?.fechaInicio || this.frioSensor?.temporadaInicio;
    const hasta = this.frioSensor?.fechaUltimoCalculo;
    if (!desde && !hasta) return '';
    return ` · ${this.fechaCorta(desde)} a ${this.fechaCorta(hasta)}`;
  }

  private metrica(
    label: string,
    value: number | undefined,
    unit: string,
    detail: string,
    source: string,
    decimals: number,
    tone: MetricaFrio['tone'] = 'info'
  ): MetricaFrio {
    return {
      label,
      value: this.esNumero(value) ? `${this.numero(value, decimals)} ${unit}` : '-',
      detail,
      source,
      tone,
    };
  }

  private detalleVernalizacion(resumen: IResumenAgrometeorologico): string {
    if (resumen.vernalizationInterpretation === 'no_requerida') {
      return 'Hábito primaveral documentado: requisito 0';
    }
    if (resumen.vernalizationInterpretation === 'sin_biofix_inicio') {
      return 'Falta registrar a campo el inicio de la ventana';
    }
    if (resumen.vernalizationInterpretation === 'datos_insuficientes') {
      return `Cobertura ${this.numero(resumen.vernalizationTemperatureCoveragePct, 0)}% · los días incompletos no suman`;
    }
    const objetivo = this.esNumero(resumen.vernalizationRequirement)
      ? `Objetivo ${this.numero(resumen.vernalizationRequirement, 2)} días eq.`
      : 'Objetivo sin calibrar';
    return `${objetivo} · hábito ${resumen.vernalizationHabit || 'sin confirmar'}`;
  }

  private crearChartFrioOptions(): Highcharts.Options | undefined {
    const dias = this.data?.series || [];
    const vernalizacion = this.data?.summary.thermalProcess === 'vernalizacion_anual';
    const definiciones = vernalizacion
      ? [
          {
            name: 'Vernalización',
            color: '#547ec8',
            values: dias.map((dia) => dia.metrics.vernalizationAccumulated ?? null),
            suffix: ' días eq.',
          },
          {
            name: 'GDD',
            color: '#18a999',
            values: dias.map((dia) => dia.metrics.gddAccumulated ?? null),
            suffix: ' GDD',
          },
        ]
      : [
          {
            name: 'Horas de frío',
            color: '#168d82',
            values: dias.map((dia) => dia.metrics.chillingHoursAccumulated ?? null),
            suffix: ' HF',
          },
          {
            name: 'Unidades Utah',
            color: '#547ec8',
            values: dias.map((dia) => dia.metrics.utahChillUnitsAccumulated ?? null),
            suffix: ' UF',
          },
          {
            name: 'Porciones de frío',
            color: '#8d65b8',
            values: dias.map((dia) => dia.metrics.chillPortionsAccumulated ?? null),
            suffix: ' CP',
          },
        ];
    const visibles = definiciones.filter((item) => item.values.some((value) => this.esNumero(value)));
    if (!dias.length || !visibles.length) return undefined;
    return {
      chart: {
        backgroundColor: 'transparent',
        height: 320,
        spacing: [12, 12, 18, 8],
        type: 'spline',
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      xAxis: {
        categories: dias.map((dia) => this.fechaCorta(dia.date)),
        labels: { step: Math.max(1, Math.ceil(dias.length / 12)) },
        gridLineWidth: 1,
        gridLineColor: 'rgba(119, 150, 180, 0.14)',
      },
      yAxis: visibles.map((item, index) => ({
        title: { text: item.name },
        opposite: index > 0,
        visible: index < 2,
        min: 0,
        gridLineColor: 'rgba(119, 150, 180, 0.16)',
      })),
      tooltip: { shared: true },
      legend: { enabled: true, align: 'center', verticalAlign: 'bottom' },
      plotOptions: {
        series: {
          connectNulls: false,
          marker: { enabled: dias.length <= 45, radius: 2.5 },
          lineWidth: 2,
          turboThreshold: 0,
        },
      },
      series: visibles.map((item, index) => ({
        name: item.name,
        data: item.values,
        color: item.color,
        type: 'spline' as const,
        yAxis: Math.min(index, 1),
        tooltip: { valueSuffix: item.suffix, valueDecimals: index === 2 ? 2 : 1 },
      })),
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private async cargarHistoricoSensor(force = false): Promise<void> {
    const dispositivo = this.dispositivoFrio;
    const id = dispositivo?._id || dispositivo?.deveui;
    if (!id) {
      this.reportesSensorFrio = [];
      return;
    }
    const key = `${id}|${this.diasHistoricoSensor}`;
    if (!force && key === this.ultimoKeyHistorico && this.reportesSensorFrio.length) {
      return;
    }
    const cached = CardFrioTermicoComponent.historicoSensorCache.get(key);
    if (!force && cached) {
      this.reportesSensorFrio = cached;
      this.ultimoKeyHistorico = key;
      return;
    }
    this.loadingHistoricoSensor = true;
    try {
      let request = CardFrioTermicoComponent.historicoSensorPending.get(key);
      if (!request || force) {
        request = this.reporteService
          .historico(String(id), this.diasHistoricoSensor, this.limiteHistoricoSensor())
          .then((response) =>
            response.datos?.length ? response.datos : dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : []
          );
        CardFrioTermicoComponent.historicoSensorPending.set(key, request);
      }
      this.reportesSensorFrio = await request;
      this.ultimoKeyHistorico = key;
      CardFrioTermicoComponent.historicoSensorCache.set(key, this.reportesSensorFrio);
    } catch (error) {
      console.error('Error al cargar histórico ambiental para frío', error);
      this.reportesSensorFrio = dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : [];
    } finally {
      CardFrioTermicoComponent.historicoSensorPending.delete(key);
      this.loadingHistoricoSensor = false;
    }
  }

  private limiteHistoricoSensor(): number {
    if (this.diasHistoricoSensor <= 1) return 400;
    if (this.diasHistoricoSensor <= 7) return 1400;
    return 2500;
  }

  private numero(value: unknown, decimals = 1): string {
    return this.esNumero(value)
      ? Number(value).toLocaleString('es-AR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : '-';
  }

  private esNumero(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private fechaCorta(value?: string): string {
    if (!value) return '-';
    // Las fechas agronomicas YYYY-MM-DD son dias locales, no instantes UTC.
    // El mediodia evita que UTC-3 las desplace al dia calendario anterior.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value;
    const date = new Date(dateOnly);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  }

  private fechaHora(value?: string): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('es-AR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  private normalizar(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
}
