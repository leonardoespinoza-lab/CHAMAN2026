import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  esCultivoPerenne,
  getReferenciaObjetivoTermico,
  IReferenciaTermicaVarietal,
  IDispositivo,
  IFrioAcumulado,
  IReporte,
  IRespuestaAgrometeorologiaSiembra,
  IResumenAgrometeorologico,
  ISerieAgrometeorologicaDia,
  ISiembra,
  IResolucionFichaTermica,
  resolverFichaTermicaVarietal,
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

interface ObjetivoFrioVisual {
  key: 'HF' | 'CP' | 'HFE';
  label: string;
  method: string;
  accumulated?: number;
  target?: number;
  targetMin?: number;
  targetMax?: number;
  targetLabel?: string;
  unit: 'HF' | 'CP' | 'HFE';
  decimals: number;
  progress?: number;
  accumulatedSource: string;
  targetSource: string;
  targetStatus: 'validado' | 'referencia' | 'requiere_calibracion' | 'sin_objetivo';
  fieldComparison?: string;
  decisionReady: boolean;
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
  public objetivosFrio: ObjetivoFrioVisual[] = [];
  public chartFrioOptions?: Highcharts.Options;
  public modeloVisible = false;

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

  public get tituloTarjeta(): string {
    return this.esDormanciaPerenne
      ? 'FRÍO Y ACUMULACIÓN TÉRMICA'
      : 'ACUMULACIÓN TÉRMICA';
  }

  public get tituloEvolucion(): string {
    return this.esDormanciaPerenne
      ? 'Evolución de los modelos de frío y tiempo térmico'
      : 'Evolución del tiempo térmico';
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
    if (resumen?.thermalProcess === 'vernalizacion_anual' && this.tienePerfilVernalizacion) {
      return `${cultivo}: la vernalización se informa como exposición térmica en la ventana varietal; no se confunde con horas de frío de frutales.`;
    }
    if (this.esCerealAnual) {
      return `${cultivo}: GDD desde siembra; no se declara requisito de vernalización mientras la variedad no tenga una fuente específica.`;
    }
    if (this.esDormanciaPerenne) {
      const variedad = this.siembra?.semilla?.variedad;
      return `${cultivo}${variedad ? ` ${variedad}` : ''}: avance del frío frente a la especificación cargada. Cada modelo conserva su propia unidad y fuente.`;
    }
    return `${cultivo}: seguimiento térmico visible, sin declarar cumplimiento biológico hasta contar con parámetros varietales documentados.`;
  }

  public get periodoFrioLabel(): string {
    const resumen = this.data?.summary;
    if (!resumen) return '';
    if (this.esVernalizacionAnual) {
      const inicio = this.siembra?.fechaSiembra;
      const desde = inicio ? `desde la siembra ${this.fechaCorta(inicio)}` : 'sin fecha de siembra consolidada';
      const cierre = resumen.gddThroughDate ? ` hasta ${this.fechaCorta(resumen.gddThroughDate)}` : '';
      const dias = this.diasGddComputados ? ` · ${this.diasGddComputados} jornadas computadas` : '';
      return `Acumulación térmica ${desde}${cierre}${dias}`;
    }
    const frio = resumen.coldSeasonStart
      ? `Temporada de frío desde ${this.fechaCorta(resumen.coldSeasonStart)}`
      : 'Temporada de frío sin inicio consolidado';
    const cierre = resumen.coldThroughDate ? ` hasta ${this.fechaCorta(resumen.coldThroughDate)}` : '';
    const gdd = resumen.gddThroughDate ? ` · GDD cerrados al ${this.fechaCorta(resumen.gddThroughDate)}` : '';
    return `${frio}${cierre}${gdd}`;
  }

  public get calidadFrioLabel(): string {
    const campo = this.data?.summary.fieldCold;
    if (!this.esDormanciaPerenne) {
      if (campo || this.usaSensorFrio) return 'Serie térmica con aporte LoRa de campo';
      return `Serie térmica canónica · ${this.fuenteFrioLabel}`;
    }
    if (!campo && this.usaSensorFrio && this.esNumero(this.frioSensor?.horasFrio)) {
      return 'LoRa visible; acumulado canónico pendiente de reproceso';
    }
    if (!campo && this.usaSensorFrio) return 'LoRa visible; acumulado pendiente de reproceso';
    if (!campo) return 'Serie canónica sin lectura LoRa de frío consolidada';
    if (campo.interpretation === 'insufficient_data') {
      return 'LoRa de campo con cobertura parcial';
    }
    return 'LoRa de campo prioritario';
  }

