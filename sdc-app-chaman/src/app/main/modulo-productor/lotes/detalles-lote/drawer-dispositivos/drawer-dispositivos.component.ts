import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { IDispositivo, IReporte } from 'modelos/src';
import { UbicarComponent } from '../../../../../auxiliares/componentes/ubicar/ubicar.component';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { GraficoPerfilSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-perfil-suelo/grafico-perfil-suelo.component';
import {
  buildSentekProfile,
  MedicionSensorProfundidad,
  MedicionProfundidad,
} from '../../../../modulo-admin/dispositivos/detalles-dispositivo/sentek-profile';

@Component({
  selector: 'app-drawer-dispositivos',
  imports: [
    CommonModule,
    SharedModule,
    GraficoPerfilSueloComponent,
    UbicarComponent,
  ],
  templateUrl: './drawer-dispositivos.component.html',
  styleUrl: './drawer-dispositivos.component.scss',
})
export class DrawerDispositivosComponent implements OnInit, OnDestroy, OnChanges {
  public loading = false;
  @Input() public visible = true;
  @Output() public visibleChange = new EventEmitter<boolean>();
  @Input() public dispositivo?: IDispositivo;

  private ultimoReporte?: IReporte;
  public datosLanza: MedicionProfundidad[] = [];
  public esLanzaDeSuelo = false;
  public vistaActiva: 'tabla' | 'grafico' = 'grafico';

  constructor(public helper: HelperService) {}

  async ngOnInit(): Promise<void> {
    this.refreshFromDevice();
  }

  ngOnDestroy(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !changes['visible'].firstChange) {
      this.visibleChange.emit(this.visible);
    }

    if (changes['dispositivo'] && !changes['dispositivo'].firstChange) {
      this.dispositivo = changes['dispositivo'].currentValue;
      this.refreshFromDevice();
    }
  }

  public cambiarVista(vista: 'tabla' | 'grafico'): void {
    this.vistaActiva = vista;
  }

  public formatearMedicion(medicion?: MedicionSensorProfundidad): string {
    if (!medicion) {
      return '-';
    }
    return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(medicion.actual)} ${medicion.unidad}`;
  }

  public get tieneDatosCrudos(): boolean {
    return this.datosLanza.some((dato) => !!dato.humedad?.crudo);
  }

  private refreshFromDevice(): void {
    this.loading = true;
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    this.ultimoReporte = this.esLanzaDeSuelo ? this.dispositivo?.ultimoReporte : undefined;
    this.datosLanza = this.esLanzaDeSuelo
      ? buildSentekProfile(this.ultimoReporte)
      : [];
    this.loading = false;
  }
}
