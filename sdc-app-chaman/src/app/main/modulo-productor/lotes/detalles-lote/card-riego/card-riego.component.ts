import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { IResultadoPrediccionRiego, ISiembra } from 'modelos/src';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import {
  cantidadRiegoValida,
  EstadoAguaUtil,
  EstadoRecomendacionRiego,
  evaluarRiegoFrontend,
} from '../../riego-evidence';
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
  public verDetalleRiego: boolean = false;

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get tieneLanzaHumedad(): boolean {
    return this.evaluacionRiego.tieneSensor;
  }

  public get recomendacionHoy(): IResultadoPrediccionRiego | undefined {
    return this.siembra?.ultimaPrediccionRiego?.[0];
  }

  public get recomendaciones(): IResultadoPrediccionRiego[] {
    return this.evaluacionRiego.serie;
  }

  public get recomendacionesPositivas(): IResultadoPrediccionRiego[] {
    return this.evaluacionRiego.aportesPositivos;
  }

  public get proximoRiego(): IResultadoPrediccionRiego | undefined {
    return this.recomendacionesPositivas[0];
  }

  public get cantidadRecomendacionHoy(): number | null {
    return this.evaluacionRiego.cantidadHoy;
  }

  public get puedeMostrarSerieRiego(): boolean {
    return this.evaluacionRiego.serieDisponible;
  }

  public get esBalanceEstimado(): boolean {
    return !this.tieneLanzaHumedad && this.evaluacionRiego.esEstimada;
  }

  public get esCalculoEstimado(): boolean {
    return this.evaluacionRiego.esEstimada;
  }

  public get sinDemandaRiego(): boolean {
    return this.evaluacionRiego.sinDemanda;
  }

  public get estadoRecomendacionRiego(): EstadoRecomendacionRiego | undefined {
    return this.evaluacionRiego.estado;
  }

  public get aguaUtilValor(): number | null {
    return this.evaluacionRiego.aguaUtilValor;
  }

  public get estadoAguaUtilValido(): boolean {
    return this.aguaUtilValor !== null;
  }

  public get etiquetaAguaUtil(): string {
    if (this.aguaUtilValor === null) return 'Sin dato valido';
    return this.evaluacionRiego.aguaUtilEstimada ? 'Estimacion modelada' : 'Dato operativo';
  }

  public get etiquetaHoy(): string {
    if (this.cantidadRecomendacionHoy === null) {
      return this.esCalculoEstimado ? 'Estimacion pendiente' : 'Sin dato';
    }
    if (this.esCalculoEstimado) return 'Estimacion modelada';
    return this.cantidadRecomendacionHoy > 0 ? 'Recomendacion con sensor' : 'Sin riego sugerido';
  }

  public get etiquetaEstadoAguaUtil(): string {
    const labels: Record<EstadoAguaUtil, string> = {
      calculado: 'Calculado con datos operativos',
      estimado: 'Estimacion modelada',
      no_disponible: 'No disponible',
      fallida: 'Calculo fallido',
    };
    return labels[this.estadoAguaUtil];
  }

  public get resumen(): string {
    if (this.esCalculoEstimado) {
      if (this.proximoRiego) {
        return `Balance estimado: posible aporte el ${this.formatearFecha(this.proximoRiego.fecha)}; validar a campo.`;
      }
      if (this.sinDemandaRiego) return 'Balance estimado sin demanda de riego; validar a campo.';
      return 'Balance estimado pendiente: aun no hay una serie valida para inferir demanda.';
    }
    if (!this.puedeMostrarSerieRiego) {
      if (this.estadoRecomendacionRiego === 'fallida')
        return 'El calculo de riego fallo; no hay recomendacion vigente.';
      if (!this.tieneLanzaHumedad) return 'Sin lanza de humedad: recomendacion real no disponible.';
      return 'Sensor asignado, pero la recomendacion de riego no esta disponible.';
    }
    if (this.proximoRiego) {
      return `Proximo riego sugerido: ${this.formatearFecha(this.proximoRiego.fecha)}.`;
    }
    return 'No se recomienda regar en la ventana calculada.';
  }

  public get estadoAguaUtil(): EstadoAguaUtil {
    return this.evaluacionRiego.estadoAguaUtil;
  }

  public get motivoAguaUtil(): string {
    return this.siembra?.motivoCalculoAguaUtil || '';
  }

  public cantidadRiego(item?: IResultadoPrediccionRiego): number | null {
    return cantidadRiegoValida(item);
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

  public abrirDetalleRiego(): void {
    this.verDetalleRiego = true;
  }

  public abrirDrawerRiego(event?: Event): void {
    event?.stopPropagation();
    if (!this.tieneLanzaHumedad || !this.puedeMostrarSerieRiego) return;
    this.verDetalleRiego = false;
    this.verDrawerRiego = true;
  }

  public formatearFecha(fecha?: string): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  private get evaluacionRiego() {
    return evaluarRiegoFrontend(this.siembra, this.lote);
  }
}
