import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { IPrediccionMalezaEspecie, IResultadoPrediccionMalezas, ISiembra } from 'modelos/src';
import { SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

const CULTIVOS_CON_PREDICCION_MALEZAS = ['Soja', 'Trigo', 'Maiz'];

@Component({
  selector: 'app-card-malezas',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-malezas.component.html',
  styleUrl: './card-malezas.component.scss',
})
export class CardMalezasComponent implements OnInit, OnChanges, OnDestroy {
  private static readonly prediccionesPendientes = new Map<string, Promise<IResultadoPrediccionMalezas>>();

  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;

  public actualizando = false;
  public actualizacionAutomatica = false;
  public error?: string;
  public verDetalleMaleza = false;
  public malezaSeleccionada?: IPrediccionMalezaEspecie;
  public prediccion?: IResultadoPrediccionMalezas;
  private readonly formatterDia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private siembraService: SiembraService,
    public helper: HelperService
  ) {}

  public get cultivo(): string {
    return this.siembra?.semilla?.cultivo || '';
  }

  public get cultivoCompatible(): boolean {
    return CULTIVOS_CON_PREDICCION_MALEZAS.includes(this.cultivo);
  }

  public get analisis(): IPrediccionMalezaEspecie[] {
    return this.prediccion?.especies || [];
  }

  public get fechaUltimaPrediccion(): Date | undefined {
    return this.prediccion?.fecha ? new Date(this.prediccion.fecha) : undefined;
  }

  public get prediccionAlDia(): boolean {
    return this.prediccionEsDeHoy(this.prediccion);
  }

  public get resumenGeneral(): string {
    if (!this.cultivoCompatible) {
      return 'Motor habilitado para trigo, soja y maiz.';
    }
    if (this.prediccion?.resumen) {
      return this.prediccion.resumen;
    }
    return `${this.cultivo}: sincronizacion diaria de emergencia de malezas.`;
  }

  public get totalModelos(): number {
    return this.analisis.length;
  }

  public abrirDetalleMaleza(item: IPrediccionMalezaEspecie): void {
    this.malezaSeleccionada = item;
    this.verDetalleMaleza = true;
  }

  public cerrarDetalleMaleza(): void {
    this.verDetalleMaleza = false;
    this.malezaSeleccionada = undefined;
  }

  public async actualizarPrediccion(
    event?: Event,
    options: { silent?: boolean; force?: boolean } = {}
  ): Promise<void> {
    event?.stopPropagation();
    if (!this.siembra?._id || this.actualizando || !this.cultivoCompatible) return;
    if (!options.force && this.prediccionAlDia) return;

    this.actualizando = true;
    this.actualizacionAutomatica = !!options.silent;
    this.error = undefined;
    try {
      const resultado = await this.obtenerPrediccion(options.force);
      this.prediccion = resultado;
      this.siembra.ultimaPrediccionMalezas = resultado;
      if (resultado.estado === 'sin_clima') {
        this.error = 'No se pudo actualizar malezas: falta clima disponible.';
        if (!options.silent) this.helper.notifError('No se pudo actualizar malezas: falta clima disponible');
      } else if (resultado.estado === 'sin_modelos') {
        this.error = 'No hay modelos de malezas cargados para este cultivo.';
        if (!options.silent) this.helper.notifError('No hay modelos de malezas cargados para este cultivo');
      } else if (!options.silent) {
        this.helper.notifSuccess('Prediccion de malezas actualizada');
      }
    } catch (error) {
      this.error = 'No se pudo sincronizar la prediccion diaria de malezas.';
      if (!options.silent) this.helper.notifError(error);
    } finally {
      this.actualizando = false;
      this.actualizacionAutomatica = false;
    }
  }

  async ngOnInit(): Promise<void> {
    this.sincronizarPrediccion();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['siembra']) {
      this.sincronizarPrediccion();
    }
  }

  ngOnDestroy(): void {}

  private sincronizarPrediccion(): void {
    this.prediccion = this.siembra?.ultimaPrediccionMalezas;
    this.malezaSeleccionada = undefined;
    this.verDetalleMaleza = false;
    this.error = undefined;
    void this.actualizarAutomaticamenteSiCorresponde();
  }

  private async actualizarAutomaticamenteSiCorresponde(): Promise<void> {
    if (!this.siembra?._id || !this.cultivoCompatible || this.siembra.fechaCosecha) return;
    if (this.helper.soloLectura() || this.prediccionAlDia || this.actualizando) return;
    await this.actualizarPrediccion(undefined, { silent: true });
  }

  private obtenerPrediccion(force = false): Promise<IResultadoPrediccionMalezas> {
    const idSiembra = this.siembra!._id!;
    const key = `${idSiembra}:${this.hoyKey()}${force ? ':force' : ''}`;
    const pendiente = CardMalezasComponent.prediccionesPendientes.get(key);
    if (pendiente) return pendiente;

    const request = this.siembraService
      .generarPrediccionMalezas(idSiembra)
      .finally(() => CardMalezasComponent.prediccionesPendientes.delete(key));
    CardMalezasComponent.prediccionesPendientes.set(key, request);
    return request;
  }

  private prediccionEsDeHoy(prediccion?: IResultadoPrediccionMalezas): boolean {
    if (!prediccion?.fecha) return false;
    return this.dateKey(prediccion.fecha) === this.hoyKey();
  }

  private hoyKey(): string {
    return this.formatterDia.format(new Date());
  }

  private dateKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return this.formatterDia.format(date);
  }
}
