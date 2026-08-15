import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { INapaSeguimientoLote } from 'modelos/src';
import { NapasService } from '../../../../../auxiliares/http/napas.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

@Component({
  selector: 'app-card-napas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-napas.component.html',
  styleUrl: './card-napas.component.scss',
})
export class CardNapasComponent implements OnChanges, OnDestroy {
  @Input() public lote?: IDetallesLote;

  public seguimiento?: INapaSeguimientoLote;
  public cargando = false;
  public error?: string;
  private ultimoKey?: string;
  private loadVersion = 0;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  private readonly fechaAr = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  });

  constructor(private napasService: NapasService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      void this.cargarSeguimiento();
    }
  }

  ngOnDestroy(): void {
    this.loadVersion++;
  }

  public async refrescar(event?: Event): Promise<void> {
    event?.stopPropagation();
    this.ultimoKey = undefined;
    await this.cargarSeguimiento();
  }

  public get subtitulo(): string {
    if (this.cargando) return 'Actualizando medicion';
    if (this.error) return 'No se pudo actualizar';
    if (!this.seguimiento) return 'Sin referencia disponible';
    if (this.seguimiento.tipo === 'sensor_lote') return 'Sensor instalado en el lote';
    if (this.seguimiento.tipo === 'sensor_cercano') return 'Referencia de un sensor cercano';
    return 'Referencia territorial, no medicion del lote';
  }

  public get nivelResumen(): string {
    const nivel = this.seguimiento?.nivelM;
    return nivel === undefined ? 'Sin nivel' : `${this.numeroAr.format(nivel)} m`;
  }

  public get fuenteLabel(): string {
    if (!this.seguimiento) return 'Sin fuente';
    if (this.seguimiento.tipo === 'sensor_lote') return 'Medicion directa';
    if (this.seguimiento.tipo === 'sensor_cercano') return 'Referencia cercana';
    return 'SIAS territorial';
  }

  public get origenLabel(): string {
    const seguimiento = this.seguimiento;
    if (!seguimiento) return 'Sin origen';
    if (seguimiento.tipo === 'sias') return seguimiento.fuente;
    if (seguimiento.tipo === 'sensor_cercano') {
      return `${seguimiento.origen.lote} · ${this.formatearDistancia(seguimiento.distanciaKm)}`;
    }
    return seguimiento.origen.fuente;
  }

  public get fechaLabel(): string {
    const fecha = this.seguimiento?.fechaMedicion;
    if (!fecha) return 'Sin fecha publicada';
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      const [year, month, day] = fecha.split('-');
      return `${day}/${month}/${year}`;
    }
    const timestamp = Date.parse(fecha);
    return Number.isFinite(timestamp) ? this.fechaAr.format(timestamp) : 'Fecha no disponible';
  }

  public get frescuraLabel(): string {
    const seguimiento = this.seguimiento;
    if (!seguimiento) return 'Sin dato';
    if (seguimiento.tipo === 'sias') {
      return seguimiento.frescura === 'territorial' ? 'Dato territorial historico' : 'Sin datos cercanos';
    }
    if (seguimiento.edadMinutos < 60) {
      return `Hace ${Math.max(0, Math.round(seguimiento.edadMinutos))} min`;
    }
    return `Hace ${Math.max(1, Math.round(seguimiento.edadMinutos / 60))} h`;
  }

  public get columnaLabel(): string {
    const seguimiento = this.seguimiento;
    if (!seguimiento || seguimiento.tipo === 'sias' || seguimiento.columnaAguaM === undefined) {
      return 'No disponible';
    }
    return `${this.numeroAr.format(seguimiento.columnaAguaM)} m`;
  }

  public get calidadLabel(): string {
    const seguimiento = this.seguimiento;
    if (!seguimiento) return 'Sin dato';
    if (seguimiento.tipo !== 'sias') {
      return seguimiento.frescura === 'demorada' ? 'Dato demorado' : 'Actual';
    }
    if (seguimiento.cobertura.calidad === 'alta') return 'Cobertura alta';
    if (seguimiento.cobertura.calidad === 'media') return 'Cobertura media';
    if (seguimiento.cobertura.calidad === 'baja') return 'Cobertura baja';
    return 'Sin cobertura';
  }

  public get esSensor(): boolean {
    return !!this.seguimiento && this.seguimiento.tipo !== 'sias';
  }

  private formatearDistancia(value: number): string {
    return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)} km`;
  }

  private async cargarSeguimiento(): Promise<void> {
    const idLote = this.lote?._id;
    const version = ++this.loadVersion;
    if (!idLote) {
      this.seguimiento = undefined;
      this.error = 'El lote no tiene un identificador valido.';
      this.cargando = false;
      return;
    }

    const key = String(idLote);
    if (this.ultimoKey === key && this.seguimiento) return;
    this.ultimoKey = key;
    this.cargando = true;
    this.error = undefined;

    try {
      const response = await this.napasService.seguimientoLote(key);
      if (version !== this.loadVersion || String(this.lote?._id || '') !== key) return;
      this.seguimiento = response;
    } catch (error) {
      if (version !== this.loadVersion) return;
      console.error('Error al consultar seguimiento de napas', error);
      this.seguimiento = undefined;
      this.error = 'No se pudo consultar la napa del lote.';
    } finally {
      if (version === this.loadVersion) {
        this.cargando = false;
      }
    }
  }
}
