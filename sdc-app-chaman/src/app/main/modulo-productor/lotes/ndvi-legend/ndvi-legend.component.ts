import { Component, Input, OnInit } from '@angular/core';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SharedModule } from '../../../../auxiliares/shared.module';

// Definimos una interfaz para cada item de la leyenda para tener un código más limpio
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
  // Usamos @Input() para que el componente padre pueda pasar la orientación.
  // Será 'vertical' o 'horizontal'. Por defecto, será 'vertical'.
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';

  // Aquí traducimos nuestra paleta de colores a un array que el HTML pueda usar.
  public legendItems: LegendItem[] = [
    { color: '#006400', label: '1.0 (Vegetación Densa)' },
    { color: '#008000', label: '0.7' },
    { color: '#9ACD32', label: '0.4' },
    { color: '#FFFFE0', label: '0.2 (Vegetación Escasa)' },
    { color: '#D2B48C', label: '0.1 (Suelo Desnudo)' },
    { color: '#A0522D', label: '0.0' },
    { color: '#4682B4', label: '-0.2 (Agua)' },
    { color: '#000080', label: '-1.0' },
  ];

  // Inyectamos DynamicDialogConfig para recibir los datos
  constructor(private dialogConfig: DynamicDialogConfig) {}

  ngOnInit(): void {
    // Verificamos si nos pasaron datos de orientación al abrir el diálogo
    if (this.dialogConfig.data && this.dialogConfig.data.orientation) {
      this.orientation = this.dialogConfig.data.orientation;
    }
  }
}