  public get calidadFrioDetalle(): string {
    const campo = this.data?.summary.fieldCold;
    if (!this.esDormanciaPerenne) {
      if (!campo) {
        return 'Los grados-día se calculan con la serie térmica canónica. Este cultivo no usa HF, HFE ni Porciones de Frío de frutales.';
      }
      const cobertura = this.esNumero(campo.temperatureCoveragePercentage)
        ? `${this.numero(campo.temperatureCoveragePercentage, 0)}% de cobertura horaria LoRa`
        : 'cobertura LoRa sin consolidar';
      return `${cobertura}. La temperatura del sensor asignado es prioritaria y la central/Open-Meteo completa las horas faltantes.`;
    }
    if (!campo) {
      if (this.usaSensorFrio) {
        const actualizado = this.frioSensor?.fechaUltimoCalculo
          ? ` Vista previa del dispositivo actualizada ${this.fechaHora(this.frioSensor.fechaUltimoCalculo)}.`
          : '';
        return `El histórico real permanece visible. Al reprocesar, cada hora LoRa integra la serie canónica y central/Open-Meteo completa únicamente los huecos.${actualizado}`;
      }
      return 'La jerarquía automática usa sensor LoRa asignado, luego central válida y finalmente Open-Meteo.';
    }
    const partes = [
      this.esNumero(campo.temperatureCoveragePercentage)
        ? `${this.numero(campo.temperatureCoveragePercentage, 0)}% de cobertura horaria`
        : 'cobertura sin consolidar',
      this.esNumero(campo.maximumGapHours) ? `brecha máxima ${this.numero(campo.maximumGapHours, 0)} h` : '',
      campo.lastObservationAt ? `última lectura ${this.fechaHora(campo.lastObservationAt)}` : '',
    ].filter(Boolean);
    const regla =
      'Las horas con lectura LoRa integran el motor canónico; las brechas se completan con la siguiente fuente disponible.';
    return `${partes.join(' · ')}. ${regla}`;
  }

  public get advertenciasFrio(): string[] {
    return (this.data?.warnings || []).filter((warning) =>
      /fr[ií]o|chill|vernal|LoRa|temperatura de campo|cobertura horaria|biofix/i.test(warning)
    );
  }

  public get esDormanciaPerenne(): boolean {
    return !!(
      this.data?.summary.thermalProcess === 'dormancia_perenne' ||
      esCultivoPerenne(this.siembra?.semilla?.cultivo) ||
      this.siembra?.semilla?.parametrosAgrometeorologicos?.procesoTermico === 'dormancia_perenne'
    );
  }

  public get esVernalizacionAnual(): boolean {
    return !!(
      this.data?.summary.thermalProcess === 'vernalizacion_anual' ||
      this.siembra?.semilla?.parametrosAgrometeorologicos?.procesoTermico === 'vernalizacion_anual'
    );
  }

  public get esCerealAnual(): boolean {
    const cultivo = this.normalizar(this.siembra?.semilla?.cultivo);
    return cultivo === 'trigo' || cultivo === 'cebada';
  }

  public get tienePerfilVernalizacion(): boolean {
    const resumen = this.data?.summary;
    const parametros = this.siembra?.semilla?.parametrosAgrometeorologicos;
    return !!(
      resumen?.vernalizationModel ||
      (resumen?.vernalizationHabit && resumen.vernalizationHabit !== 'desconocido') ||
      this.esNumero(resumen?.vernalizationRequirement) ||
      this.esNumero(resumen?.vernalizationAccumulated) ||
      parametros?.modeloVernalizacion ||
      (parametros?.habitoVernalizacion && parametros.habitoVernalizacion !== 'desconocido') ||
      this.esNumero(parametros?.requerimientoVernalizacion)
    );
  }

  public get perfilVarietalLabel(): string {
    const semilla = this.siembra?.semilla;
    return [semilla?.cultivo, semilla?.variedad, semilla?.portainjerto].filter(Boolean).join(' · ');
  }

