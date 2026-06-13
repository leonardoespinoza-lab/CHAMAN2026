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

  public ultimaComunicacion(dispositivo: IDispositivo): string | undefined {
    return dispositivo.fechaUltimaComunicacion || dispositivo.ultimoReporte?.fecha || dispositivo.ultimoReporte?.fechaCreacion;
  }

  public estadoLabel(dispositivo: IDispositivo): string {
    return this.estaOnline(dispositivo) ? 'Online' : 'Sin reporte reciente';
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

    for (const dispositivo of this.dispositivos) {
      const perfil = dispositivo.tipo === 'Sensor de Humedad de Suelo'
        ? buildSentekProfile(dispositivo.ultimoReporte)
        : [];
      const key = this.getDeviceKey(dispositivo);
      this.perfiles.set(key, perfil);
      this.resumenes.set(key, this.calcularResumen(perfil));
    }
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
