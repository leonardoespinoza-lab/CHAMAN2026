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

@Component({
  selector: 'app-card-riego',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-riego.component.html',
  styleUrl: './card-riego.component.scss',
})
export class CardRiegoComponent implements OnInit, OnDestroy {
  @Input() public siembra?: ISiembra;
  @Input() public lote?: IDetallesLote;
  public verDetalleRiego: boolean = false;
  /** El drawer legacy promedia profundidades; no se expone como dato crudo. */
  public readonly puedeAbrirCurvasLegacy = false;

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {}

  ngOnDestroy(): void {}

  public get tieneLanzaHumedad(): boolean {
    return this.evaluacionRiego.tieneSensor;
  }

  public get recomendacionHoy(): IResultadoPrediccionRiego | undefined {
    if (!this.datosCampaniaRiegoValidos) return undefined;
    return this.siembra?.ultimaPrediccionRiego?.[0];
  }

  public get recomendaciones(): IResultadoPrediccionRiego[] {
    if (!this.datosCampaniaRiegoValidos) return [];
    return this.evaluacionRiego.serie;
  }

  public get recomendacionesPositivas(): IResultadoPrediccionRiego[] {
    if (!this.datosCampaniaRiegoValidos) return [];
    return this.evaluacionRiego.aportesPositivos;
  }

  public get proximoRiego(): IResultadoPrediccionRiego | undefined {
    return this.recomendacionesPositivas[0];
  }

  public get cantidadRecomendacionHoy(): number | null {
    if (!this.datosCampaniaRiegoValidos) return null;
    return this.evaluacionRiego.cantidadHoy;
  }

  public get puedeMostrarSerieRiego(): boolean {
    if (!this.datosCampaniaRiegoValidos) return false;
    return this.evaluacionRiego.serieDisponible;
  }

  public get esBalanceEstimado(): boolean {
    return (
      this.datosCampaniaRiegoValidos &&
      !this.tieneLanzaHumedad &&
      this.evaluacionRiego.esEstimada
    );
  }

  public get esCalculoEstimado(): boolean {
    return this.datosCampaniaRiegoValidos && this.evaluacionRiego.esEstimada;
  }

  public get sinDemandaRiego(): boolean {
    return this.datosCampaniaRiegoValidos && this.evaluacionRiego.sinDemanda;
  }

  public get estadoRecomendacionRiego(): EstadoRecomendacionRiego | undefined {
    if (!this.datosCampaniaRiegoValidos) return undefined;
    return this.evaluacionRiego.estado;
  }

  public get campaniaRiegoVigente(): boolean {
    if (!this.siembra || this.siembra.activa === false || !!this.siembra.fechaCosecha)
      return false;
    const fechaSiembra = new Date(this.siembra.fechaSiembra || '').getTime();
    if (!Number.isFinite(fechaSiembra) || fechaSiembra > Date.now()) return false;
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 6);
    return fechaSiembra >= limite.getTime();
  }

  public get cultivoRiegoConfigurado(): boolean {
    return !!this.siembra?.semilla?.cultivo;
  }

  public get etiquetaMotorRiego(): string {
    if (!this.datosCampaniaRiegoValidos) return 'Recomendación no disponible';
    if (this.esCalculoEstimado) return 'Balance estimado';
    if (!this.tieneLanzaHumedad) return 'Sin sensor de humedad';
    return this.puedeMostrarSerieRiego ? 'Motor activo' : 'Recomendación no disponible';
  }

  private get datosCampaniaRiegoValidos(): boolean {
    return this.campaniaRiegoVigente && this.cultivoRiegoConfigurado;
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
    if (this.tieneLanzaHumedad && !this.siembra) {
      return 'Sonda activa · falta crear/activar campaña y configurar cultivo.';
    }
    if (this.tieneLanzaHumedad && !this.campaniaRiegoVigente) {
      return 'Sonda activa · campaña desactualizada; no hay recomendación de riego.';
    }
    if (this.tieneLanzaHumedad && !this.cultivoRiegoConfigurado) {
      return 'Sonda activa · falta configurar el cultivo de la campaña.';
    }
    if (this.esCalculoEstimado) {
      if (!this.estadoAguaUtilValido) {
        return 'Sin recomendacion operativa: faltan datos validos para cerrar el balance hidrico.';
      }
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
      if (!this.estadoAguaUtilValido)
        return 'Sensor asignado, pero faltan datos validos para cerrar el balance hidrico.';
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

  public formatearFecha(fecha?: string): string {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  private get evaluacionRiego() {
    return evaluarRiegoFrontend(this.siembra, this.lote);
  }
}
