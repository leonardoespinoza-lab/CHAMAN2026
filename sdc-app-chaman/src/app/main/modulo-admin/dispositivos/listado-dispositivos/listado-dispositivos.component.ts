import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { IDispositivo, IListado, ILorawanUplink, IPopulate, IQueryParam } from 'modelos/src';
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
    this.params.set('editDispositivo', false);
    this.router.navigate(['dispositivos', 'crear']);
  }

  public async edit(data: IDispositivo) {
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
    const populate: IPopulate[] = [
      { path: 'productor' },
      { path: 'establecimiento' },
      { path: 'lote' },
    ];
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
    this.uplinks = await this.lorawan.latest({ limit: 300 });
    this.latestByDevEui = new Map<string, ILorawanUplink>();

    for (const uplink of this.uplinks) {
      const devEUI = this.normalizeDevEui(uplink.devEUI);
      if (devEUI && !this.latestByDevEui.has(devEUI)) {
        this.latestByDevEui.set(devEUI, uplink);
      }
    }

    this.gateways = this.buildGateways(this.uplinks);
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
    return this.datos.filter((dato) => !dato.idProductor && !dato.idEstablecimiento && !dato.idLote).length;
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
