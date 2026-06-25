import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { IDispositivo, ILote } from 'modelos/src';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';
import { BateriaComponent } from '../../../../modulo-admin/dispositivos/bateria/bateria.component';
import {
  buildSentekProfile,
  MedicionProfundidad,
  MedicionSensorProfundidad,
} from '../../../../modulo-admin/dispositivos/detalles-dispositivo/sentek-profile';
import { DrawerDispositivosComponent } from '../drawer-dispositivos/drawer-dispositivos.component';

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
  imports: [CommonModule, SharedModule, DrawerDispositivosComponent, BateriaComponent],
  templateUrl: './card-dispositivos.component.html',
  styleUrl: './card-dispositivos.component.scss',
})
export class CardDispositivosComponent implements OnInit, OnDestroy, OnChanges {
  @Input() public lote?: ILote;
  public verDrawerDispositivos = false;

  public dispositivos: IDispositivo[] = [];
  public dispositivo?: IDispositivo;
  public perfiles = new Map<string, MedicionProfundidad[]>();
  public resumenes = new Map<string, DispositivoResumen>();
  public resumenesAmbiente = new Map<string, DispositivoAmbienteResumen>();

  constructor(public helper: HelperService) {}

  public abrirDrawerDispositivo(dispositivo: IDispositivo): void {
    this.dispositivo = dispositivo;
    this.verDrawerDispositivos = true;
  }

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

  public esLanzaDeSuelo(dispositivo: IDispositivo): boolean {
    return this.tieneVariableSuelo(dispositivo);
  }

  public esSensorAmbiente(dispositivo: IDispositivo): boolean {
    const sensores = dispositivo.sensores || [];
    const valores = (dispositivo.ultimoReporte?.datos?.valores || {}) as unknown as Record<string, any>;
    return (
      sensores.some((sensor) => ['Temperatura', 'Humedad', 'Batería', 'Bateria', 'BaterÃ­a'].includes(sensor as string)) ||
      !!valores['Temperatura'] ||
      !!valores['Humedad']
    );
  }

  public estaOnline(dispositivo: IDispositivo): boolean {
    const fecha = dispositivo.fechaUltimaComunicacion || dispositivo.ultimoReporte?.fecha || dispositivo.ultimoReporte?.fechaCreacion;
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
    return dispositivo.fechaUltimaComunicacion || dispositivo.ultimoReporte?.fecha || dispositivo.ultimoReporte?.fechaCreacion;
  }

  public estadoLabel(dispositivo: IDispositivo): string {
    return this.estaOnline(dispositivo) ? 'Online' : 'Sin reporte reciente';
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
    this.dispositivos = this.lote?.dispositivos || [];
    this.perfiles.clear();
    this.resumenes.clear();
    this.resumenesAmbiente.clear();

    for (const dispositivo of this.dispositivos) {
      const perfil = this.tieneVariableSuelo(dispositivo)
        ? buildSentekProfile(dispositivo.ultimoReporte)
        : [];
      const key = this.getDeviceKey(dispositivo);
      this.perfiles.set(key, perfil);
      this.resumenes.set(key, this.calcularResumen(perfil));
      this.resumenesAmbiente.set(key, this.calcularResumenAmbiente(dispositivo));
    }
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
    const conHumedad = perfil.filter((dato) => dato.humedad);
    const conSalinidad = perfil.filter((dato) => dato.salinidad);
    const conTemperatura = perfil.filter((dato) => dato.temperatura);

    return {
      humedad: this.promedio(conHumedad.map((dato) => dato.humedad!)),
      salinidad: this.promedio(conSalinidad.map((dato) => dato.salinidad!)),
      temperatura: this.promedio(conTemperatura.map((dato) => dato.temperatura!)),
    };
  }

  private promedio(datos: MedicionSensorProfundidad[]): MedicionSensorProfundidad | undefined {
    if (!datos.length) return undefined;
    const actual = datos.reduce((sum, dato) => sum + dato.actual, 0) / datos.length;
    return {
      actual,
      unidad: datos[0].unidad,
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote']) {
      this.setDispositivos();
    }
  }

  async ngOnInit(): Promise<void> {
    this.setDispositivos();
  }

  ngOnDestroy(): void {}
}
