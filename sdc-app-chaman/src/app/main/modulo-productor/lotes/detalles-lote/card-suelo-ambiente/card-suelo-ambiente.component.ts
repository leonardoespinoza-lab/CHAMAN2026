import { Component, inject, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { IInteligenciaSueloLote, ILote, IPerfilProfundidadSuelo, TClaseDrenajeSuelo } from 'modelos/src';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';

@Component({
  selector: 'app-card-suelo-ambiente',
  imports: [SharedModule],
  templateUrl: './card-suelo-ambiente.component.html',
  styleUrl: './card-suelo-ambiente.component.scss',
})
export class CardSueloAmbienteComponent implements OnChanges, OnDestroy {
  @Input() lote?: ILote;

  private readonly loteService = inject(LoteService);
  public readonly helper = inject(HelperService);
  public assessment?: IInteligenciaSueloLote | null;
  public loading = false;
  public retrying = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollCount = 0;
  private readonly maxPolls = 20;
  private assessmentKey?: string;
  private loadGeneration = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['lote']) return;
    const nextKey = this.currentAssessmentKey();
    if (!nextKey) {
      this.loadGeneration += 1;
      this.assessmentKey = undefined;
      this.clearPolling();
      this.assessment = undefined;
      this.loading = false;
      this.retrying = false;
      return;
    }
    if (nextKey === this.assessmentKey) return;
    this.loadGeneration += 1;
    this.assessmentKey = nextKey;
    this.clearPolling();
    this.assessment = undefined;
    this.retrying = false;
    if (this.lote?._id) void this.load(true);
  }

  ngOnDestroy(): void {
    this.clearPolling();
  }

  public get status(): string {
    return this.assessment?.status || 'pending';
  }

  public get processing(): boolean {
    return ['pending', 'processing'].includes(this.status);
  }

  public get hasResult(): boolean {
    return ['ready', 'partial'].includes(this.status) && !!this.assessment?.summary;
  }

  public get profile(): IPerfilProfundidadSuelo[] {
    return (this.assessment?.depthProfile || []).filter(
      (layer) => Number.isFinite(layer.sandQ50) && Number.isFinite(layer.siltQ50) && Number.isFinite(layer.clayQ50)
    );
  }

  public get hasWaterProfile(): boolean {
    return this.profile.some(
      (layer) => Number.isFinite(layer.fieldCapacityPercentage) && Number.isFinite(layer.wiltingPointPercentage)
    );
  }

  public get confidenceLabel(): string {
    const labels: Record<string, string> = {
      high: 'Confianza alta',
      medium: 'Confianza media',
      low: 'Confianza baja',
      unavailable: 'Sin confianza calculable',
    };
    return labels[this.assessment?.source?.confidence || 'unavailable'];
  }

  public get sourceLabel(): string {
    const sourceTypes = new Set((this.assessment?.sources || []).map((source) => source.type));
    if (sourceTypes.has('inta') && sourceTypes.has('soilgrids')) return 'INTA + SoilGrids';
    if (sourceTypes.has('inta')) return 'INTA';
    if (sourceTypes.has('soilgrids')) return 'SoilGrids';
    const labels: Record<string, string> = {
      manual: this.isOperationalTextureConfirmed ? 'Solo dato confirmado' : 'Solo dato legacy',
      laboratory: 'Solo laboratorio',
      inta: 'INTA',
      soilgrids: 'SoilGrids',
      mixed: 'INTA + SoilGrids',
      derived: 'Estimado',
      unknown: 'Fuente pendiente',
    };
    return labels[this.assessment?.source?.type || 'unknown'];
  }

  public get canonicalTextureLabel(): string {
    return (
      this.assessment?.summary?.canonicalTexture ||
      this.assessment?.summary?.estimatedTexture ||
      this.assessment?.summary?.operationalTexture ||
      'Sin determinar'
    );
  }

  public get primaryTextureTitle(): string {
    return this.assessment?.summary?.canonicalTexture || this.assessment?.summary?.estimatedTexture
      ? 'Textura cartográfica canónica'
      : 'Textura disponible';
  }

  public get hasOperationalOverride(): boolean {
    const summary = this.assessment?.summary;
    if (!summary?.operationalTexture || !(summary.canonicalTexture || summary.estimatedTexture)) return false;
    const source = summary.operationalTextureSource;
    return (
      this.lote?.sueloConfirmadoPorUsuario === true ||
      source === 'manual' ||
      source === 'laboratory' ||
      source === 'sensor'
    );
  }

  public get operationalTextureLabel(): string {
    return this.assessment?.summary?.operationalTexture || 'Sin override';
  }

  public get isOperationalTextureConfirmed(): boolean {
    return this.lote?.sueloConfirmadoPorUsuario === true;
  }

  public get operationalTextureTitle(): string {
    if (this.isOperationalTextureConfirmed) return 'Override operativo confirmado';
    return this.assessment?.summary?.operationalTextureSource === 'manual'
      ? 'Alternativa legacy'
      : 'Alternativa operativa';
  }

  public get operationalSourceLabel(): string {
    const source = this.assessment?.summary?.operationalTextureSource || this.lote?.sueloProcedencia || 'unknown';
    if (source === 'manual') {
      return this.isOperationalTextureConfirmed ? 'Confirmado por usuario' : 'Dato legacy no confirmado';
    }
    const labels: Record<string, string> = {
      laboratory: 'Análisis de laboratorio',
      sensor: 'Calibrado con sensor',
      inta_local: 'INTA regional',
      inta_national: 'INTA nacional',
      sisinta: 'SISINTA',
      soilgrids: 'SoilGrids',
      derived: 'Estimación derivada',
      unknown: 'Origen no identificado',
    };
    return labels[source] || labels['unknown'];
  }

  public get operationalTextureDetail(): string {
    if (this.isOperationalTextureConfirmed) return 'Tiene prioridad operativa por confirmación explícita.';
    if (this.assessment?.summary?.operationalTextureSource === 'manual') {
      return 'Referencia histórica; requiere confirmación antes de tratarla como validada.';
    }
    return 'Se muestra separada de la cartografía automática.';
  }

  public get operationalConflictTitle(): string {
    if (this.isOperationalTextureConfirmed) return 'El override confirmado difiere de la cartografía canónica';
    return this.assessment?.summary?.operationalTextureSource === 'manual'
      ? 'La alternativa legacy difiere de la cartografía canónica'
      : 'La alternativa operativa difiere de la cartografía canónica';
  }

  public get operationalConflictDetail(): string {
    if (this.isOperationalTextureConfirmed) {
      return 'La referencia automática permanece visible; el valor confirmado conserva su prioridad operativa.';
    }
    return this.assessment?.summary?.operationalTextureSource === 'manual'
      ? 'La referencia automática permanece principal; el dato legacy se muestra sin atribuirle confirmación.'
      : 'La referencia automática permanece principal y la alternativa se informa con su origen.';
  }

  public get depthLabel(): string {
    const summary = this.assessment?.summary;
    if (!summary) return '—';
    return `${summary.depthFromCm}–${summary.depthToCm} cm`;
  }

  public get hasCoverage(): boolean {
    return Number.isFinite(this.assessment?.source?.coveragePercentage);
  }

  public get hasResolution(): boolean {
    return Number.isFinite(this.assessment?.source?.resolutionMeters);
  }

  public drainageLabel(value?: TClaseDrenajeSuelo): string {
    const labels: Record<TClaseDrenajeSuelo, string> = {
      excessive: 'Excesivo',
      somewhat_excessive: 'Algo excesivo',
      well: 'Bien drenado',
      moderately_well: 'Moderadamente bien drenado',
      imperfect: 'Imperfecto',
      poor: 'Pobre',
      very_poor: 'Muy pobre',
      unknown: 'No determinado',
    };
    return labels[value || 'unknown'];
  }

  public number(value?: number, digits = 1): string {
    if (!Number.isFinite(value)) return 'No informado';
    return value!.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  }

  public width(value?: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value!)) : 0;
  }

  public waterWidth(value?: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value!)) : 0;
  }

  public layerUncertainty(layer: IPerfilProfundidadSuelo): string {
    const ranges = [
      this.range(layer.sandQ05, layer.sandQ95),
      this.range(layer.siltQ05, layer.siltQ95),
      this.range(layer.clayQ05, layer.clayQ95),
    ].filter(Boolean);
    return ranges.length ? `Intervalos predictivos 90%: ${ranges.join(' · ')}` : 'Incertidumbre no disponible';
  }

  public stateText(): string {
    const labels: Record<string, string> = {
      missing_geometry: 'Falta dibujar un polígono válido para caracterizar el suelo.',
      pending: 'El lote está en cola para caracterización edáfica.',
      processing: 'Estamos cruzando el polígono con INTA y SoilGrids.',
      no_coverage: 'Las fuentes configuradas no informaron cobertura para este lote.',
      invalid_geometry: 'El polígono del lote no es válido.',
      source_unavailable: 'Las fuentes edáficas no están disponibles temporalmente.',
      failed: 'No se pudo completar la caracterización del suelo.',
    };
    return labels[this.status] || 'Caracterización edáfica disponible.';
  }

  public async retry(): Promise<void> {
    if (!this.lote?._id || this.retrying) return;
    const id = this.lote._id;
    const assessmentKey = this.assessmentKey;
    const generation = this.loadGeneration;
    this.retrying = true;
    try {
      const assessment = await this.loteService.reprocesarSueloAmbiente(id);
      if (!this.isCurrentLoad(id, assessmentKey, generation)) return;
      this.assessment = assessment;
      this.schedulePolling();
    } catch (error) {
      if (this.isCurrentLoad(id, assessmentKey, generation)) this.helper.notifError(error);
    } finally {
      if (this.isCurrentLoad(id, assessmentKey, generation)) this.retrying = false;
    }
  }

  private async load(showLoading: boolean): Promise<void> {
    if (!this.lote?._id) return;
    const id = this.lote._id;
    const assessmentKey = this.assessmentKey;
    const generation = this.loadGeneration;
    if (showLoading) this.loading = true;
    try {
      const assessment = await this.loteService.sueloAmbiente(id);
      if (!this.isCurrentLoad(id, assessmentKey, generation)) return;
      this.assessment = assessment;
      this.schedulePolling();
    } catch {
      if (this.isCurrentLoad(id, assessmentKey, generation)) this.assessment = null;
    } finally {
      if (this.isCurrentLoad(id, assessmentKey, generation)) this.loading = false;
    }
  }

  private schedulePolling(): void {
    this.clearPolling(false);
    if (!this.processing || this.pollCount >= this.maxPolls) return;
    this.pollCount += 1;
    this.pollTimer = setTimeout(() => void this.load(false), 2500);
  }

  private clearPolling(resetCount = true): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    if (resetCount) this.pollCount = 0;
  }

  private range(low?: number, high?: number): string {
    if (!Number.isFinite(low) || !Number.isFinite(high)) return '';
    return `${this.number(low)}–${this.number(high)}%`;
  }

  private currentAssessmentKey(): string | undefined {
    if (!this.lote?._id) return undefined;
    const geometry = this.lote.ubicacion?.geojson?.coordinates || this.lote.ubicacion?.poligono || [];
    return `${this.lote._id}:${JSON.stringify(geometry)}:${this.lote.sueloFechaConfirmacion || ''}`;
  }

  private isCurrentLoad(id: string, assessmentKey: string | undefined, generation: number): boolean {
    return this.lote?._id === id && this.assessmentKey === assessmentKey && this.loadGeneration === generation;
  }
}
