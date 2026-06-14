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
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { GraficoHistoricoSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-suelo/grafico-historico-suelo.component';
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
    GraficoHistoricoSueloComponent,
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
  public reportesHistoricos: IReporte[] = [];
  public diasHistorico = 7;
  public loadingHistorico = false;

  constructor(
    public helper: HelperService,
    private reportesService: ReporteService,
  ) {}

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

  public async cambiarPeriodoHistorico(dias: number): Promise<void> {
    this.diasHistorico = dias;
    await this.cargarHistorico();
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

  public get tieneNotasNormalizacion(): boolean {
    return this.datosLanza.some((dato) => !!dato.humedad?.nota || !!dato.salinidad?.nota || !!dato.temperatura?.nota);
  }

  private refreshFromDevice(): void {
    this.loading = true;
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    this.ultimoReporte = this.esLanzaDeSuelo ? this.dispositivo?.ultimoReporte : undefined;
    this.datosLanza = this.esLanzaDeSuelo
      ? buildSentekProfile(this.ultimoReporte)
      : [];
    this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
    this.loading = false;
    this.cargarHistorico();
  }

  private async cargarHistorico(): Promise<void> {
    const id = this.dispositivo?._id;
    if (!this.esLanzaDeSuelo || !id) return;
    this.loadingHistorico = true;
    try {
      const response = await this.reportesService.historico(id, this.diasHistorico, 2500);
      this.reportesHistoricos = response.datos?.length
        ? response.datos
        : this.ultimoReporte
          ? [this.ultimoReporte]
          : [];
    } catch (error) {
      console.error('Error al cargar historico de reportes de suelo', error);
      this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
    } finally {
      this.loadingHistorico = false;
    }
  }
}
