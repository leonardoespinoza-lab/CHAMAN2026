import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IDispositivo, ILorawanRawFrame, IReporte } from 'modelos/src';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';
import { ReporteService } from '../../../../auxiliares/http/reporte.service';
import { LorawanUplinksService } from '../../../../auxiliares/http/lorawan-uplinks.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { CardDetallesReporteLanzaComponent } from './card-detalles-reporte-lanza/card-detalles-reporte-lanza.component';
import { GraficoHistoricoAmbienteComponent } from './grafico-historico-ambiente/grafico-historico-ambiente.component';
import { GraficoHistoricoSueloComponent } from './grafico-historico-suelo/grafico-historico-suelo.component';
import { buildSentekProfile, MedicionProfundidad } from './sentek-profile';

@Component({
  selector: 'app-detalles-dispositivo',
  standalone: true,
  imports: [
    SharedModule,
    BateriaComponent,
    CardDetallesReporteLanzaComponent,
    GraficoHistoricoAmbienteComponent,
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
  public esSensorAmbiente = false;
  public vistaActiva: 'tarjetas' | 'grafico' = 'grafico';
  public loading = false;
  public loadingHistorico = false;
  public diasHistorico = 7;
  public reportesHistoricos: IReporte[] = [];
  public rawFrames: ILorawanRawFrame[] = [];

  public get esControladorSentek(): boolean {
    return !!this.dispositivo?.configuracionLecturas?.perfilSuelo || this.esLanzaDeSuelo;
  }

  public get entradaAnalogicaConfigurada() {
    return this.dispositivo?.configuracionLecturas?.entradaAnalogica;
  }

  public get entradaAnalogicaCruda(): { valor?: number; unidad: string } | undefined {
    const row = this.valorReporte('Entrada Analógica');
    if (!row) return undefined;
    return {
      valor: this.numeroSeguro(row?.valores?.actual),
      unidad: row?.unidad || 'mA',
    };
  }

  public get lecturaAnalogicaCalibrada():
    | {
        nombre: string;
        valor?: number;
        unidad?: string;
        columnaAgua?: number;
        profundidadInstalacion?: number;
      }
    | undefined {
    const variable = this.entradaAnalogicaConfigurada?.variable;
    if (variable === 'nivel_napa') {
      const row = this.valorReporte('Napa');
      return row
        ? {
            nombre: 'Profundidad de napa desde el terreno',
            valor: this.numeroSeguro(row?.valores?.actual),
            unidad: row?.unidad,
            columnaAgua: this.numeroSeguro(row?.valores?.columnaAgua),
            profundidadInstalacion: this.numeroSeguro(row?.valores?.profundidadInstalacion),
          }
        : undefined;
    }
    if (variable === 'presion_agua') {
      const row = this.valorReporte('Presión');
      return row
        ? { nombre: 'Presión de agua', valor: this.numeroSeguro(row?.valores?.actual), unidad: row?.unidad }
        : undefined;
    }
    return undefined;
  }

  public get estadoEntradaAnalogica(): string {
    if (!this.entradaAnalogicaConfigurada || this.entradaAnalogicaConfigurada.variable === 'sin_definir') {
      return 'Corriente cruda; falta ficha tecnica y escala del transductor';
    }
    return this.lecturaAnalogicaCalibrada
      ? 'Escala fisica configurada'
      : 'Configurado; esperando una nueva lectura analogica';
  }

  constructor(
    public helper: HelperService,
    private params: ParamsService,
    private route: ActivatedRoute,
    private service: DispositivoService,
    private reportesService: ReporteService,
    private lorawanUplinks: LorawanUplinksService
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
    this.esSensorAmbiente = this.tieneVariableAmbiental(this.dispositivo);
    this.ultimoReporte = this.dispositivo?.ultimoReporte;
    this.datosLanza = this.esLanzaDeSuelo ? buildSentekProfile(this.ultimoReporte) : [];
    this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
  }

  private async cargarHistorico(): Promise<void> {
    const id = this.dispositivo?._id || this.dispositivo?.deveui;
    if ((!this.esLanzaDeSuelo && !this.esSensorAmbiente) || !id) return;
    this.loadingHistorico = true;
    try {
      const [response, rawFrames] = await Promise.all([
        this.reportesService.historico(id, this.diasHistorico, 2500),
        this.dispositivo?.deveui
          ? this.lorawanUplinks.rawHistory(this.dispositivo.deveui, this.diasHistorico, 5000)
          : Promise.resolve([]),
      ]);
      this.rawFrames = rawFrames;
      this.reportesHistoricos = response.datos?.length
        ? response.datos
        : this.ultimoReporte
          ? [this.ultimoReporte]
          : [];
    } catch (error) {
      console.error('Error al cargar historico de reportes del dispositivo', error);
      this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
      this.rawFrames = [];
    } finally {
      this.loadingHistorico = false;
    }
  }

  private tieneVariableAmbiental(dispositivo?: IDispositivo): boolean {
    const sensores = dispositivo?.sensores || [];
    const valores = (dispositivo?.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    return (
      sensores.some((sensor) =>
        ['Temperatura', 'Humedad', 'Batería', 'Bateria', 'BaterÃ­a'].includes(sensor as string)
      ) ||
      !!valores['Temperatura'] ||
      !!valores['Humedad']
    );
  }

  private valorReporte(sensor: string): any | undefined {
    const candidatos = [this.ultimoReporte, ...[...this.reportesHistoricos].reverse()].filter(
      (reporte, index, reportes) =>
        !!reporte && reportes.findIndex((candidate) => candidate?._id === reporte?._id) === index
    );

    for (const reporte of candidatos) {
      const valores = (reporte?.datos?.valores || {}) as unknown as Record<string, any>;
      const rows = valores[sensor];
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) return row;
    }

    return undefined;
  }

  private numeroSeguro(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
