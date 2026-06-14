import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IDispositivo, IReporte } from 'modelos/src';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';
import { ReporteService } from '../../../../auxiliares/http/reporte.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { CardDetallesReporteLanzaComponent } from './card-detalles-reporte-lanza/card-detalles-reporte-lanza.component';
import { GraficoHistoricoSueloComponent } from './grafico-historico-suelo/grafico-historico-suelo.component';
import { buildSentekProfile, MedicionProfundidad } from './sentek-profile';

@Component({
  selector: 'app-detalles-dispositivo',
  standalone: true,
  imports: [
    SharedModule,
    BateriaComponent,
    CardDetallesReporteLanzaComponent,
    GraficoHistoricoSueloComponent,
  ],
  templateUrl: './detalles-dispositivo.component.html',
  styleUrl: './detalles-dispositivo.component.scss',
})
export class DetallesDispositivoComponent implements OnInit {
  public dispositivo?: IDispositivo;
  public ultimoReporte?: IReporte;
  public datosLanza: MedicionProfundidad[] = [];
  public esLanzaDeSuelo = false;
  public vistaActiva: 'tarjetas' | 'grafico' = 'grafico';
  public loading = false;
  public loadingHistorico = false;
  public diasHistorico = 7;
  public reportesHistoricos: IReporte[] = [];

  constructor(
    public helper: HelperService,
    private params: ParamsService,
    private route: ActivatedRoute,
    private service: DispositivoService,
    private reportesService: ReporteService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const dispositivoFromParams = this.params.get('detallesDispositivo') as IDispositivo;
      const id = this.route.snapshot.paramMap.get('id');
      const dispositivo = dispositivoFromParams?._id
        ? dispositivoFromParams
        : id
          ? await this.service.getById(id)
          : undefined;

      this.setDispositivo(dispositivo);
      await this.cargarHistorico();
    } finally {
      this.loading = false;
    }
  }

  public cambiarVista(vista: 'tarjetas' | 'grafico'): void {
    this.vistaActiva = vista;
  }

  public async cambiarPeriodoHistorico(dias: number): Promise<void> {
    this.diasHistorico = dias;
    await this.cargarHistorico();
  }

  private setDispositivo(dispositivo?: IDispositivo): void {
    this.dispositivo = dispositivo;
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    this.ultimoReporte = this.esLanzaDeSuelo ? this.dispositivo?.ultimoReporte : undefined;
    this.datosLanza = this.esLanzaDeSuelo ? buildSentekProfile(this.ultimoReporte) : [];
    this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
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
