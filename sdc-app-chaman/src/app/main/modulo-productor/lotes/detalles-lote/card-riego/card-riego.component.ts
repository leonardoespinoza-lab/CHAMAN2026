import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IDispositivo, IResultadoPrediccionRiego, ISiembra } from 'modelos/src';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { IDetallesLote } from '../detalles-lote.component';
import { DrawerRiegoComponent } from '../drawer-riego/drawer-riego.component';

@Component({
  selector: 'app-card-riego',
  imports: [CommonModule, SharedModule, DrawerRiegoComponent],
  templateUrl: './card-riego.component.html',
  styleUrl: './card-riego.component.scss',
})
export class CardRiegoComponent implements OnInit, OnDestroy {
  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;
  public verDrawerRiego: boolean = false;

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get tieneLanzaHumedad(): boolean {
    return (
      this.lote?.dispositivos?.some((dispositivo: IDispositivo) => dispositivo.tipo === 'Sensor de Humedad de Suelo') ||
      false
    );
  }

  public get recomendacionHoy(): IResultadoPrediccionRiego | undefined {
    return this.siembra?.ultimaPrediccionRiego?.[0];
  }

  public get recomendaciones(): IResultadoPrediccionRiego[] {
    return this.siembra?.ultimaPrediccionRiego || [];
  }

  public get proximoRiego(): IResultadoPrediccionRiego | undefined {
    return this.recomendaciones.find((item) => (item.cantidad || 0) > 0);
  }

  public get resumen(): string {
    if (!this.tieneLanzaHumedad) {
      return 'Sin lanza de humedad instalada.';
    }
    if (!this.recomendaciones.length) {
      return 'Esperando prediccion con sensor, lluvia y ET0.';
    }
    if (this.proximoRiego) {
      return `Proximo riego sugerido: ${this.formatearFecha(this.proximoRiego.fecha)}.`;
    }
    return 'No se recomienda regar en la ventana calculada.';
  }

  public get estadoAguaUtil(): 'calculado' | 'estimado' | 'no_disponible' | 'fallida' {
    return this.siembra?.estadoCalculoAguaUtil || 'no_disponible';
  }

  public get motivoAguaUtil(): string {
    return this.siembra?.motivoCalculoAguaUtil || '';
  }

  public calcularET0Proyectada(): number | null {
    const pronosticos = this.lote?.establecimiento?.prediccionClimatica?.pronosticos;
    if (!Array.isArray(pronosticos) || !pronosticos.length) {
      return null;
    }

    const et0Validos = pronosticos
      .slice(0, 7)
      .map((p) => p?.et0)
      .filter((et0): et0 is number => typeof et0 === 'number' && !Number.isNaN(et0) && et0 >= 0);

    if (!et0Validos.length) {
      return null;
    }

    return Number(et0Validos.reduce((suma, et0) => suma + et0, 0).toFixed(2));
  }

  public abrirDrawerRiego(): void {
    if (!this.tieneLanzaHumedad) return;
    this.verDrawerRiego = true;
  }

  public formatearFecha(fecha?: string): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }
}
