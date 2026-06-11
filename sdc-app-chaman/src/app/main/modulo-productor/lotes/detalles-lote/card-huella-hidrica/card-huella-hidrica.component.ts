import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ISiembra } from 'modelos/src';
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
export class CardHuellaHidricaComponent implements OnInit, OnDestroy {
  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;
  public verDrawerHuellaHidrica: boolean = false;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get huellas() {
    const huella = this.siembra?.huellaHidrica;
    const aplicaciones =
      (this.lote?.fertilizaciones?.length || 0) +
      ((this.siembra as any)?.fumigaciones?.length || 0);

    if (!huella) {
      return [
        {
          key: 'green',
          label: 'Verde',
          value: 'Pendiente',
          detail: 'Requiere clima real acumulado y rendimiento de cierre',
          fill: 0,
        },
        {
          key: 'blue',
          label: 'Azul',
          value: 'Pendiente',
          detail: 'Requiere riego/sensores o balance hidrico consolidado',
          fill: 0,
        },
        {
          key: 'gray',
          label: 'Gris',
          value: `${aplicaciones} aplic.`,
          detail: 'Se calcula con fertilizaciones, fumigaciones y rendimiento',
          fill: 0,
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
    const verde = huella?.verde?.litrosKg || 0;
    const azul = huella?.azul?.litrosKg || 0;
    const gris = huella?.gris?.litrosKg || 0;
    const total = huella?.total?.litrosKg || verde + azul + gris;

    if (huella) {
      return {
        value: `${this.numeroAr.format(total)} l/kg`,
        detail: 'Suma de lluvia natural, riego y carga de dilucion',
        fill: 100,
      };
    }

    return {
      value: 'Pendiente',
      detail: 'Se consolida con clima, aplicaciones y rendimiento seco',
      fill: 0,
    };
  }

  private limitar(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
