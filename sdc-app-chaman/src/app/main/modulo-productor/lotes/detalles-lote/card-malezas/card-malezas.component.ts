import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import {
  IPrediccionMalezaEspecie,
  IResultadoPrediccionMalezas,
  ISiembra,
  PREDICCION_MALEZAS_ENGINE_VERSION,
} from 'modelos/src';
import { LoteService } from '../../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';

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
    private loteService: LoteService,
    public helper: HelperService
  ) {}

  public get cultivo(): string {
    return this.siembra?.semilla?.cultivo || '';
  }

  public get cultivoCompatible(): boolean {
    return !!this.lote?._id;
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
      return 'El lote necesita una ubicación válida para iniciar el seguimiento.';
    }
    if (this.prediccion?.resumen) {
      return this.normalizarNombres(this.prediccion.resumen);
    }
    return `${this.cultivo || 'Lote sin siembra registrada'}: seguimiento estacional de emergencia de malezas.`;
  }

  public get totalModelos(): number {
    return this.analisis.length;
  }

  public nombreVisible(item?: IPrediccionMalezaEspecie): string {
    if (!item) return 'Detalle de maleza';
    const referencia = `${item.nombre || ''} ${item.nombreCientifico || ''}`.toLocaleLowerCase('es-AR');
    if (referencia.includes('eleusine') || referencia.includes('pata de gallina')) return 'Eleusine';
    if (referencia.includes('amaranthus') || referencia.includes('yuyo colorado')) return 'Amaranthus';
    return item.nombre || item.nombreCientifico || 'Maleza';
  }

  public abrirDetalleMaleza(item: IPrediccionMalezaEspecie): void {
    this.malezaSeleccionada = item;
    this.verDetalleMaleza = true;
  }

  public cerrarDetalleMaleza(): void {
    this.verDetalleMaleza = false;
    this.malezaSeleccionada = undefined;
  }

  public async actualizarPrediccion(event?: Event, options: { silent?: boolean; force?: boolean } = {}): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id || this.actualizando || !this.cultivoCompatible) return;
    if (!options.force && this.prediccionAlDia) return;

    this.actualizando = true;
    this.actualizacionAutomatica = !!options.silent;
    this.error = undefined;
    try {
      const resultado = await this.obtenerPrediccion(options.force);
      this.prediccion = resultado;
      this.lote.ultimaPrediccionMalezas = resultado;
      if (this.siembra) this.siembra.ultimaPrediccionMalezas = resultado;
      if (resultado.estado === 'sin_clima') {
        this.error = 'No se pudo actualizar malezas: falta clima disponible.';
        if (!options.silent) this.helper.notifError('No se pudo actualizar malezas: falta clima disponible');
      } else if (resultado.estado === 'sin_modelos') {
        this.error = 'No hay modelos de malezas cargados para esta campaña.';
        if (!options.silent) this.helper.notifError('No hay modelos de malezas cargados para esta campaña');
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
    if (changes['siembra'] || changes['lote']) {
      this.sincronizarPrediccion();
    }
  }

  ngOnDestroy(): void {}

  private sincronizarPrediccion(): void {
    this.prediccion = this.lote?.ultimaPrediccionMalezas || this.siembra?.ultimaPrediccionMalezas;
    this.malezaSeleccionada = undefined;
    this.verDetalleMaleza = false;
    this.error = undefined;
    void this.actualizarAutomaticamenteSiCorresponde();
  }

  private async actualizarAutomaticamenteSiCorresponde(): Promise<void> {
    if (!this.lote?._id || !this.cultivoCompatible) return;
    if (this.helper.soloLectura() || this.prediccionAlDia || this.actualizando) return;
    await this.actualizarPrediccion(undefined, { silent: true });
  }

  private obtenerPrediccion(force = false): Promise<IResultadoPrediccionMalezas> {
    const idLote = this.lote!._id!;
    const key = `${idLote}:${this.hoyKey()}${force ? ':force' : ''}`;
    const pendiente = CardMalezasComponent.prediccionesPendientes.get(key);
    if (pendiente) return pendiente;

    const request = this.loteService
      .generarPrediccionMalezas(idLote)
      .finally(() => CardMalezasComponent.prediccionesPendientes.delete(key));
    CardMalezasComponent.prediccionesPendientes.set(key, request);
    return request;
  }

  private prediccionEsDeHoy(prediccion?: IResultadoPrediccionMalezas): boolean {
    if (!prediccion?.fecha || !prediccion.contextoLote) return false;
    return (
      prediccion.versionMotor === PREDICCION_MALEZAS_ENGINE_VERSION && this.dateKey(prediccion.fecha) === this.hoyKey()
    );
  }

  private hoyKey(): string {
    return this.formatterDia.format(new Date());
  }

  private dateKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return this.formatterDia.format(date);
  }

  private normalizarNombres(texto: string): string {
    return texto.replace(/pata de gallina/gi, 'Eleusine').replace(/yuyo colorado/gi, 'Amaranthus');
  }
}
