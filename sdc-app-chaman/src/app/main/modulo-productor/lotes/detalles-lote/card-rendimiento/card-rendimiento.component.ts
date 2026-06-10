import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetalleSiembra } from '../detalles-lote.component';

@Component({
  selector: 'app-card-rendimiento',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-rendimiento.component.html',
  styleUrl: './card-rendimiento.component.scss',
})
export class CardRendimientoComponent implements OnInit, OnDestroy {
  @Input() public siembra?: IDetalleSiembra;

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}
}
