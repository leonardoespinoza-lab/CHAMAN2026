import { Component, inject, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { ILote, IUbicacionAdministrativaLote } from 'modelos/src';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';

@Component({
  selector: 'app-card-ubicacion-lote',
  imports: [SharedModule],
  templateUrl: './card-ubicacion-lote.component.html',
  styleUrl: './card-ubicacion-lote.component.scss',
})
export class CardUbicacionLoteComponent implements OnChanges, OnDestroy {
  @Input() lote?: ILote;

  private readonly loteService = inject(LoteService);
  private readonly helper = inject(HelperService);
  public ubicacion?: IUbicacionAdministrativaLote | null;
  public cargando = false;
  public reintentando = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollCount = 0;
  private readonly maxPolls = 10;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['lote']) return;
    this.clearPolling();
    this.ubicacion = this.lote?.ubicacionAdministrativa;
    if (this.lote?._id) void this.cargar(false);
  }

  ngOnDestroy(): void {
    this.clearPolling();
  }

  public get estado(): string {
    return this.ubicacion?.estado || 'pending';
  }

  public get procesando(): boolean {
    return ['pending', 'processing'].includes(this.estado);
  }

  public get listo(): boolean {
    return ['ready', 'partial'].includes(this.estado);
  }

  public get tituloAdministrativo(): string {
    const admin = this.ubicacion?.nivelAdministrativo2;
    if (!admin?.nombre) return 'Segundo nivel sin determinar';
    return `${admin.tipo || 'Departamento'} ${admin.nombre}`;
  }

  public get confianzaLabel(): string {
    const value = this.ubicacion?.confianza || 'sin_calcular';
    if (value === 'sin_calcular') return 'Pendiente';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  public get fuenteLabel(): string {
    const source = this.ubicacion?.fuente || 'GeoRef Argentina';
    const version = this.ubicacion?.sourceVersion?.slice(0, 10);
    return version ? `${source} · versión ${version}` : source;
  }

  public distancia(value?: number): string {
    if (!Number.isFinite(value)) return 'Distancia no disponible';
    if (value === 0) return 'Dentro del lote';
    if (value! < 1000) return `${Math.round(value!)} m del límite`;
    return `${(value! / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km del límite`;
  }

  public cobertura(value?: number): string {
    if (!Number.isFinite(value)) return '—';
    return `${value!.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
  }

  public estadoTexto(): string {
    const labels: Record<string, string> = {
      missing_geometry: 'Falta dibujar el polígono del lote.',
      pending: 'La ubicación quedó en cola y se resolverá automáticamente.',
      processing: 'Cruzando el polígono con las jurisdicciones oficiales.',
      invalid_geometry: 'El polígono no es válido. Revisá sus límites en la edición del lote.',
      outside_supported_area: 'El polígono no interseca el territorio argentino soportado.',
      source_unavailable: 'El catálogo oficial no está disponible temporalmente.',
      failed: 'No se pudo completar la clasificación territorial.',
    };
    return labels[this.estado] || 'Ubicación administrativa disponible.';
  }

  public async reintentar(): Promise<void> {
    if (!this.lote?._id || this.reintentando) return;
    this.reintentando = true;
    try {
      this.ubicacion = await this.loteService.reprocesarUbicacionAdministrativa(this.lote._id, true);
      this.schedulePolling();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.reintentando = false;
    }
  }

  private async cargar(showLoading: boolean): Promise<void> {
    if (!this.lote?._id) return;
    if (showLoading) this.cargando = true;
    try {
      const result = await this.loteService.ubicacionAdministrativa(this.lote._id);
      if (result) this.ubicacion = result;
      this.schedulePolling();
    } catch {
      // El detalle principal sigue operativo aun si el estado auxiliar no responde.
    } finally {
      this.cargando = false;
    }
  }

  private schedulePolling(): void {
    this.clearPolling(false);
    if (!this.procesando || this.pollCount >= this.maxPolls) return;
    this.pollCount += 1;
    this.pollTimer = setTimeout(() => void this.cargar(false), 1800);
  }

  private clearPolling(resetCount = true): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    if (resetCount) this.pollCount = 0;
  }
}