  public get fichaTermica(): IResolucionFichaTermica | undefined {
    return resolverFichaTermicaVarietal(this.siembra?.semilla);
  }

  public get fichaTermicaCoincidenciaLabel(): string {
    const coincidencia = this.fichaTermica?.coincidencia;
    if (coincidencia === 'variedad_exacta') return 'Referencia publicada de la variedad';
    if (coincidencia === 'alias_varietal') return 'Referencia por alias o grupo varietal';
    return 'Referencia general del cultivo';
  }

  public get referenciasTermicasFicha(): IReferenciaTermicaVarietal[] {
    return this.fichaTermica?.ficha.referencias || [];
  }

  public referenciaTermicaValor(referencia: IReferenciaTermicaVarietal): string {
    const unidad = referencia.unidad === 'CH_ESTUDIO' ? 'CH (estudio)' : referencia.unidad;
    if (this.esNumero(referencia.objetivo)) return `${this.numero(referencia.objetivo, 1)} ${unidad}`;
    if (this.esNumero(referencia.minimo) && this.esNumero(referencia.maximo)) {
      if (referencia.minimo === referencia.maximo) return `${this.numero(referencia.minimo, 1)} ${unidad}`;
      return `${this.numero(referencia.minimo, 1)}–${this.numero(referencia.maximo, 1)} ${unidad}`;
    }
    return 'Sin umbral publicado';
  }

  public referenciaTermicaEstado(referencia: IReferenciaTermicaVarietal): string {
    if (referencia.estado === 'publicada') return 'Publicada';
    if (referencia.estado === 'referencia_regional') return 'Referencia regional';
    if (referencia.estado === 'evidencia_conflictiva') return 'Evidencia variable';
    return 'Sin umbral';
  }

  public get estadoEspecificacionLabel(): string {
    if (this.esVernalizacionAnual) {
      if (!this.tienePerfilVernalizacion) {
        return 'GDD de referencia del cultivo · no interpreta etapa varietal';
      }
      const estado =
        this.data?.summary.vernalizationStatus ||
        this.siembra?.semilla?.parametrosAgrometeorologicos?.estadoVernalizacion;
      if (estado === 'validado') return 'Perfil varietal validado';
      if (estado === 'referencia') return 'Referencia varietal';
      return 'Vernalización varietal en calibración';
    }
    const estado = this.siembra?.semilla?.requerimientoFrio?.estado;
    if (estado === 'validado') return 'Especificación validada';
    if (estado === 'referencia') return 'Referencia técnica';
    return 'Especificación en revisión';
  }

  public get gddLabel(): string {
    const resumen = this.data?.summary;
    if (this.esNumero(resumen?.gddAccumulated)) {
      return `${this.numero(resumen?.gddAccumulated, 1)} GDD`;
    }
    return this.gddPendienteBiofix ? '0 GDD' : 'Incompleto';
  }

  public get gddEstadoLabel(): string {
    if (this.gddPendienteBiofix) return 'Aún no iniciados';
    if (this.esNumero(this.data?.summary.gddAccumulated)) return 'En acumulación';
    return 'Serie incompleta';
  }

  public get gddDetalle(): string {
    const resumen = this.data?.summary;
    if (this.gddPendienteBiofix) {
      return `En peral el forzado se cuenta después de la salida de endodormancia. Chaman lo inicia con el biofix de inicio de forzado o brotación registrado a campo; Tb ${this.numero(resumen?.gddBaseTemperatureC, 1)} °C.`;
    }
    if (resumen?.gddAccumulationComplete === false) {
      if (this.esVernalizacionAnual) {
        return 'Hay jornadas térmicas faltantes desde la siembra; el total parcial no se presenta como acumulado fenológico completo.';
      }
      return 'Hay días térmicos faltantes desde el biofix; el total parcial no se presenta como completo.';
    }
    const techo = this.esNumero(resumen?.gddUpperTemperatureC)
      ? ` · techo ${this.numero(resumen?.gddUpperTemperatureC, 1)} °C`
      : '';
    const dias = this.diasGddComputados ? ` · ${this.diasGddComputados} jornadas` : '';
    const promedio = this.esNumero(this.gddPromedioDiario)
      ? ` · media ${this.numero(this.gddPromedioDiario, 1)} GDD/día`
      : '';
    return `Base ${this.numero(resumen?.gddBaseTemperatureC, 1)} °C${techo}${dias}${promedio}${resumen?.gddThroughDate ? ` · cerrado al ${this.fechaCorta(resumen.gddThroughDate)}` : ''}`;
  }

