import { Component, OnInit } from '@angular/core';
// Asumo que estas interfaces vienen de un archivo central de modelos
import { IDispositivo, IReporte } from 'modelos/src';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { CardDetallesReporteLanzaComponent } from './card-detalles-reporte-lanza/card-detalles-reporte-lanza.component';
import { GraficoPerfilSueloComponent } from './grafico-perfil-suelo/grafico-perfil-suelo.component';

export interface MedicionProfundidad {
  profundidad: number;
  humedad: {
    actual: number;
    unidad: string;
  };
  temperatura: {
    actual: number;
    unidad: string;
  };
}

@Component({
  selector: 'app-detalles-dispositivo',
  standalone: true,
  imports: [SharedModule, BateriaComponent, CardDetallesReporteLanzaComponent, GraficoPerfilSueloComponent],
  templateUrl: './detalles-dispositivo.component.html',
  styleUrl: './detalles-dispositivo.component.scss',
})
export class DetallesDispositivoComponent implements OnInit {
  public dispositivo?: IDispositivo;
  public ultimoReporte?: IReporte;
  public datosLanza: MedicionProfundidad[] = [];

  // NUEVA PROPIEDAD: Controla si se debe mostrar la vista de la lanza
  public esLanzaDeSuelo: boolean = false;
  public vistaActiva: 'tarjetas' | 'grafico' = 'tarjetas'; // Nueva propiedad para controlar la vista

  constructor(
    public helper: HelperService,
    private params: ParamsService
  ) {}

  ngOnInit(): void {
    this.dispositivo = this.params.get('detallesDispositivo') as IDispositivo;

    // 1. Verificamos el tipo de dispositivo que estamos viendo
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';

    // 2. Si es una lanza de suelo y tiene un reporte, procesamos los datos.
    //    Si no, `datosLanza` permanecerá como un array vacío y no se mostrará nada.
    if (this.esLanzaDeSuelo && this.dispositivo?.ultimoReporte) {
      this.ultimoReporte = this.dispositivo.ultimoReporte;
      this.procesarReporteLanza();
    }
  }

  public cambiarVista(vista: 'tarjetas' | 'grafico'): void {
    this.vistaActiva = vista;
  }

  private procesarReporteLanza(): void {
    const reportHumedad = this.ultimoReporte?.datos?.valores?.['Humedad Suelo Profundidad'];
    const reportTemp = this.ultimoReporte?.datos?.valores?.['Temperatura Suelo'];

    if (!Array.isArray(reportHumedad) || !Array.isArray(reportTemp)) {
      console.warn('No se encontraron datos de humedad o temperatura válidos en el reporte.');
      this.datosLanza = [];
      return;
    }

    this.datosLanza = reportHumedad.reduce((acc: MedicionProfundidad[], medicionHumedad) => {
      const medicionTemp = reportTemp.find((temp) => temp.profundidad === medicionHumedad.profundidad);

      if (
        medicionHumedad.profundidad != null &&
        medicionHumedad.valores?.actual != null &&
        medicionHumedad.unidad &&
        medicionTemp &&
        medicionTemp.valores?.actual != null &&
        medicionTemp.unidad
      ) {
        acc.push({
          profundidad: medicionHumedad.profundidad,
          humedad: {
            actual: medicionHumedad.valores.actual,
            unidad: medicionHumedad.unidad,
          },
          temperatura: {
            actual: medicionTemp.valores.actual,
            unidad: medicionTemp.unidad,
          },
        });
      }
      return acc;
    }, []);
  }
}
