import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';

@Component({
  selector: 'app-card-detalles-siembra',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-detalles-siembra.component.html',
  styleUrl: './card-detalles-siembra.component.scss',
})
export class CardDetallesSiembraComponent implements OnInit, OnDestroy {
  @Input() public siembra?: IDetalleSiembra;

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}
}
