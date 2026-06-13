import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IDispositivo, IReporte } from 'modelos/src';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { CardDetallesReporteLanzaComponent } from './card-detalles-reporte-lanza/card-detalles-reporte-lanza.component';
import { GraficoPerfilSueloComponent } from './grafico-perfil-suelo/grafico-perfil-suelo.component';
import { buildSentekProfile, MedicionProfundidad } from './sentek-profile';

@Component({
  selector: 'app-detalles-dispositivo',
  standalone: true,
  imports: [
    SharedModule,
    BateriaComponent,
    CardDetallesReporteLanzaComponent,
    GraficoPerfilSueloComponent,
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

  constructor(
    public helper: HelperService,
    private params: ParamsService,
    private route: ActivatedRoute,
    private service: DispositivoService,
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
    } finally {
      this.loading = false;
    }
  }

  public cambiarVista(vista: 'tarjetas' | 'grafico'): void {
    this.vistaActiva = vista;
  }

  private setDispositivo(dispositivo?: IDispositivo): void {
    this.dispositivo = dispositivo;
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    this.ultimoReporte = this.esLanzaDeSuelo ? this.dispositivo?.ultimoReporte : undefined;
    this.datosLanza = this.esLanzaDeSuelo ? buildSentekProfile(this.ultimoReporte) : [];
  }
}
