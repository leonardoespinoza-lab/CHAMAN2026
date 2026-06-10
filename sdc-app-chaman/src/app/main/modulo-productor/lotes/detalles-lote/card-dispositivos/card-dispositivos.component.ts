import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IDispositivo, ILote } from 'modelos/src';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { BateriaComponent } from '../../../../modulo-admin/dispositivos/bateria/bateria.component';
import { DrawerDispositivosComponent } from '../drawer-dispositivos/drawer-dispositivos.component';

@Component({
  selector: 'app-card-dispositivos',
  imports: [CommonModule, SharedModule, DrawerDispositivosComponent, BateriaComponent],
  templateUrl: './card-dispositivos.component.html',
  styleUrl: './card-dispositivos.component.scss',
})
export class CardDispositivosComponent implements OnInit, OnDestroy {
  @Input() public lote?: ILote;
  public verDrawerDispositivos = false;

  public dispositivos: IDispositivo[] = [];
  public dispositivo?: IDispositivo;
  public responsiveOptions = [
    {
      breakpoint: '1400px',
      numVisible: 2,
      numScroll: 1,
    },
    {
      breakpoint: '1199px',
      numVisible: 3,
      numScroll: 1,
    },
    {
      breakpoint: '767px',
      numVisible: 2,
      numScroll: 1,
    },
    {
      breakpoint: '575px',
      numVisible: 1,
      numScroll: 1,
    },
  ];

  constructor(public helper: HelperService) {}

  public abrirDrawerDispositivo(dispositivo: IDispositivo): void {
    this.dispositivo = dispositivo;
    this.verDrawerDispositivos = true;
  }

  async ngOnInit(): Promise<void> {
    this.dispositivos = this.lote?.dispositivos || [];
  }

  ngOnDestroy(): void {}
}
