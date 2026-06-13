import { Component, Input, OnInit } from '@angular/core';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { MedicionProfundidad } from '../sentek-profile';

@Component({
  selector: 'app-card-detalles-reporte-lanza',
  imports: [SharedModule],
  templateUrl: './card-detalles-reporte-lanza.component.html',
  styleUrl: './card-detalles-reporte-lanza.component.scss',
})
export class CardDetallesReporteLanzaComponent implements OnInit {
  @Input() data!: MedicionProfundidad;
  public titulo: string = 'Profundidad: ';
  constructor() {}

  ngOnInit(): void {
    // Aquí podrías agregar lógica adicional si es necesario
    if (this.data) {
      this.titulo += `${this.data.profundidad} cm`;
    }
  }
}
