import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ISiembra } from 'modelos/src';
import { HuellaHidricaSeguimiento, SiembraService } from '../../../../../auxiliares/http/siembra.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import { DrawerHuellaHidricaComponent } from '../drawer-huella-hidrica/drawer-huella-hidrica.component';

@Component({
  selector: 'app-card-huella-hidrica',
  imports: [CommonModule, SharedModule, DrawerHuellaHidricaComponent],
  templateUrl: './card-huella-hidrica.component.html',
  styleUrl: './card-huella-hidrica.component.scss',
})
export class CardHuellaHidricaComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;
  public verDrawerHuellaHidrica: boolean = false;
  public seguimiento?: HuellaHidricaSeguimiento;
  public cargandoSeguimiento = false;
  public errorSeguimiento?: string;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  private readonly decimalAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  private ultimaSiembraConsultada?: string;

  constructor(public helper: HelperService, private siembraService: SiembraService) {}

  async ngOnInit(): Promise<void> {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siembra']) {
      this.cargarSeguimiento();
    }
  }

  ngOnDestroy(): void {}

  public get subtitulo(): string {
    if (this.siembra?.huellaHidrica) {
      return 'Resultado final guardado al cosechar';
    }
    if (this.cargandoSeguimiento) {
      return 'Actualizando seguimiento con clima y aplicaciones';
    }
    if (this.seguimiento?.periodo.diasClima) {
      return `Seguimiento en campana: ${this.seguimiento.periodo.diasClima} dias climaticos`;
    }
    return 'Seguimiento en campana pendiente de sincronizacion';
  }

  public get huellas() {
    const huella = this.siembra?.huellaHidrica;
    const seguimiento = this.seguimiento;

    if (!huella) {
      const verde = seguimiento?.progreso.verde;
      const azul = seguimiento?.progreso.azul;
      const gris = seguimiento?.progreso.gris;
      return [
        {
          key: 'green',
          label: 'Verde',
          value: verde ? this.formatearAgua(verde.mm, verde.litrosKg) : 'Sin clima',
          detail: verde?.detalle || 'Se completa con lluvia efectiva desde Open-Meteo.',
          fill: this.limitar(verde?.porcentaje || 0),
        },
        {
          key: 'blue',
          label: 'Azul',
          value: azul ? this.formatearAgua(azul.mm, azul.litrosKg) : 'Sin riego',
          detail: azul?.detalle || 'Solo se computa con riego o aporte externo cargado.',
          fill: this.limitar(azul?.porcentaje || 0),
        },
        {
          key: 'gray',
          label: 'Gris',
          value: gris ? this.formatearGris(gris.litrosHa, gris.litrosKg) : 'Sin aplic.',
          detail: gris ? `${gris.aplicaciones} aplicaciones registradas. ${gris.detalle}` : 'Se completa con fertilizaciones y fumigaciones.',
          fill: this.limitar(gris?.porcentaje || 0),
        },
      ];
    }

    const valores = [
      huella.verde?.litrosKg || 0,
      huella.azul?.litrosKg || 0,
      huella.gris?.litrosKg || 0,
    ];
    const max = Math.max(...valores, 1);

    return [
      {
        key: 'green',
        label: 'Verde',
        value: `${Math.round(huella.verde?.litrosKg || 0)} l/kg`,
        detail: 'Lluvia natural aprovechada por el cultivo',
        fill: this.limitar(((huella.verde?.litrosKg || 0) / max) * 100),
      },
      {
        key: 'blue',
        label: 'Azul',
        value: `${Math.round(huella.azul?.litrosKg || 0)} l/kg`,
        detail: 'Riego o agua aportada desde fuente externa',
        fill: this.limitar(((huella.azul?.litrosKg || 0) / max) * 100),
      },
      {
        key: 'gray',
        label: 'Gris',
        value: `${Math.round(huella.gris?.litrosKg || 0)} l/kg`,
        detail: 'Agua para diluir/lavar fertilizantes y fitosanitarios',
        fill: this.limitar(((huella.gris?.litrosKg || 0) / max) * 100),
      },
    ];
  }

  public get totalHuellaResumen() {
    const huella = this.siembra?.huellaHidrica;
    const seguimiento = this.seguimiento;
    const verde = huella?.verde?.litrosKg || 0;
    const azul = huella?.azul?.litrosKg || 0;
    const gris = huella?.gris?.litrosKg || 0;
    const total = huella?.total?.litrosKg || verde + azul + gris;

    if (huella) {
      return {
        value: `${this.numeroAr.format(total)} l/kg`,
        detail: 'Suma de lluvia natural, riego registrado y carga de dilucion',
        fill: 100,
      };
    }

    if (seguimiento) {
      const total = seguimiento.progreso.total;
      const verde = seguimiento.progreso.verde;
      const azul = seguimiento.progreso.azul;
      const gris = seguimiento.progreso.gris;
      const aguaAcumuladaMm = (verde.mm || 0) + (azul.mm || 0);
      const fill = this.getTotalSeguimientoFill(seguimiento);
      return {
        value: total.litrosKg != null
          ? `${this.numeroAr.format(total.litrosKg)} l/kg`
          : `${this.numeroAr.format(total.litrosHa || 0)} l/ha`,
        detail: total.litrosKg != null
          ? total.detalle
          : `Seguimiento acumulado: ${this.decimalAr.format(aguaAcumuladaMm)} mm de agua real/efectiva + ${this.numeroAr.format(gris.litrosHa || 0)} l/ha de carga gris. Para l/kg cargar rendimiento o cosecha.`,
        fill,
      };
    }

    return {
      value: this.cargandoSeguimiento ? 'Actualizando' : 'Sin sincronizar',
      detail: this.errorSeguimiento || 'Esperando respuesta del motor de huella.',
      fill: 0,
    };
  }

  public get totalLabel(): string {
    return this.siembra?.huellaHidrica ? 'Total final' : 'Total en seguimiento';
  }

  public get faltantesSeguimiento() {
    return (this.seguimiento?.faltantes || []).slice(0, 5);
  }

  public get faltantesRestantes(): number {
    return Math.max((this.seguimiento?.faltantes?.length || 0) - this.faltantesSeguimiento.length, 0);
  }

  public get periodoSeguimiento(): string {
    const periodo = this.seguimiento?.periodo;
    if (!periodo?.desde || !periodo?.hasta) return '';
    return `${periodo.desde} a ${periodo.hasta}`;
  }

  private async cargarSeguimiento(): Promise<void> {
    const idSiembra = this.siembra?._id;
    if (!idSiembra || this.siembra?.huellaHidrica || this.ultimaSiembraConsultada === idSiembra) return;
    this.ultimaSiembraConsultada = idSiembra;
    this.cargandoSeguimiento = true;
    this.errorSeguimiento = undefined;
    try {
      this.seguimiento = await this.siembraService.seguimientoHuellaHidrica(idSiembra);
    } catch (error) {
      console.error('Error al cargar seguimiento de huella hidrica', error);
      this.errorSeguimiento = 'No se pudo consultar el seguimiento de huella.';
    } finally {
      this.cargandoSeguimiento = false;
    }
  }

  private formatearAgua(mm?: number, litrosKg?: number): string {
    if (litrosKg != null) return `${this.numeroAr.format(litrosKg)} l/kg`;
    return `${this.decimalAr.format(mm || 0)} mm`;
  }

  private formatearGris(litrosHa?: number, litrosKg?: number): string {
    if (litrosKg != null) return `${this.numeroAr.format(litrosKg)} l/kg`;
    return `${this.numeroAr.format(litrosHa || 0)} l/ha`;
  }

  private getTotalSeguimientoFill(seguimiento: HuellaHidricaSeguimiento): number {
    const valores = [
      seguimiento.progreso.verde.porcentaje || 0,
      seguimiento.progreso.azul.porcentaje || 0,
      seguimiento.progreso.gris.porcentaje || 0,
    ];
    return this.limitar(Math.max(...valores));
  }

  private limitar(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
