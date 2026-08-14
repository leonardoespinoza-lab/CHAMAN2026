import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  IDispositivo,
  IListado,
  ILorawanUplink,
  IPopulate,
  IQueryParam,
  IServicioDispositivo,
  serviciosDispositivoNormalizados,
} from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { UbicarComponent } from '../../../../auxiliares/componentes/ubicar/ubicar.component';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { BateriaComponent } from '../bateria/bateria.component';
import { DispositivoService } from '../../../../auxiliares/http/dispositivos.service';
import { LorawanUplinksService } from '../../../../auxiliares/http/lorawan-uplinks.service';

interface GatewaySummary {
  gatewayID: string;
  ultimoReporte?: string;
  rssi?: number;
  snr?: number;
  dispositivos: number;
  online: boolean;
}

interface MilesightPayloadCapabilities {
  soilProfile: boolean;
  analogInput: boolean;
}

@Component({
  selector: 'app-listado-dispositivos',
  imports: [SharedModule, BateriaComponent, UbicarComponent],
  templateUrl: './listado-dispositivos.component.html',
  styleUrl: './listado-dispositivos.component.scss',
})
export class ListadoDispositivosComponent implements OnInit, OnDestroy {
  public loading = false;

  public name = ListadoDispositivosComponent.name;
  public datos: IDispositivo[] = [];
  public totalCount = 0;
  public uplinks: ILorawanUplink[] = [];
  public latestByDevEui = new Map<string, ILorawanUplink>();
  public gateways: GatewaySummary[] = [];
  public detectedUplinks: ILorawanUplink[] = [];
  private dispositivosPorDevEui = new Map<string, IDispositivo>();

