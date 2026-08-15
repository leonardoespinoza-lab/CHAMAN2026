import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IDispositivo,
  ILorawanRawFrame,
  IReporte,
  serviciosDispositivoNormalizados,
} from 'modelos/src';
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
import { buildSentekChannelCoverage, buildSentekProfile, MedicionProfundidad } from './sentek-profile';

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
  public historicoHasta = new Date().toISOString();
  public reportesHistoricos: IReporte[] = [];
  public rawFrames: ILorawanRawFrame[] = [];
  private historicoLoadVersion = 0;

  public get esControladorSentek(): boolean {
    return !!this.dispositivo?.configuracionLecturas?.perfilSuelo || this.esLanzaDeSuelo;
  }

  public get entradaAnalogicaConfigurada() {
    return this.dispositivo?.configuracionLecturas?.entradaAnalogica;
  }

  public get coberturaPerfilSentek() {
    return buildSentekChannelCoverage(this.rawFrames);
  }

  public get estadoPerfilSentek(): string {
    const cobertura = this.coberturaPerfilSentek;
    if (!cobertura) return 'Esperando diagnóstico';
    return cobertura.completa ? 'Perfil completo 12/12' : `Perfil incompleto ${cobertura.canalesRecibidos.length}/12`;
  }

  public get descripcionProfundidadesSentek(): string {
    const depths = this.dispositivo?.configuracionLecturas?.perfilSuelo?.profundidadesCm || [];
    if (!depths.length) return '12 niveles de profundidad';
    return `${depths.length} niveles configurados: ${depths[0]} a ${depths[depths.length - 1]} cm`;
  }

  public get fechaDesdePerfilSentek(): string | undefined {
    const servicioPerfil = serviciosDispositivoNormalizados(this.dispositivo).find(
      (servicio) => servicio.tipo === 'perfil_suelo'
    );
    return servicioPerfil?.fechaAsignacionLote || this.dispositivo?.fechaAsignacionLote;
  }

  public get esEntradaAnalogica(): boolean {
    return (
      !!this.entradaAnalogicaConfigurada ||
      this.rawFrames.some((frame) =>
        (frame.readings || []).some((reading) => reading.variable === 'corriente_analogica')
      )
    );
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
    this.historicoHasta = new Date().toISOString();
    await this.cargarHistorico();
  }

  private rawHistoryLimit(): number {
    if (this.diasHistorico <= 1) return 1000;
    if (this.diasHistorico <= 7) return 4000;
    return 12000;
  }

  private setDispositivo(dispositivo?: IDispositivo): void {
    this.historicoLoadVersion += 1;
    this.historicoHasta = new Date().toISOString();
    this.dispositivo = dispositivo;
    this.esLanzaDeSuelo = this.dispositivo?.tipo === 'Sensor de Humedad de Suelo';
    this.esSensorAmbiente = this.tieneVariableAmbiental(this.dispositivo);
    this.ultimoReporte = this.dispositivo?.ultimoReporte;
    this.datosLanza = this.esLanzaDeSuelo ? buildSentekProfile(this.ultimoReporte) : [];
    this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
  }

  private async cargarHistorico(): Promise<void> {
    const id = this.dispositivo?._id || this.dispositivo?.deveui;
    if ((!this.esLanzaDeSuelo && !this.esSensorAmbiente && !this.esEntradaAnalogica) || !id) return;
    const loadVersion = ++this.historicoLoadVersion;
    this.loadingHistorico = true;
    try {
      const [response, rawFrames] = await Promise.all([
        this.reportesService.historico(id, this.diasHistorico, 2500),
        this.dispositivo?.deveui
          ? this.lorawanUplinks.rawHistory(this.dispositivo.deveui, this.diasHistorico, this.rawHistoryLimit())
          : Promise.resolve([]),
      ]);
      if (loadVersion !== this.historicoLoadVersion) return;
      this.rawFrames = rawFrames;
      this.reportesHistoricos = response.datos?.length
        ? response.datos
        : this.ultimoReporte
          ? [this.ultimoReporte]
          : [];
    } catch (error) {
      if (loadVersion !== this.historicoLoadVersion) return;
      console.error('Error al cargar historico de reportes del dispositivo', error);
      this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
      this.rawFrames = [];
    } finally {
      if (loadVersion === this.historicoLoadVersion) this.loadingHistorico = false;
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
