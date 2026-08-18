import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import {
  IConfiguracionEntradaAnalogica,
  IDispositivo,
  ILorawanRawFrame,
  IReporte,
  serviciosDispositivoNormalizados,
} from 'modelos/src';
import { UbicarComponent } from '../../../../../auxiliares/componentes/ubicar/ubicar.component';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { LorawanUplinksService } from '../../../../../auxiliares/http/lorawan-uplinks.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { GraficoHistoricoAmbienteComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component';
import { GraficoHistoricoSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-suelo/grafico-historico-suelo.component';
import { GraficoHistoricoNapaComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-napa/grafico-historico-napa.component';
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
    GraficoHistoricoAmbienteComponent,
    GraficoHistoricoSueloComponent,
    GraficoHistoricoNapaComponent,
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
  public esMedidorNapa = false;
  public esSensorAmbiente = false;
  public vistaActiva: 'tabla' | 'grafico' = 'grafico';
  public reportesHistoricos: IReporte[] = [];
  public diasHistorico = 7;
  public historicoHasta = new Date().toISOString();
  public loadingHistorico = false;
  public rawFrames: ILorawanRawFrame[] = [];
  private historicoLoadVersion = 0;

  constructor(
    public helper: HelperService,
    private reportesService: ReporteService,
    private lorawanUplinks: LorawanUplinksService
  ) {}

  async ngOnInit(): Promise<void> {
    this.refreshFromDevice();
  }

  ngOnDestroy(): void {
    this.historicoLoadVersion += 1;
  }

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
    this.historicoHasta = new Date().toISOString();
    await this.cargarHistorico();
  }

  private rawHistoryLimit(): number {
    if (this.diasHistorico <= 1) return 1000;
    if (this.diasHistorico <= 7) return 4000;
    return 12000;
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

  public get configuracionNapa(): IConfiguracionEntradaAnalogica | undefined {
    const config = this.dispositivo?.configuracionLecturas?.entradaAnalogica;
    return config?.variable === 'nivel_napa' ? config : undefined;
  }

  private refreshFromDevice(): void {
    this.historicoLoadVersion += 1;
    this.historicoHasta = new Date().toISOString();
    this.loading = true;
    this.esLanzaDeSuelo = this.tieneVariableSuelo(this.dispositivo);
    this.esMedidorNapa = this.tieneVariableNapa(this.dispositivo);
    this.esSensorAmbiente = this.tieneVariableAmbiental(this.dispositivo);
    this.ultimoReporte = this.dispositivo?.ultimoReporte;
    this.datosLanza = this.esLanzaDeSuelo ? buildSentekProfile(this.ultimoReporte) : [];
    this.reportesHistoricos = this.ultimoReporte ? [this.ultimoReporte] : [];
    this.loading = false;
    this.cargarHistorico();
  }

  private async cargarHistorico(): Promise<void> {
    const id = this.dispositivo?._id || this.dispositivo?.deveui;
    if ((!this.esLanzaDeSuelo && !this.esMedidorNapa && !this.esSensorAmbiente) || !id) return;
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

  private tieneVariableSuelo(dispositivo?: IDispositivo): boolean {
    const servicios = serviciosDispositivoNormalizados(dispositivo);
    if (servicios.length === 1) return servicios[0].tipo === 'perfil_suelo';
    const sensores = (dispositivo?.sensores || []).map((sensor) => String(sensor));
    const valores = (dispositivo?.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    const texto = `${dispositivo?.tipo || ''} ${dispositivo?.nombre || ''}`.toLowerCase();
    const soilKeys = ['Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo'];

    return (
      dispositivo?.tipo === 'Sensor de Humedad de Suelo' ||
      soilKeys.some((key) => sensores.includes(key) || Array.isArray(valores[key])) ||
      texto.includes('sentek') ||
      texto.includes('lanza')
    );
  }

  private tieneVariableNapa(dispositivo?: IDispositivo): boolean {
    if (!dispositivo) return false;
    const servicios = serviciosDispositivoNormalizados(dispositivo);
    if (servicios.some((servicio) => servicio.tipo === 'nivel_napa')) return true;
    const valores = (dispositivo.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, unknown>;
    return dispositivo.configuracionLecturas?.entradaAnalogica?.variable === 'nivel_napa' || !!valores['Napa'];
  }
}
