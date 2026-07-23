import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import {
  ICargaFitosanitaria,
  IFitosanitarioAplicacionResumen,
  IFitosanitarioFactor,
  IFitosanitarioRiesgoSanitario,
  ISiembra,
  TNivelCargaFitosanitaria,
} from 'modelos/src';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-card-carga-fitosanitaria',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-carga-fitosanitaria.component.html',
  styleUrl: './card-carga-fitosanitaria.component.scss',
})
export class CardCargaFitosanitariaComponent implements OnChanges {
  @Input() public lote?: IDetallesLote;
  @Input() public siembra?: ISiembra;

  public carga?: ICargaFitosanitaria;
  public cargando = false;
  public error?: string;
  public verDetalle = false;
  private ultimaConsulta?: string;

  constructor(
    public helper: HelperService,
    private loteService: LoteService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] || changes['siembra']) {
      void this.cargar();
    }
  }

  public async actualizar(event?: Event): Promise<void> {
    event?.stopPropagation();
    await this.cargar(true);
  }

  public abrirDetalle(): void {
    if (this.carga) {
      this.verDetalle = true;
    }
  }

  public activarTarjeta(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    this.abrirDetalle();
  }

  public get subtitulo(): string {
    if (this.cargando && !this.carga) {
      return 'Calculando trazabilidad por lote';
    }
    if (!this.carga) {
      return this.error || 'Sin lectura fitosanitaria';
    }
    const cultivo = this.carga.cultivo || 'cultivo';
    const etapa = this.carga.etapaActual || 'etapa operativa';
    return `${cultivo} - ${etapa}`;
  }

  public get nivelClase(): TNivelCargaFitosanitaria {
    return this.carga?.nivel || 'sin_datos';
  }

  public get nivelTexto(): string {
    const labels: Record<TNivelCargaFitosanitaria, string> = {
      sin_datos: 'Sin datos',
      bajo: 'Bajo',
      medio: 'Medio',
      alto: 'Alto',
      critico: 'Critico',
    };
    return labels[this.nivelClase];
  }

  public get score(): number {
    return this.carga?.score || 0;
  }

  public get factores(): IFitosanitarioFactor[] {
    return this.carga?.factores || [];
  }

  public get aplicacionesPrincipales(): IFitosanitarioAplicacionResumen[] {
    return (this.carga?.aplicaciones || []).slice(0, 4);
  }

  public get enfermedadesPrincipales(): IFitosanitarioRiesgoSanitario[] {
    return (this.carga?.enfermedades || []).slice(0, 4);
  }

  public get tieneEventos(): boolean {
    return !!this.aplicacionesPrincipales.length || !!this.enfermedadesPrincipales.length;
  }

  public porcentaje(value?: number): number {
    const numero = Number(value);
    if (!Number.isFinite(numero)) {
      return 0;
    }
    return Math.max(0, Math.min(100, numero));
  }

  private async cargar(force = false): Promise<void> {
    const idLote = this.lote?._id;
    if (!idLote || this.cargando) {
      return;
    }
    const clave = `${idLote}:${this.siembra?._id || 'sin-siembra'}`;
    if (!force && this.ultimaConsulta === clave && this.carga) {
      return;
    }

    this.ultimaConsulta = clave;
    this.cargando = true;
    this.error = undefined;
    try {
      this.carga = await this.loteService.cargaFitosanitaria(idLote);
    } catch (error) {
      console.error('Error al cargar carga fitosanitaria', error);
      this.error = 'No se pudo calcular la carga fitosanitaria.';
    } finally {
      this.cargando = false;
    }
  }
}
