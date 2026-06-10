import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { IDispositivo, IReporte } from 'modelos/src';
import { UbicarComponent } from '../../../../../auxiliares/componentes/ubicar/ubicar.component';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../../auxiliares/servicios/listados';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { CardDetallesReporteLanzaComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/card-detalles-reporte-lanza/card-detalles-reporte-lanza.component';
import { MedicionProfundidad } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/detalles-dispositivo.component';
import { GraficoPerfilSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-perfil-suelo/grafico-perfil-suelo.component';

@Component({
  selector: 'app-drawer-dispositivos',
  imports: [
    CommonModule,
    SharedModule,
    CardDetallesReporteLanzaComponent,
    GraficoPerfilSueloComponent,
    UbicarComponent,
  ],
  templateUrl: './drawer-dispositivos.component.html',
  styleUrl: './drawer-dispositivos.component.scss',
})
export class DrawerDispositivosComponent implements OnInit, OnDestroy, OnChanges {
  public loading = false;
  @Input() public visible: boolean = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public dispositivo?: IDispositivo;

  private ultimoReporte?: IReporte;
  public datosLanza: MedicionProfundidad[] = [];
  public esLanzaDeSuelo = false;
  public vistaActiva: 'tarjetas' | 'grafico' = 'tarjetas'; // Nueva propiedad para controlar la vista

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private translate: TranslateService
  ) {}

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

  async ngOnInit(): Promise<void> {
    this.loading = true;
    // 1. Verificamos el tipo de dispositivo que estamos viendo
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    // 2. Si es una lanza de suelo y tiene un reporte, procesamos los datos.
    //    Si no, `datosLanza` permanecerá como un array vacío y no se mostrará nada.
    if (this.esLanzaDeSuelo && this.dispositivo?.ultimoReporte) {
      this.ultimoReporte = this.dispositivo.ultimoReporte;
      this.procesarReporteLanza();
    }
    this.loading = false;
  }

  ngOnDestroy(): void {}

  public cambiarVista(vista: 'tarjetas' | 'grafico'): void {
    this.vistaActiva = vista;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !changes['visible'].firstChange) {
      this.visibleChange.emit(this.visible);
    }
    if (changes['dispositivo'] && !changes['dispositivo'].firstChange) {
      this.dispositivo = changes['dispositivo'].currentValue;
      this.loading = true;
      this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
      if (this.esLanzaDeSuelo && this.dispositivo?.ultimoReporte) {
        this.ultimoReporte = this.dispositivo.ultimoReporte;
        this.procesarReporteLanza();
      }
      this.loading = false;
    }
  }
}