  public datos$?: Subscription;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listados: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: DispositivoService,
    private lorawan: LorawanUplinksService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.remove('nuevoDispositivoLorawan');
    this.params.set('editDispositivo', false);
    this.router.navigate(['dispositivos', 'crear']);
  }

  public async edit(data: IDispositivo) {
    this.params.remove('nuevoDispositivoLorawan');
    this.params.set('editDispositivo', data);
    this.router.navigate(['dispositivos', 'editar', data._id]);
  }

  public detalles(data: IDispositivo) {
    this.params.set('detallesDispositivo', data);
    this.router.navigate(['dispositivos', 'detalles', data?._id]);
  }

  public async delete(dato: IDispositivo): Promise<void> {
    this.confirmationService.confirm({
      // target: event.target as EventTarget,
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar el dispositivo?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        this.loading = true;
        try {
          await this.service.delete(dato._id!);

          // Solo elimina el item en cache
          this.listados.deleteEntityItem('dispositivos', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  // Listados

  private async listar(): Promise<void> {
    const populate: IPopulate[] = [{ path: 'productor' }, { path: 'establecimiento' }, { path: 'lote' }];
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listados
      .subscribe<IListado<IDispositivo>>('dispositivos', queryParams)
      .subscribe(async (data) => {
        this.totalCount = data.totalCount;
        this.datos = data.datos;
        this.rebuildDeviceIndex();
        console.log(`listado de dispositivos`, data);
      });
    await this.listados.getLastValue('dispositivos', queryParams);
  }

  public async refreshLorawan(): Promise<void> {
    this.loading = true;
    try {
      await this.listarUplinks();
      this.helper.notifSuccess('Uplinks LoRaWAN actualizados');
    } catch (error) {
      this.helper.notifError(error);
    }
    this.loading = false;
  }

  private async listarUplinks(): Promise<void> {
    this.uplinks = await this.lorawan.latestByDevice(1000);
    this.latestByDevEui = new Map<string, ILorawanUplink>();

    for (const uplink of this.uplinks) {
      const devEUI = this.normalizeDevEui(uplink.devEUI);
      if (devEUI && !this.latestByDevEui.has(devEUI)) {
        this.latestByDevEui.set(devEUI, uplink);
      }
    }

    this.detectedUplinks = Array.from(this.latestByDevEui.values()).sort((a, b) => {
      const fechaA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const fechaB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return fechaB - fechaA;
    });
    this.gateways = this.buildGateways(this.uplinks);
  }

  public deviceForUplink(uplink: ILorawanUplink): IDispositivo | undefined {
    return this.dispositivosPorDevEui.get(this.normalizeDevEui(uplink.devEUI));
  }

  public addOrAssignFromUplink(uplink: ILorawanUplink): void {
    const existing = this.deviceForUplink(uplink);
    if (existing) {
      this.edit(existing);
      return;
    }

    const devEUI = this.normalizeDevEui(uplink.devEUI);
    const capabilities = this.inferredReadoutCapabilities(uplink);
    const nombre =
      uplink.deviceName ||
      (capabilities.soilProfile && capabilities.analogInput
        ? `Controlador Milesight con Sentek y entrada analógica ${devEUI}`
        : capabilities.soilProfile
          ? `Controlador Milesight con Sentek ${devEUI}`
          : capabilities.analogInput
            ? `Controlador Milesight con entrada analógica ${devEUI}`
            : '') ||
      uplink.applicationName ||
      uplink.devEUI ||
      'Dispositivo MQTT';
    this.params.set('editDispositivo', false);
    this.params.set('nuevoDispositivoLorawan', {
      nombre,
      deveui: devEUI,
      tipo: this.inferType(uplink),
      sensores: this.inferSensors(uplink),
      configuracionLecturas:
        capabilities.soilProfile || capabilities.analogInput
          ? {
              ...(capabilities.soilProfile
                ? {
                    perfilSuelo: {
                      tipo: 'sonda_sentek_120cm' as const,
                      protocolo: 'SDI-12' as const,
                      niveles: 12 as const,
                      profundidadesCm: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
                      variables: ['humedad_vwc' as const, 'salinidad_vic' as const, 'temperatura' as const],
                    },
                  }
                : {}),
              ...(capabilities.analogInput
                ? {
                    entradaAnalogica: {
                      canal: 1 as const,
                      tipoSenal: '4-20mA' as const,
                      variable: 'sin_definir' as const,
                      entradaMinMa: 4,
                      entradaMaxMa: 20,
                    },
                  }
                : {}),
            }
          : undefined,
      metadata: {
        applicationID: uplink.applicationID,
        applicationName: uplink.applicationName,
        gatewayID: uplink.gatewayID,
        frequency: uplink.frequency,
        fCnt: uplink.fCnt,
        fPort: uplink.fPort,
        rssi: uplink.rssi,
        snr: uplink.snr,
        dr: uplink.dr,
      },
      fechaUltimaComunicacion: uplink.timestamp,
    } as Partial<IDispositivo>);
    this.router.navigate(['dispositivos', 'crear']);
  }

  public inferredLabel(uplink: ILorawanUplink): string {
    const device = this.deviceForUplink(uplink);
    if (device?.tipo && device.tipo !== 'Otro') {
      return device.tipo;
    }
    return this.inferType(uplink) || 'Otro';
  }

  public assignmentLabel(uplink: ILorawanUplink): string {
    const device = this.deviceForUplink(uplink);
    if (!device) {
      return 'Nuevo: pendiente de agregar a Chaman';
    }
    const servicios = this.logicalServices(device);
    if (device.servicios?.length) {
      const asignados = servicios.filter((servicio) => servicio.idLote).length;
      return `${servicios.length} servicios · ${asignados} asignado${asignados === 1 ? '' : 's'} · ${
        servicios.length - asignados
      } pendiente${servicios.length - asignados === 1 ? '' : 's'}`;
    }
    if (device.lote?.nombre || device.idLote) {
      return `Asignado a lote: ${device.lote?.nombre || device.idLote}`;
    }
    if (device.establecimiento?.nombre || device.idEstablecimiento) {
      return `Asignado a establecimiento: ${device.establecimiento?.nombre || device.idEstablecimiento}`;
    }
    if (device.productor?.nombre || device.idProductor) {
      return `Asignado a productor: ${device.productor?.nombre || device.idProductor}`;
    }
    return 'Registrado sin asignar';
  }

  public assignmentClass(uplink: ILorawanUplink): string {
    const device = this.deviceForUplink(uplink);
    if (!device) {
      return 'mqtt-new';
    }
    if (
      this.logicalServices(device).some(
        (servicio) => servicio.idLote || servicio.idEstablecimiento || servicio.idProductor
      )
    ) {
      return 'mqtt-assigned';
    }
    return 'mqtt-unassigned';
  }

  public uplinkSignal(uplink: ILorawanUplink): string {
    if (uplink.rssi === undefined && uplink.snr === undefined) {
      return '-';
    }
    return `${uplink.rssi ?? '--'} dBm / ${uplink.snr ?? '--'} dB`;
  }

  public uplinkFor(row: IDispositivo): ILorawanUplink | undefined {
    return this.latestByDevEui.get(this.normalizeDevEui(row.deveui));
  }

  public statusLabel(row: IDispositivo): string {
    const fecha = this.uplinkFor(row)?.timestamp || row.fechaUltimaComunicacion;
    if (!fecha) {
      return 'Sin reporte';
    }
    return this.isOnline(fecha) ? 'Online' : 'Demorado';
  }

  public statusClass(row: IDispositivo): string {
    const fecha = this.uplinkFor(row)?.timestamp || row.fechaUltimaComunicacion;
    if (!fecha) {
      return 'status-empty';
    }
    return this.isOnline(fecha) ? 'status-online' : 'status-late';
  }

  public gatewayFor(row: IDispositivo): string {
    return this.uplinkFor(row)?.gatewayID || row.metadata?.gatewayID || '-';
  }

  public signalFor(row: IDispositivo): string {
    const uplink = this.uplinkFor(row);
    const rssi = uplink?.rssi ?? row.metadata?.rssi;
    const snr = uplink?.snr ?? row.metadata?.snr;
    if (rssi === undefined && snr === undefined) {
      return '-';
    }
    return `${rssi ?? '--'} dBm / ${snr ?? '--'} dB`;
  }

  public get onlineDevices(): number {
    return this.datos.filter((dato) => this.statusLabel(dato) === 'Online').length;
  }

  public get unassignedDevices(): number {
    return this.datos.reduce(
      (total, dato) =>
        total +
        this.logicalServices(dato).filter(
          (servicio) => !servicio.idProductor && !servicio.idEstablecimiento && !servicio.idLote
        ).length,
      0
    );
  }

  public logicalServices(device: IDispositivo): IServicioDispositivo[] {
    return serviciosDispositivoNormalizados(device);
  }

  public serviceAssignmentLabel(servicio: IServicioDispositivo): string {
    if (servicio.idLote) return `Lote ${servicio.idLote}`;
    if (servicio.idEstablecimiento) return `Establecimiento ${servicio.idEstablecimiento}`;
    if (servicio.idProductor) return `Productor ${servicio.idProductor}`;
    return 'Pendiente de asignar';
  }

  public get detectedDevices(): number {
    return this.latestByDevEui.size;
  }

  private buildGateways(uplinks: ILorawanUplink[]): GatewaySummary[] {
    const gateways = new Map<string, GatewaySummary>();

    for (const uplink of uplinks) {
      if (!uplink.gatewayID) {
        continue;
      }

      const current =
        gateways.get(uplink.gatewayID) ||
        ({
          gatewayID: uplink.gatewayID,
          dispositivos: 0,
          online: false,
        } as GatewaySummary);

      const currentDate = current.ultimoReporte ? new Date(current.ultimoReporte).getTime() : 0;
      const uplinkDate = uplink.timestamp ? new Date(uplink.timestamp).getTime() : 0;

      if (!current.ultimoReporte || uplinkDate > currentDate) {
        current.ultimoReporte = uplink.timestamp;
        current.rssi = uplink.rssi;
        current.snr = uplink.snr;
        current.online = this.isOnline(uplink.timestamp);
      }

      current.dispositivos += uplink.devEUI ? 1 : 0;
      gateways.set(uplink.gatewayID, current);
    }

    return Array.from(gateways.values()).sort((a, b) => {
      const fechaA = a.ultimoReporte ? new Date(a.ultimoReporte).getTime() : 0;
      const fechaB = b.ultimoReporte ? new Date(b.ultimoReporte).getTime() : 0;
      return fechaB - fechaA;
    });
  }

  private rebuildDeviceIndex(): void {
    this.dispositivosPorDevEui = new Map<string, IDispositivo>();
    for (const dispositivo of this.datos) {
      const key = this.normalizeDevEui(dispositivo.deveui);
      if (key) {
        this.dispositivosPorDevEui.set(key, dispositivo);
      }
    }
  }

  private inferType(uplink: ILorawanUplink): IDispositivo['tipo'] {
    const text = `${uplink.deviceName || ''} ${uplink.applicationName || ''}`.toLowerCase();
    if (this.inferredReadoutCapabilities(uplink).soilProfile) {
      return 'Sensor de Humedad de Suelo';
    }
    if (text.includes('pluvio') || text.includes('lluvia') || text.includes('rain')) {
      return 'Pluviometro';
    }
    if (text.includes('meteo') || text.includes('weather') || text.includes('estacion')) {
      return 'Estacion Meteorologica';
    }
    return 'Otro';
  }

  private inferSensors(uplink: ILorawanUplink): IDispositivo['sensores'] {
    const type = this.inferType(uplink);
    const capabilities = this.inferredReadoutCapabilities(uplink);
    if (type === 'Sensor de Humedad de Suelo' || capabilities.analogInput) {
      const sensors: IDispositivo['sensores'] = [];
      if (type === 'Sensor de Humedad de Suelo') {
        sensors.push('Humedad Suelo Profundidad', 'Temperatura Suelo', 'Salinidad Suelo');
      }
      if (capabilities.analogInput) sensors.push('Entrada Analógica');
      return sensors;
    }
    if (type === 'Pluviometro') {
      return ['Pluviometro'];
    }
    if (type === 'Estacion Meteorologica') {
      return ['Temperatura', 'Humedad', 'Viento Velocidad', 'Pluviometro'];
    }
    return ['Otro'];
  }

  private inferredReadoutCapabilities(uplink: ILorawanUplink): MilesightPayloadCapabilities {
    const decoded = this.milesightPayloadCapabilities(uplink);
    const identity = `${uplink.deviceName || ''} ${uplink.applicationName || ''}`.toLowerCase();
    return {
      soilProfile:
        decoded.soilProfile ||
        identity.includes('sentek') ||
        identity.includes('lanza') ||
        identity.includes('humedad de suelo') ||
        identity.includes('soil moisture'),
      analogInput:
        decoded.analogInput ||
        identity.includes('napa') ||
        identity.includes('freat') ||
        identity.includes('4-20') ||
        identity.includes('analog'),
    };
  }

  private milesightPayloadCapabilities(uplink: ILorawanUplink): MilesightPayloadCapabilities {
    const hex = this.getUplinkPayloadHex(uplink);
    if (!hex) return { soilProfile: false, analogInput: false };

    const bytes = hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) || [];
    let soilProfile = false;
    let analogInput = false;
    let index = 0;
    while (index + 1 < bytes.length) {
      const channel = bytes[index];
      const type = bytes[index + 1];
      if (bytes[index] === 0x08 && bytes[index + 1] === 0xdb && bytes[index + 2] <= 0x0b) {
        soilProfile = true;
        const officialEnd = Math.min(index + 39, bytes.length);
        let nextIndex = officialEnd;
        for (let cursor = index + 3; cursor + 3 < officialEnd; cursor += 1) {
          if (
            bytes[cursor] === 0x0d &&
            bytes[cursor + 1] === 0x0a &&
            (bytes[cursor + 2] === 0x08 ||
              bytes[cursor + 2] === 0x05 ||
              bytes[cursor + 2] === 0x06 ||
              bytes[cursor + 2] === 0x85 ||
              bytes[cursor + 2] === 0x86)
          ) {
            nextIndex = cursor + 2;
            break;
          }
        }
        index = nextIndex;
        continue;
      }
      if (
        (channel === 0x05 || channel === 0x06 || channel === 0x85 || channel === 0x86) &&
        (type === 0xe2 || type === 0x02)
      ) {
        const blockLength = channel >= 0x80 ? 11 : 10;
        if (index + blockLength > bytes.length) break;
        analogInput = true;
        index += blockLength;
        continue;
      }

      const knownLength =
        channel === 0x01 && type === 0x75
          ? 3
          : (channel === 0x03 || channel === 0x04) && (type === 0x00 || type === 0x01)
            ? 3
            : (channel === 0x03 || channel === 0x04) && type === 0xc8
              ? 6
              : 0;
      if (!knownLength || index + knownLength > bytes.length) break;
      index += knownLength;
    }
    return { soilProfile, analogInput };
  }

  private getUplinkPayloadHex(uplink: ILorawanUplink): string | undefined {
    const rawPayload = (uplink as any).rawPayload || {};
    const explicitHex = [rawPayload.payloadHex, rawPayload.hexPayload, rawPayload.dataHex].find(
      (value) => typeof value === 'string' && value.trim()
    );
    const normalizedExplicitHex = this.normalizeHex(explicitHex);
    if (normalizedExplicitHex) return normalizedExplicitHex;

    const candidates = [
      uplink.data,
      rawPayload.FRMPayload,
      rawPayload.frmPayload,
      rawPayload.frmpayload,
      rawPayload.MACPayload?.FRMPayload,
      rawPayload.macPayload?.FRMPayload,
      rawPayload.uplink?.frmPayload,
      rawPayload.object?.frmPayload,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      const normalizedHex = this.normalizeHex(candidate);
      if (normalizedHex) return normalizedHex;
      try {
        const binary = atob(candidate.trim());
        return Array.from(binary, (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      } catch {
        // El payload no es HEX ni base64 valido: no se infieren sensores.
      }
    }
    return undefined;
  }

  private normalizeHex(value?: string): string | undefined {
    if (!value) return undefined;
    const cleaned = value.replace(/0x/gi, '').replace(/\s/g, '');
    return cleaned.length >= 2 && cleaned.length % 2 === 0 && /^[a-fA-F0-9]+$/.test(cleaned)
      ? cleaned.toLowerCase()
      : undefined;
  }

  private isOnline(fecha?: string, minutes = 30): boolean {
    if (!fecha) {
      return false;
    }
    const timestamp = new Date(fecha).getTime();
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    return Date.now() - timestamp <= minutes * 60 * 1000;
  }

  private normalizeDevEui(devEUI?: string): string {
    return (devEUI || '').trim().toUpperCase();
  }

  /// Hooks

  public async ngOnInit() {
    this.loading = true;
    await Promise.all([this.listar(), this.listarUplinks()]);
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
