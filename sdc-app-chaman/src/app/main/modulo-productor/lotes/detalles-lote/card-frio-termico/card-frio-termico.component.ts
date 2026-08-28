import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import Highcharts from 'highcharts';
import {
  esCultivoPerenne,
  IReferenciaTermicaVarietal,
  IDispositivo,
  IFrioAcumulado,
  IReporte,
  IRespuestaAgrometeorologiaSiembra,
  IResumenAgrometeorologico,
  ISerieAgrometeorologicaDia,
  ISiembra,
  IResolucionFichaTermica,
  fechaEfectivaRegistroFenologico,
  obtenerInicioTemporadaFrioObservado,
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
  public modoGraficoFrio: 'acumulado' | 'diario' = 'acumulado';
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
    return this.esDormanciaPerenne ? 'FRÍO Y ACUMULACIÓN TÉRMICA' : 'ACUMULACIÓN TÉRMICA';
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
    const respaldo = this.fuenteCanonicaLabel;
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
      return `${cultivo}${variedad ? ` ${variedad}` : ''}: registro observacional de frío y forzado. Cada modelo conserva su unidad, fuente y cobertura; las etapas se confirman a campo.`;
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
    const cierreFrio = this.fechaAgronomica(resumen.coldThroughDate);
    const fechaObjetivo = cierreFrio ? new Date(`${cierreFrio}T12:00:00.000Z`) : new Date();
    const registroInicio = obtenerInicioTemporadaFrioObservado(this.siembra, fechaObjetivo);
    const inicioObservado = registroInicio ? fechaEfectivaRegistroFenologico(registroInicio) : undefined;
    const frio = inicioObservado
      ? `Temporada de frío observada desde ${this.fechaCorta(inicioObservado)}`
      : resumen.coldSeasonStart
        ? `Temporada de frío desde ${this.fechaCorta(resumen.coldSeasonStart)}`
        : 'Temporada de frío sin inicio consolidado';
    const inicioSerie =
      inicioObservado &&
      resumen.coldSeasonStart &&
      String(inicioObservado).slice(0, 10) !== String(resumen.coldSeasonStart).slice(0, 10)
        ? ` · serie térmica desde ${this.fechaCorta(resumen.coldSeasonStart)}`
        : '';
    const cierre = resumen.coldThroughDate ? ` hasta ${this.fechaCorta(resumen.coldThroughDate)}` : '';
    const gdd = resumen.gddThroughDate ? ` · GDD cerrados al ${this.fechaCorta(resumen.gddThroughDate)}` : '';
    return `${frio}${inicioSerie}${cierre}${gdd}`;
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
    return 'Registro observado · sin objetivo prefijado';
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
      const cultivo = this.siembra?.semilla?.cultivo || 'el cultivo perenne';
      return `En ${cultivo} el forzado se cuenta después de la salida de endodormancia. Chaman lo inicia con el biofix de inicio de forzado o brotación registrado a campo; Tb ${this.numero(resumen?.gddBaseTemperatureC, 1)} °C.`;
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

  public get gddDetalleResumen(): string {
    if (!this.gddPendienteBiofix) return this.gddDetalle;
    return `Comienza con el biofix de brotación observado · Tb ${this.numero(
      this.data?.summary.gddBaseTemperatureC,
      1
    )} °C`;
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

  public cambiarModoGraficoFrio(modo: 'acumulado' | 'diario'): void {
    if (this.modoGraficoFrio === modo) return;
    this.modoGraficoFrio = modo;
    this.chartFrioOptions = this.crearChartFrioOptions();
  }

  private prepararVista(): void {
    this.metricas = this.crearMetricas();
    this.chartFrioOptions = this.crearChartFrioOptions();
  }

  private crearMetricas(): MetricaFrio[] {
    const resumen = this.data?.summary;
    if (!resumen) return this.crearMetricasSensorPreview();
    const metricas: MetricaFrio[] = [];
    const dormancia = this.esDormanciaPerenne;

    if (dormancia) {
      const tieneFrioCanonico = [
        resumen.chillingHoursAccumulated,
        resumen.utahChillUnitsAccumulated,
        resumen.chillPortionsAccumulated,
      ].some((valor) => this.esNumero(valor));
      if (tieneFrioCanonico) {
        metricas.push(...this.crearMetricasFrioCanonico(resumen));
      } else {
        metricas.push(...this.crearMetricasSensorPreview());
      }
    }

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
      detail: this.gddDetalleResumen,
      source: 'Motor térmico canónico',
      tone: this.gddPendienteBiofix || resumen.gddAccumulationComplete === false ? 'warn' : 'info',
    });

    return metricas.filter(
      (metrica, index, array) =>
        metrica.value !== '-' || array.findIndex((candidate) => candidate.label === metrica.label) === index
    );
  }

  private crearMetricasFrioCanonico(resumen: IResumenAgrometeorologico): MetricaFrio[] {
    const sensores = resumen.fieldCold?.sensorNames?.join(', ');
    const fuente = sensores
      ? `${sensores} prioritario; respaldo ${this.fuenteCanonicaLabel}`
      : this.fuenteCanonicaLabel;
    return [
      this.metrica('Horas de frío (HF)', resumen.chillingHoursAccumulated, 'HF', 'Horas entre 0 y 7,2 °C', fuente, 1),
      this.metrica(
        'Unidades Utah',
        resumen.utahChillUnitsAccumulated,
        'UF',
        'Modelo Utah; puede descontar calor',
        fuente,
        1
      ),
      this.metrica(
        'Porciones de frío',
        resumen.chillPortionsAccumulated,
        'CP',
        (resumen.chillingMaximumGapHours || 0) > 0
          ? 'Dynamic Model; cota inferior por brechas'
          : 'Dynamic Model horario',
        fuente,
        2
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
    return metricas;
  }

  private get fuenteCanonicaLabel(): string {
    const fuente = this.data?.dataSource;
    if (!fuente) return 'Serie climática canónica';
    if (fuente.type === 'station') return fuente.stationName || 'Central meteorológica asociada';
    if (fuente.type === 'sensor') return fuente.sensorNames?.join(', ') || 'Sensor LoRa asignado';
    if (fuente.type === 'mixed') {
      const labels = (fuente.sources || []).map((source) => {
        if (source === 'sensor') return fuente.sensorNames?.join(', ') || 'Sensor de campo';
        if (source === 'station') return fuente.stationName || 'Central meteorológica asociada';
        if (source === 'chaman_meteo') return 'Chamán-Meteo (ERA5-Land)';
        return source === 'open_meteo' ? 'Open-Meteo' : 'Fuente meteorológica';
      });
      return labels.length ? labels.join(' + ') : 'Fuentes climáticas integradas';
    }
    if (fuente.type === 'open_meteo') return 'Open-Meteo';
    if (fuente.type === 'chaman_meteo') return 'Chamán-Meteo (ERA5-Land)';
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
    const vernalizacion = this.data?.summary.thermalProcess === 'vernalizacion_anual';
    const dias = (this.data?.series || []).filter((dia) => {
      if (dia.isForecast) return false;
      return vernalizacion
        ? [dia.metrics.vernalizationAccumulated, dia.metrics.gddAccumulated].some((value) => this.esNumero(value))
        : [
            dia.metrics.chillingHours,
            dia.metrics.chillingHoursAccumulated,
            dia.metrics.utahChillUnits,
            dia.metrics.utahChillUnitsAccumulated,
            dia.metrics.chillPortions,
            dia.metrics.chillPortionsAccumulated,
          ].some((value) => this.esNumero(value));
    });
    const aporteDiario = this.esDormanciaPerenne && this.modoGraficoFrio === 'diario';
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
            values: dias.map(
              (dia) => (aporteDiario ? dia.metrics.chillingHours : dia.metrics.chillingHoursAccumulated) ?? null
            ),
            suffix: ' HF',
          },
          {
            name: 'Unidades Utah',
            color: '#547ec8',
            values: dias.map(
              (dia) => (aporteDiario ? dia.metrics.utahChillUnits : dia.metrics.utahChillUnitsAccumulated) ?? null
            ),
            suffix: ' UF',
          },
          {
            name: 'Porciones de frío',
            color: '#8d65b8',
            values: dias.map(
              (dia) => (aporteDiario ? dia.metrics.chillPortions : dia.metrics.chillPortionsAccumulated) ?? null
            ),
            suffix: ' CP',
          },
        ];
    const visibles = definiciones.filter((item) => item.values.some((value) => this.esNumero(value)));
    if (!dias.length || !visibles.length) return undefined;
    const posicionesFechas = this.posicionesFechasGrafico(dias.length);
    const panelesIndependientes = !vernalizacion && this.esDormanciaPerenne;
    const temperaturaMinima = dias.map((dia) => dia.metrics.temperatureMinC ?? null);
    const temperaturaMaxima = dias.map((dia) => dia.metrics.temperatureMaxC ?? null);
    const mostrarTemperatura =
      panelesIndependientes &&
      [temperaturaMinima, temperaturaMaxima].some((serie) => serie.some((value) => this.esNumero(value)));
    const cantidadPaneles = visibles.length + (mostrarTemperatura ? 1 : 0);
    const altoPanel = panelesIndependientes
      ? cantidadPaneles === 1
        ? 100
        : cantidadPaneles === 2
          ? 43
          : cantidadPaneles === 3
            ? 25
            : 18
      : 100;
    const separacionPanel = panelesIndependientes
      ? cantidadPaneles === 1
        ? 0
        : cantidadPaneles === 2
          ? 53
          : cantidadPaneles === 3
            ? 34
            : 25
      : 0;
    const rangoTemperatura = this.rangoTemperaturaGrafico(temperaturaMinima, temperaturaMaxima);
    const ejeTemperatura: Highcharts.YAxisOptions = {
      title: {
        text: 'Temperatura °C',
        style: { color: '#60708c', fontSize: '10px', fontWeight: '700' },
      },
      labels: { style: { color: '#60708c', fontSize: '10px' } },
      top: '0%',
      height: `${altoPanel}%`,
      offset: 0,
      min: rangoTemperatura.min,
      max: rangoTemperatura.max,
      tickAmount: 3,
      startOnTick: false,
      endOnTick: false,
      gridLineColor: 'rgba(119, 150, 180, 0.16)',
      plotBands: [
        rangoTemperatura.max > 15.9
          ? {
              from: Math.max(15.9, rangoTemperatura.min),
              to: Math.min(18, rangoTemperatura.max),
              color: 'rgba(215, 131, 61, 0.07)',
            }
          : undefined,
        rangoTemperatura.max > 18
          ? {
              from: Math.max(18, rangoTemperatura.min),
              to: rangoTemperatura.max,
              color: 'rgba(215, 131, 61, 0.13)',
            }
          : undefined,
      ].filter(Boolean) as Highcharts.YAxisPlotBandsOptions[],
      plotLines:
        rangoTemperatura.min <= 15.9 && rangoTemperatura.max >= 15.9
          ? [{ value: 15.9, width: 1, color: 'rgba(215, 131, 61, 0.7)', dashStyle: 'ShortDash' }]
          : undefined,
    };
    const ejeDeModelo = (item: (typeof visibles)[number], index: number): Highcharts.YAxisOptions => {
      const esUtah = item.name === 'Unidades Utah';
      const rango = this.rangoGrafico(item.values, esUtah);
      const unidad = item.name === 'Horas de frío' ? 'HF' : esUtah ? 'UF Utah' : 'CP';
      return {
        title: {
          text: aporteDiario ? `${unidad}/día` : unidad,
          style: { color: item.color, fontSize: '10px', fontWeight: '700' },
        },
        labels: { style: { color: '#60708c', fontSize: '10px' } },
        top: `${(index + (mostrarTemperatura ? 1 : 0)) * separacionPanel}%`,
        height: `${altoPanel}%`,
        offset: 0,
        min: rango.min,
        max: rango.max,
        tickAmount: 3,
        startOnTick: false,
        endOnTick: false,
        gridLineColor: 'rgba(119, 150, 180, 0.16)',
        plotLines: esUtah ? [{ value: 0, width: 1.5, color: 'rgba(31, 48, 71, 0.55)', zIndex: 4 }] : undefined,
      };
    };
    return {
      chart: {
        backgroundColor: 'transparent',
        height: panelesIndependientes ? (mostrarTemperatura ? 430 : 372) : 320,
        spacing: [10, 12, 24, 12],
        type: aporteDiario ? 'column' : 'spline',
        zooming: { type: 'x' },
      },
      title: { text: undefined },
      xAxis: {
        categories: dias.map((dia) => this.fechaCorta(dia.date)),
        tickPositions: posicionesFechas,
        labels: {
          autoRotation: [],
          rotation: 0,
          style: { color: '#60708c', fontSize: '10px' },
        },
        tickLength: 4,
        tickColor: 'rgba(96, 112, 140, 0.45)',
        lineColor: 'rgba(96, 112, 140, 0.45)',
        gridLineWidth: 0,
      },
      yAxis: panelesIndependientes
        ? [...(mostrarTemperatura ? [ejeTemperatura] : []), ...visibles.map(ejeDeModelo)]
        : vernalizacion
          ? visibles.map((item, index) => ({
              title: { text: item.name },
              opposite: index > 0,
              min: 0,
              gridLineColor: 'rgba(119, 150, 180, 0.16)',
            }))
          : [
              {
                title: { text: aporteDiario ? 'HF / UF diarias' : 'HF / UF acumuladas' },
                min: aporteDiario ? undefined : 0,
                gridLineColor: 'rgba(119, 150, 180, 0.16)',
                plotLines: aporteDiario
                  ? [{ value: 0, width: 1.5, color: 'rgba(31, 48, 71, 0.5)', zIndex: 4 }]
                  : undefined,
              },
              {
                title: { text: aporteDiario ? 'CP diarias' : 'CP acumuladas' },
                opposite: true,
                min: 0,
                gridLineWidth: 0,
              },
            ],
      tooltip: {
        shared: true,
        headerFormat: `<b>${aporteDiario ? 'Aporte diario' : 'Acumulado'} · {point.key}</b><br/>`,
      },
      legend: { enabled: true, align: 'center', verticalAlign: 'bottom' },
      plotOptions: {
        series: {
          connectNulls: false,
          marker: { enabled: !panelesIndependientes && dias.length <= 45, radius: 2.5 },
          lineWidth: 2,
          turboThreshold: 0,
          animation: false,
        },
        column: {
          borderWidth: 0,
          borderRadius: 2,
          groupPadding: 0.12,
          pointPadding: 0.04,
        },
      },
      series: [
        ...(mostrarTemperatura
          ? [
              {
                name: 'Temp. mínima',
                data: temperaturaMinima,
                color: '#60708c',
                dashStyle: 'ShortDash' as const,
                type: 'spline' as const,
                yAxis: 0,
                lineWidth: 1.7,
                marker: { enabled: false },
                tooltip: { valueSuffix: ' °C', valueDecimals: 1 },
                zIndex: 5,
              },
              {
                name: 'Temp. máxima',
                data: temperaturaMaxima,
                color: '#d7833d',
                type: 'spline' as const,
                yAxis: 0,
                lineWidth: 1.9,
                marker: { enabled: false },
                tooltip: { valueSuffix: ' °C', valueDecimals: 1 },
                zIndex: 5,
              },
            ]
          : []),
        ...visibles.map((item, index) => ({
          name: item.name,
          data: item.values,
          color: item.color,
          negativeColor: aporteDiario && item.name === 'Unidades Utah' ? '#d7833d' : item.color,
          type: (aporteDiario ? 'column' : 'spline') as 'spline' | 'column',
          yAxis: panelesIndependientes
            ? index + (mostrarTemperatura ? 1 : 0)
            : vernalizacion
              ? Math.min(index, 1)
              : index === 2
                ? 1
                : 0,
          tooltip: { valueSuffix: item.suffix, valueDecimals: item.name === 'Porciones de frío' ? 2 : 1 },
        })),
      ],
      credits: { enabled: false },
      accessibility: { enabled: false },
    };
  }

  private posicionesFechasGrafico(cantidad: number): number[] {
    if (cantidad <= 1) return [0];
    const marcas = Math.min(6, cantidad);
    return Array.from(
      new Set(Array.from({ length: marcas }, (_, index) => Math.round((index * (cantidad - 1)) / (marcas - 1))))
    );
  }

  private rangoGrafico(values: Array<number | null | undefined>, incluirCero: boolean): { min: number; max: number } {
    const numeros = values.filter((value): value is number => this.esNumero(value));
    if (!numeros.length) return { min: 0, max: 1 };
    const minimoBase = incluirCero ? Math.min(0, ...numeros) : Math.min(...numeros, 0);
    const maximoBase = Math.max(0, ...numeros);
    const amplitud = maximoBase - minimoBase;
    if (amplitud === 0) {
      return minimoBase === 0 ? { min: 0, max: 1 } : { min: minimoBase * 1.08, max: 0 };
    }
    const margen = amplitud * 0.08;
    return {
      min: minimoBase < 0 ? minimoBase - margen : 0,
      max: maximoBase > 0 ? maximoBase + margen : 0,
    };
  }

  private rangoTemperaturaGrafico(
    minimas: Array<number | null | undefined>,
    maximas: Array<number | null | undefined>
  ): { min: number; max: number } {
    const valores = [...minimas, ...maximas].filter((value): value is number => this.esNumero(value));
    if (!valores.length) return { min: 0, max: 20 };
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const amplitud = maximo - minimo;
    const margen = Math.max(1, amplitud * 0.08);
    return amplitud === 0 ? { min: minimo - 1, max: maximo + 1 } : { min: minimo - margen, max: maximo + margen };
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
