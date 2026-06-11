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

  public get progresoFenologico(): number {
    if (!this.siembra?.fechaSiembra) {
      return 0;
    }
    const inicio = new Date(this.siembra.fechaSiembra).getTime();
    const fin = this.siembra.fechaCosecha ? new Date(this.siembra.fechaCosecha).getTime() : Date.now();
    const dias = Math.max(0, (fin - inicio) / 86400000);
    return this.limitar((dias / this.duracionEstimada()) * 100);
  }

  public get huellas() {
    const huella = this.siembra?.huellaHidrica;
    const valores = [
      huella?.verde?.litrosKg || 0,
      huella?.azul?.litrosKg || 0,
      huella?.gris?.litrosKg || 0,
    ];
    const max = Math.max(...valores, 1);
    const aplicaciones = (this.lote?.fertilizaciones?.length || 0) + ((this.siembra as any)?.fumigaciones?.length || 0);

    return [
      {
        key: 'green',
        label: 'Verde',
        value: huella ? `${Math.round(huella.verde?.litrosKg || 0)} l/kg` : `${Math.round(this.progresoFenologico)}%`,
        detail: huella ? 'Lluvia natural aprovechada por el cultivo' : 'Avance de lluvia natural durante el ciclo',
        fill: huella ? this.limitar(((huella.verde?.litrosKg || 0) / max) * 100) : this.progresoFenologico,
      },
      {
        key: 'blue',
        label: 'Azul',
        value: huella ? `${Math.round(huella.azul?.litrosKg || 0)} l/kg` : `${Math.round(this.progresoFenologico)}%`,
        detail: huella ? 'Riego o agua aportada desde fuente externa' : 'Demanda potencial a cubrir con riego',
        fill: huella ? this.limitar(((huella.azul?.litrosKg || 0) / max) * 100) : this.progresoFenologico,
      },
      {
        key: 'gray',
        label: 'Gris',
        value: huella ? `${Math.round(huella.gris?.litrosKg || 0)} l/kg` : `${aplicaciones} aplic.`,
        detail: huella ? 'Agua para diluir/lavar fertilizantes y fitosanitarios' : 'Sube al cargar fertilizaciones/fumigaciones',
        fill: huella ? this.limitar(((huella.gris?.litrosKg || 0) / max) * 100) : this.limitar(aplicaciones * 28),
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

    const avance = Math.round(this.huellas.reduce((acc, item) => acc + item.fill, 0) / Math.max(this.huellas.length, 1));
    return {
      value: `${avance}%`,
      detail: 'Avance promedio de componentes hasta cierre de ciclo',
      fill: avance,
    };
  }

  private duracionEstimada(): number {
    const etapas = this.siembra?.crono?.etapas;
    const valores = etapas ? Object.values(etapas).filter((value): value is number => typeof value === 'number') : [];
    const suma = valores.reduce((acc, value) => acc + value, 0);
    if (suma > 0) {
      return suma;
    }
    const cultivo = this.siembra?.semilla?.cultivo;
    if (cultivo === 'Soja') return 120;
    if (cultivo === 'Maiz') return 155;
    return 165;
  }

  private limitar(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