  public get diasGddComputados(): number {
    const inicio = this.fechaAgronomica(this.siembra?.fechaSiembra);
    const cierre = this.fechaAgronomica(this.data?.summary.gddThroughDate);
    return (this.data?.series || []).filter((dia) => {
      if (dia.isForecast || !this.esNumero(dia.metrics.gddDaily)) return false;
      const fecha = this.fechaAgronomica(dia.date);
      if (!fecha) return false;
      return (!inicio || fecha >= inicio) && (!cierre || fecha <= cierre);
    }).length;
  }

  public get gddPromedioDiario(): number | undefined {
    const acumulado = this.data?.summary.gddAccumulated;
    const dias = this.diasGddComputados;
    return this.esNumero(acumulado) && dias > 0 ? acumulado / dias : undefined;
  }

  public get completitudFuenteLabel(): string {
    const porcentaje = this.data?.dataSource.completenessPercentage;
    return this.esNumero(porcentaje) ? `${this.numero(porcentaje, 0)}%` : 'Sin consolidar';
  }

  public get gddInicioLabel(): string {
    if (this.esVernalizacionAnual) {
      return this.siembra?.fechaSiembra
        ? `Siembra ${this.fechaCorta(this.siembra.fechaSiembra)}`
        : 'Siembra no consolidada';
    }
    return this.gddPendienteBiofix ? 'Biofix pendiente' : 'Biofix de forzado registrado';
  }

  public get gddCierreLabel(): string {
    if (this.gddPendienteBiofix) return 'GDD aún no iniciados';
    return this.data?.summary.gddThroughDate
      ? this.fechaCorta(this.data.summary.gddThroughDate)
      : 'Sin cierre consolidado';
  }

  public get fuenteParametrosLabel(): string {
    return (
      this.data?.summary.parametersSource ||
      this.siembra?.semilla?.parametrosAgrometeorologicos?.fuente ||
      'Perfil de cultivo Chaman pendiente de validación varietal'
    );
  }

  public get estadoDatosLabel(): string {
    if (this.gddPendienteBiofix) {
      return `Frío auditado al ${this.fechaCorta(this.data?.summary.coldThroughDate)} · GDD pendientes de biofix`;
    }
    if (this.data?.summary.gddAccumulationComplete === false) return 'Serie incompleta: no usar como total fenológico';
    return `Serie completa al cierre · cobertura general ${this.completitudFuenteLabel}`;
  }

  public abrirModelo(): void {
    this.modeloVisible = true;
  }

  public formatObjetivoValue(item: ObjetivoFrioVisual, value?: number): string {
    return this.esNumero(value) ? `${this.numero(value, item.decimals)} ${item.unit}` : 'Sin dato';
  }

  public objetivoEstadoLabel(item: ObjetivoFrioVisual): string {
    if (item.key === 'HFE') return 'Método histórico';
    if (item.targetStatus === 'validado') return 'Objetivo validado';
    if (item.targetStatus === 'referencia') return 'Objetivo de referencia';
    if (item.targetStatus === 'requiere_calibracion') return 'Objetivo cargado · en revisión';
    return 'Objetivo no documentado';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      this.data = undefined;
      this.metricas = [];
      this.objetivosFrio = [];
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
    this.objetivosFrio = this.crearObjetivosFrio();
    this.metricas = this.crearMetricas();
    this.chartFrioOptions = this.crearChartFrioOptions();
  }

