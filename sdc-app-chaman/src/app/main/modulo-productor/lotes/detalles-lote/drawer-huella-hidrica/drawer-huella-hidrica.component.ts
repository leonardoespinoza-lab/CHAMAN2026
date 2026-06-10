import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';

@Component({
  selector: 'app-drawer-huella-hidrica',
  imports: [CommonModule, SharedModule],
  templateUrl: './drawer-huella-hidrica.component.html',
  styleUrl: './drawer-huella-hidrica.component.scss',
})
export class DrawerHuellaHidricaComponent implements OnInit, OnDestroy {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public siembra?: IDetalleSiembra;
  public unidad: 'lt/kg' | 'lt/kCal' = 'lt/kg';
  public unidades = ['lt/kg', 'lt/kCal'];

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}
}
