import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { IDispositivo, ILorawanRawFrame, ILote, IReporte } from 'modelos/src';
import { LorawanUplinksService } from '../../../../../auxiliares/http/lorawan-uplinks.service';
import { ReporteService } from '../../../../../auxiliares/http/reporte.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { BateriaComponent } from '../../../../modulo-admin/dispositivos/bateria/bateria.component';
import {
  buildSentekProfile,
  MedicionProfundidad,
  MedicionSensorProfundidad,
} from '../../../../modulo-admin/dispositivos/detalles-dispositivo/sentek-profile';
import { GraficoHistoricoAmbienteComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-ambiente/grafico-historico-ambiente.component';
import { GraficoHistoricoSueloComponent } from '../../../../modulo-admin/dispositivos/detalles-dispositivo/grafico-historico-suelo/grafico-historico-suelo.component';

interface DispositivoResumen {
  humedad?: MedicionSensorProfundidad;
  salinidad?: MedicionSensorProfundidad;
  temperatura?: MedicionSensorProfundidad;
}

interface DispositivoAmbienteResumen {
  temperatura?: number;
  humedad?: number;
  bateria?: number;
}

@Component({
  selector: 'app-card-dispositivos',
  imports: [
    CommonModule,
    SharedModule,
    BateriaComponent,
    GraficoHistoricoAmbienteComponent,
    GraficoHistoricoSueloComponent,
  ],
  templateUrl: './card-dispositivos.component.html',
  styleUrl: './card-dispositivos.component.scss',
})
export class CardDispositivosComponent implements OnInit, OnDestroy, OnChanges {
  @Input() public lote?: ILote;

  public dispositivos: IDispositivo[] = [];
  public perfiles = new Map<string, MedicionProfundidad[]>();
  public resumenes = new Map<string, DispositivoResumen>();
  public resumenesAmbiente = new Map<string, DispositivoAmbienteResumen>();
  public reportesHistoricos = new Map<string, IReporte[]>();
  public tramasCrudas = new Map<string, ILorawanRawFrame[]>();
  public cargandoHistorico = new Set<string>();
  public erroresHistorico = new Set<string>();
  public diasHistorico = 30;
  private initialized = false;
  private loadVersion = 0;

  constructor(
    public helper: HelperService,
    private reportesService: ReporteService,
    private lorawanUplinks: LorawanUplinksService
  ) {}

  public getDeviceKey(dispositivo: IDispositivo): string {
    return dispositivo._id || dispositivo.deveui || dispositivo.nombre || 'sin-id';
  }

  public perfil(dispositivo: IDispositivo): MedicionProfundidad[] {
    return this.perfiles.get(this.getDeviceKey(dispositivo)) || [];
  }

  public resumen(dispositivo: IDispositivo): DispositivoResumen {
    return this.resumenes.get(this.getDeviceKey(dispositivo)) || {};
  }

  public resumenAmbiente(dispositivo: IDispositivo): DispositivoAmbienteResumen {
    return this.resumenesAmbiente.get(this.getDeviceKey(dispositivo)) || {};
  }

  public historico(dispositivo: IDispositivo): IReporte[] {
    return this.reportesHistoricos.get(this.getDeviceKey(dispositivo)) || [];
  }

  public frames(dispositivo: IDispositivo): ILorawanRawFrame[] {
    return this.tramasCrudas.get(this.getDeviceKey(dispositivo)) || [];
  }

  public estaCargandoHistorico(dispositivo: IDispositivo): boolean {
    return this.cargandoHistorico.has(this.getDeviceKey(dispositivo));
  }

  public historicoConError(dispositivo: IDispositivo): boolean {
    return this.erroresHistorico.has(this.getDeviceKey(dispositivo));
  }

  public async cambiarPeriodo(dias: number): Promise<void> {
    if (dias === this.diasHistorico) return;
    this.diasHistorico = dias;
    await this.cargarHistoricosInline();
  }

  public esLanzaDeSuelo(dispositivo: IDispositivo): boolean {
    return this.tieneVariableSuelo(dispositivo);
  }

  public esSensorAmbiente(dispositivo: IDispositivo): boolean {
    const sensores = dispositivo.sensores || [];
    const valores = (dispositivo.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    return (
      sensores.some((sensor) =>
        ['Temperatura', 'Humedad', 'Batería', 'Bateria', 'BaterÃ­a'].includes(sensor as string)
      ) ||
      !!valores['Temperatura'] ||
      !!valores['Humedad']
    );
  }

  public estaOnline(dispositivo: IDispositivo): boolean {
    const fecha =
      dispositivo.fechaUltimaComunicacion ||
      dispositivo.ultimoReporte?.fecha ||
      dispositivo.ultimoReporte?.fechaCreacion;
    if (!fecha) return false;
    const timestamp = new Date(fecha).getTime();
    return Number.isFinite(timestamp) && Date.now() - timestamp <= 30 * 60 * 1000;
  }

  public formatearValor(data?: MedicionSensorProfundidad, decimales = '1.1-1'): string {
    if (!data || data.actual === undefined || data.actual === null) {
      return '-';
    }
    return `${data.actual.toLocaleString('es-AR', this.numberFormat(decimales))} ${data.unidad}`;
  }

  public formatearNumero(valor?: number, unidad = '', decimales = 1): string {
    if (valor === undefined || valor === null || !Number.isFinite(valor)) return '-';
    const numero = valor.toLocaleString('es-AR', {
      maximumFractionDigits: decimales,
      minimumFractionDigits: decimales,
    });
    return `${numero}${unidad ? ` ${unidad}` : ''}`;
  }

  public ultimaComunicacion(dispositivo: IDispositivo): string | undefined {
    return (
      dispositivo.fechaUltimaComunicacion ||
      dispositivo.ultimoReporte?.fecha ||
      dispositivo.ultimoReporte?.fechaCreacion
    );
  }

  public estadoLabel(dispositivo: IDispositivo): string {
    const edad = this.edadUltimaComunicacionMs(dispositivo);
    if (edad === undefined) return 'Sin reportes';
    if (edad <= 30 * 60 * 1000) return 'Online';
    if (edad <= 24 * 60 * 60 * 1000) return 'Ultimo reporte <24 h';
    if (edad <= 72 * 60 * 60 * 1000) return 'Demorado';
    return 'Sin reporte reciente';
  }

  public perfilLabel(dispositivo: IDispositivo): string {
    const perfil = this.perfil(dispositivo);
    const variables = [
      perfil.some((dato) => dato.humedad) ? 'humedad' : '',
      perfil.some((dato) => dato.salinidad) ? 'salinidad' : '',
      perfil.some((dato) => dato.temperatura) ? 'temperatura' : '',
    ].filter(Boolean);

    if (!variables.length) {
      return 'Perfil pendiente: el ultimo reporte no trae variables de profundidad validas.';
    }

    const prefijo =
      dispositivo.ultimoReporte?.estado === 'parcial'
        ? 'Perfil parcial por profundidad'
        : 'Perfil disponible por profundidad';
    return `${prefijo}: ${variables.join(', ')}.`;
  }

  private tieneVariableSuelo(dispositivo?: IDispositivo): boolean {
    const sensores = (dispositivo?.sensores || []).map((sensor) => String(sensor));
    const valores = (dispositivo?.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    const texto = `${dispositivo?.tipo || ''} ${dispositivo?.nombre || ''} ${dispositivo?.deveui || ''}`.toLowerCase();
    const soilKeys = ['Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo', 'Napa'];

    return (
      dispositivo?.tipo === 'Sensor de Humedad de Suelo' ||
      soilKeys.some((key) => sensores.includes(key) || Array.isArray(valores[key])) ||
      texto.includes('sentek') ||
      texto.includes('lanza') ||
      texto.includes('napa') ||
      texto.includes('uc501') ||
      texto.includes('uc511')
    );
  }

  private numberFormat(format: string): Intl.NumberFormatOptions {
    if (format === '1.3-3') {
      return { minimumFractionDigits: 3, maximumFractionDigits: 3 };
    }
    return { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  }

  private setDispositivos(): void {
    this.dispositivos = this.dispositivosFisicosUnicos(this.lote?.dispositivos || []);
    this.perfiles.clear();
    this.resumenes.clear();
    this.resumenesAmbiente.clear();

    for (const dispositivo of this.dispositivos) {
      const perfil = this.tieneVariableSuelo(dispositivo) ? buildSentekProfile(dispositivo.ultimoReporte) : [];
      const key = this.getDeviceKey(dispositivo);
      this.perfiles.set(key, perfil);
      this.resumenes.set(key, this.calcularResumen(perfil));
      this.resumenesAmbiente.set(key, this.calcularResumenAmbiente(dispositivo));
    }
  }

  private async cargarHistoricosInline(): Promise<void> {
    const version = ++this.loadVersion;
    const graficables = this.dispositivos.filter(
      (dispositivo) => this.esLanzaDeSuelo(dispositivo) || this.esSensorAmbiente(dispositivo)
    );

    this.cargandoHistorico = new Set(graficables.map((dispositivo) => this.getDeviceKey(dispositivo)));
    this.erroresHistorico.clear();

    await Promise.all(
      graficables.map(async (dispositivo) => {
        const key = this.getDeviceKey(dispositivo);
        const id = dispositivo._id || dispositivo.deveui;
        if (!id) {
          this.cargandoHistorico.delete(key);
          return;
        }

        try {
          const [response, frames] = await Promise.allSettled([
            this.reportesService.historico(id, this.diasHistorico, 5000),
            this.esLanzaDeSuelo(dispositivo) && dispositivo.deveui
              ? this.lorawanUplinks.rawHistory(dispositivo.deveui, this.diasHistorico, 5000)
              : Promise.resolve<ILorawanRawFrame[]>([]),
          ]);

          if (version !== this.loadVersion) return;
          const fallback = dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : [];
          const reportes = response.status === 'fulfilled' ? response.value.datos || [] : [];
          const tramas = frames.status === 'fulfilled' ? frames.value : [];
          this.reportesHistoricos.set(key, reportes.length ? reportes : fallback);
          this.tramasCrudas.set(key, tramas);
          if (response.status === 'rejected' || frames.status === 'rejected') {
            this.erroresHistorico.add(key);
          }
        } catch (error) {
          if (version !== this.loadVersion) return;
          console.error('Error al cargar las curvas inline del dispositivo', error);
          this.erroresHistorico.add(key);
          this.reportesHistoricos.set(key, dispositivo.ultimoReporte ? [dispositivo.ultimoReporte] : []);
          this.tramasCrudas.set(key, []);
        } finally {
          if (version === this.loadVersion) {
            this.cargandoHistorico.delete(key);
          }
        }
      })
    );
  }

  /**
   * El inventario canonico expone un controlador fisico por DevEUI. Esta
   * defensa evita repetir sus curvas si una respuesta legacy materializa
   * vistas logicas separadas para Sentek y napa.
   */
  private dispositivosFisicosUnicos(dispositivos: IDispositivo[]): IDispositivo[] {
    const unicos = new Map<string, IDispositivo>();
    dispositivos.forEach((dispositivo, index) => {
      const devEUI = String(dispositivo.deveui || '')
        .replace(/[^a-fA-F0-9]/g, '')
        .toUpperCase();
      const key = devEUI ? `eui:${devEUI}` : `id:${dispositivo._id || index}`;
      const existente = unicos.get(key);
      if (!existente) {
        unicos.set(key, dispositivo);
        return;
      }

      const servicios = new Map(
        [...(existente.servicios || []), ...(dispositivo.servicios || [])].map((servicio) => [servicio.id, servicio])
      );
      unicos.set(key, {
        ...existente,
        ...dispositivo,
        sensores: [...new Set([...(existente.sensores || []), ...(dispositivo.sensores || [])])],
        servicios: [...servicios.values()],
        ultimoReporte: this.reporteMasReciente(existente.ultimoReporte, dispositivo.ultimoReporte),
      });
    });
    return [...unicos.values()];
  }

  private reporteMasReciente(a?: IReporte, b?: IReporte): IReporte | undefined {
    if (!a) return b;
    if (!b) return a;
    const fecha = (reporte: IReporte): number => new Date(reporte.fecha || reporte.fechaCreacion || 0).getTime() || 0;
    return fecha(b) >= fecha(a) ? b : a;
  }

  private edadUltimaComunicacionMs(dispositivo: IDispositivo): number | undefined {
    const fecha = this.ultimaComunicacion(dispositivo);
    if (!fecha) return undefined;
    const timestamp = new Date(fecha).getTime();
    if (!Number.isFinite(timestamp)) return undefined;
    return Date.now() - timestamp;
  }

  private calcularResumenAmbiente(dispositivo: IDispositivo): DispositivoAmbienteResumen {
    const valores = (dispositivo.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    return {
      temperatura: this.valorActual(valores['Temperatura']?.[0]),
      humedad: this.valorActual(valores['Humedad']?.[0]),
      bateria:
        this.valorActual(valores['Batería']?.[0]) ??
        this.valorActual(valores['Bateria']?.[0]) ??
        this.valorActual(valores['BaterÃ­a']?.[0]) ??
        dispositivo.bateria?.valor,
    };
  }

  private valorActual(entry?: { valores?: { actual?: number; promedio?: number } }): number | undefined {
    const valor = entry?.valores?.actual ?? entry?.valores?.promedio;
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;
  }

  private calcularResumen(perfil: MedicionProfundidad[]): DispositivoResumen {
    return {
      humedad: perfil.find((dato) => dato.humedad)?.humedad,
      salinidad: perfil.find((dato) => dato.salinidad)?.salinidad,
      temperatura: perfil.find((dato) => dato.temperatura)?.temperatura,
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.setDispositivos();
      if (this.initialized) {
        void this.cargarHistoricosInline();
      }
    }
  }

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    this.setDispositivos();
    await this.cargarHistoricosInline();
  }

  ngOnDestroy(): void {
    this.loadVersion++;
  }
}
