import { Component, Input, OnInit } from '@angular/core';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SharedModule } from '../../../../auxiliares/shared.module';

interface LegendItem {
  color: string;
  label: string;
}

@Component({
  selector: 'app-ndvi-legend',
  templateUrl: './ndvi-legend.component.html',
  styleUrls: ['./ndvi-legend.component.scss'],
  imports: [SharedModule],
})
export class NdviLegendComponent implements OnInit {
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';

  public legendItems: LegendItem[] = [
    { color: '#00451f', label: '1.0 (Vegetacion densa)' },
    { color: '#157a33', label: '0.7' },
    { color: '#42aa49', label: '0.5' },
    { color: '#9edb5d', label: '0.3 (Cobertura media)' },
    { color: '#eadf9a', label: '0.15 (Cobertura baja)' },
    { color: '#e0c486', label: '0.1 (Suelo/cobertura escasa)' },
    { color: '#c68b5d', label: '0.0' },
    { color: '#7c5034', label: '-0.2' },
  ];

  constructor(private dialogConfig: DynamicDialogConfig) {}

  ngOnInit(): void {
    if (this.dialogConfig.data?.orientation) {
      this.orientation = this.dialogConfig.data.orientation;
    }
  }
}