  private crearMetricas(): MetricaFrio[] {
    const resumen = this.data?.summary;
    if (!resumen) return this.crearMetricasSensorPreview();
    const metricas: MetricaFrio[] = [];
    const dormancia = this.esDormanciaPerenne;

    if (resumen.thermalProcess === 'vernalizacion_anual' && this.tienePerfilVernalizacion) {
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

    metricas.push({
      label: dormancia ? 'GDD de forzado' : 'Grados día',
      value: this.gddLabel,
      detail: this.gddDetalle,
      source: 'Motor térmico canónico',
      tone: this.gddPendienteBiofix || resumen.gddAccumulationComplete === false ? 'warn' : 'info',
    });

    return metricas.filter(
      (metrica, index, array) =>
        metrica.value !== '-' || array.findIndex((candidate) => candidate.label === metrica.label) === index
    );
  }

  private crearObjetivosFrio(): ObjetivoFrioVisual[] {
    if (!this.esDormanciaPerenne) return [];
    const resumen = this.data?.summary;
    const requisito = this.siembra?.semilla?.requerimientoFrio;
    const campo = resumen?.fieldCold;
    const source = requisito?.fuente || this.siembra?.semilla?.fuenteBase || 'Ficha varietal sin fuente identificada';
    const status = requisito?.estado || 'requiere_calibracion';
    const canonicalSource = this.fuenteCanonicaLabel;
    const fallbackSource = this.dispositivoFrio?.nombre || canonicalSource;
    const fieldSource = campo?.sensorNames?.join(', ') || this.dispositivoFrio?.nombre || 'Sensor LoRa';
    const coverage = this.esNumero(campo?.temperatureCoveragePercentage)
      ? ` · cobertura ${this.numero(campo?.temperatureCoveragePercentage, 0)}%`
      : '';
    const referenciaHf = getReferenciaObjetivoTermico(this.siembra?.semilla, 'HF');
    const referenciaCp = getReferenciaObjetivoTermico(this.siembra?.semilla, 'CP');
    const targetHfCargado = this.positiveNumber(requisito?.horasFrio);
    const targetCpCargado = this.positiveNumber(requisito?.porcionesFrio);
    const targetHfReferencia = this.extremoSuperiorReferencia(referenciaHf);
    const targetCpReferencia = this.extremoSuperiorReferencia(referenciaCp);
    const sourceHf = targetHfCargado ? source : this.fuenteReferenciaLabel(referenciaHf);
    const sourceCp = targetCpCargado ? source : this.fuenteReferenciaLabel(referenciaCp);
    const definitions: Array<Omit<ObjetivoFrioVisual, 'progress' | 'decisionReady'>> = [
      {
        key: 'HF',
        label: 'Horas de frío',
        method: 'Horas entre 0 y 7,2 °C',
        accumulated: this.esNumero(resumen?.chillingHoursAccumulated)
          ? resumen?.chillingHoursAccumulated
          : this.positiveNumber(this.frioSensor?.horasFrio),
        target: targetHfCargado || targetHfReferencia,
        targetMin: targetHfCargado || referenciaHf?.minimo,
        targetMax: targetHfCargado || referenciaHf?.maximo,
        targetLabel: targetHfCargado ? undefined : this.rangoReferenciaLabel(referenciaHf),
        unit: 'HF',
        decimals: 0,
        accumulatedSource: this.esNumero(resumen?.chillingHoursAccumulated) ? canonicalSource : fallbackSource,
        targetSource: sourceHf,
        targetStatus: targetHfCargado ? status : referenciaHf ? 'referencia' : 'sin_objetivo',
        fieldComparison: this.esNumero(campo?.chillingHoursAccumulated)
          ? `${fieldSource}: ${this.numero(campo?.chillingHoursAccumulated, 0)} HF${coverage}`
          : undefined,
      },
      {
        key: 'CP',
        label: 'Porciones de frío',
        method: 'Dynamic Model horario',
        accumulated: this.esNumero(resumen?.chillPortionsAccumulated)
          ? resumen?.chillPortionsAccumulated
          : this.positiveNumber(this.valorFrioLegacy('porcionesFrio')),
        target: targetCpCargado || targetCpReferencia,
        targetMin: targetCpCargado || referenciaCp?.minimo,
        targetMax: targetCpCargado || referenciaCp?.maximo,
        targetLabel: targetCpCargado ? undefined : this.rangoReferenciaLabel(referenciaCp),
        unit: 'CP',
        decimals: 1,
        accumulatedSource: this.esNumero(resumen?.chillPortionsAccumulated) ? canonicalSource : fallbackSource,
        targetSource: sourceCp,
        targetStatus: targetCpCargado ? status : referenciaCp ? 'referencia' : 'sin_objetivo',
        fieldComparison: this.esNumero(campo?.chillPortionsAccumulated)
          ? `${fieldSource}: ${this.numero(campo?.chillPortionsAccumulated, 2)} CP${coverage}`
          : undefined,
      },
      {
        key: 'HFE',
        label: 'Frío efectivo histórico',
        method: 'HFE legacy Chaman; no equivale a CP',
        accumulated: this.valorFrioLegacy('horasFrioEfectivas'),
        target: this.positiveNumber(requisito?.horasFrioEfectivas),
        unit: 'HFE',
        decimals: 0,
        accumulatedSource: this.dispositivoFrio?.nombre || 'Histórico Chaman',
        targetSource: source,
        targetStatus: this.positiveNumber(requisito?.horasFrioEfectivas) ? 'referencia' : 'sin_objetivo',
        fieldComparison: undefined,
      },
    ];
    return definitions.map((item) => {
      const progress = this.progress(item.accumulated, item.target);
      return {
        ...item,
        progress,
        decisionReady: item.key !== 'HFE' && item.targetStatus === 'validado' && requisito?.modeloRector === item.key,
      };
    });
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
    const completeness = campo.continuitySufficient ? 'serie continua' : 'acumulado parcial por brechas';
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

  private get fuenteCanonicaLabel(): string {
    const fuente = this.data?.dataSource;
    if (!fuente) return 'Serie climática canónica';
    if (fuente.type === 'station') return fuente.stationName || 'Central meteorológica asociada';
    if (fuente.type === 'sensor') return fuente.sensorNames?.join(', ') || 'Sensor LoRa asignado';
    if (fuente.type === 'mixed') return 'Jerarquía campo/central/Open-Meteo';
    if (fuente.type === 'open_meteo') return 'Open-Meteo';
    return 'Serie climática canónica';
  }

  private get gddPendienteBiofix(): boolean {
    if (!this.esDormanciaPerenne || this.esNumero(this.data?.summary.gddAccumulated)) return false;
    return !this.tieneBiofixForzado;
  }

  private get tieneBiofixForzado(): boolean {
    return ((this.siembra as any)?.registrosFenologicos || []).some((record: any) => {
      if (record?.estadoRegistro === 'anulado' || record?.tipoEvento !== 'biofix') return false;
      return (record?.objetivosBiofix || []).some((objective: string) =>
        ['inicio_forzado', 'reinicio_gdd_forzado'].includes(String(objective))
      );
    });
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

  private progress(value?: number, target?: number): number | undefined {
    if (!this.esNumero(value) || !this.esNumero(target) || target <= 0) return undefined;
    return Math.max(0, Math.min(100, (value / target) * 100));
  }

  private extremoSuperiorReferencia(referencia?: IReferenciaTermicaVarietal): number | undefined {
    return (
      this.positiveNumber(referencia?.objetivo) ||
      this.positiveNumber(referencia?.maximo) ||
      this.positiveNumber(referencia?.minimo)
    );
  }

  private rangoReferenciaLabel(referencia?: IReferenciaTermicaVarietal): string | undefined {
    if (!referencia) return undefined;
    const unidad = referencia.unidad;
    const minimo = this.positiveNumber(referencia.minimo);
    const maximo = this.positiveNumber(referencia.maximo);
    const objetivo = this.positiveNumber(referencia.objetivo);
    if (objetivo) return `${this.numero(objetivo, unidad === 'CP' ? 1 : 0)} ${unidad} (referencia)`;
    if (minimo && maximo) {
      if (minimo === maximo) return `${this.numero(minimo, unidad === 'CP' ? 1 : 0)} ${unidad} (referencia)`;
      return `${this.numero(minimo, unidad === 'CP' ? 1 : 0)}–${this.numero(maximo, unidad === 'CP' ? 1 : 0)} ${unidad}`;
    }
    return undefined;
  }

  private fuenteReferenciaLabel(referencia?: IReferenciaTermicaVarietal): string {
    if (!referencia) return 'Ficha varietal sin fuente identificada';
    const fuente = this.fichaTermica?.fuentes.find((item) => referencia.fuenteIds.includes(item.id));
    return `${fuente?.titulo || 'Catálogo científico Chaman'} · ${this.fichaTermicaCoincidenciaLabel}`;
  }

  private positiveNumber(value: unknown): number | undefined {
    return this.esNumero(value) && value > 0 ? value : undefined;
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
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    const date = new Date(dateOnly);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  }

  private fechaAgronomica(value?: string): string | undefined {
    if (!value) return undefined;
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1];
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
