import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { credentials, Metadata } from '@grpc/grpc-js';
import { ApplicationServiceClient } from '@chirpstack/chirpstack-api/api/application_grpc_pb';
import { ListApplicationsRequest } from '@chirpstack/chirpstack-api/api/application_pb';
import { DeviceServiceClient } from '@chirpstack/chirpstack-api/api/device_grpc_pb';
import { ListDevicesRequest } from '@chirpstack/chirpstack-api/api/device_pb';
import { ILorawanDeviceCatalogItem } from 'modelos/src';
import { AxiosService } from '../axios/axios.service';
import {
  API_DATOS,
  CHIRPSTACK_API_TOKEN,
  CHIRPSTACK_DEVICE_SYNC_ENABLED,
  CHIRPSTACK_DEVICE_SYNC_INTERVAL_MS,
  CHIRPSTACK_DEVICE_SYNC_STARTUP_DELAY_MS,
  CHIRPSTACK_GRPC_ADDRESS,
  CHIRPSTACK_TENANT_ID,
  LORAWAN_CATALOG_INTERNAL_TOKEN,
} from '../../env';

@Injectable()
export class ChirpstackDeviceSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChirpstackDeviceSyncService.name);
  private readonly applicationClient = new ApplicationServiceClient(
    CHIRPSTACK_GRPC_ADDRESS,
    credentials.createInsecure(),
  );
  private readonly deviceClient = new DeviceServiceClient(
    CHIRPSTACK_GRPC_ADDRESS,
    credentials.createInsecure(),
  );
  private startupTimer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly http: AxiosService) {}

  onModuleInit() {
    if (!CHIRPSTACK_DEVICE_SYNC_ENABLED) return;
    this.startupTimer = setTimeout(
      () => void this.sync(),
      CHIRPSTACK_DEVICE_SYNC_STARTUP_DELAY_MS,
    );
    this.interval = setInterval(
      () => void this.sync(),
      CHIRPSTACK_DEVICE_SYNC_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.interval) clearInterval(this.interval);
    this.applicationClient.close();
    this.deviceClient.close();
  }

  async sync(): Promise<void> {
    if (this.running || !CHIRPSTACK_DEVICE_SYNC_ENABLED) return;
    this.running = true;
    try {
      const items = await this.readCatalog();
      const result = await this.http.POST<any>(
        `${API_DATOS}/dispositivos/lorawan-catalog/sync`,
        { items },
        {
          headers: {
            'x-chaman-internal-token': LORAWAN_CATALOG_INTERNAL_TOKEN,
          },
        },
      );
      this.logger.log(
        `Inventario ChirpStack sincronizado: ${result?.total ?? items.length} dispositivos.`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo sincronizar el inventario ChirpStack: ${error?.message || 'error desconocido'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set('authorization', `Bearer ${CHIRPSTACK_API_TOKEN}`);
    return metadata;
  }

  private unary<T>(
    invoke: (callback: (error: Error | null, value?: T) => void) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      invoke((error, value) => {
        if (error) return reject(error);
        if (!value)
          return reject(new Error('ChirpStack devolvio una respuesta vacia.'));
        resolve(value);
      });
    });
  }

  private async readCatalog(): Promise<ILorawanDeviceCatalogItem[]> {
    const applications: Array<{ id: string; name: string }> = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const request = new ListApplicationsRequest();
      request.setLimit(pageSize);
      request.setOffset(offset);
      if (CHIRPSTACK_TENANT_ID) request.setTenantId(CHIRPSTACK_TENANT_ID);
      const response: any = await this.unary((callback) =>
        this.applicationClient.list(request, this.metadata(), callback as any),
      );
      const page = response.getResultList();
      page.forEach((item: any) =>
        applications.push({ id: item.getId(), name: item.getName() }),
      );
      if (
        applications.length >= response.getTotalCount() ||
        page.length < pageSize
      )
        break;
    }

    const catalog: ILorawanDeviceCatalogItem[] = [];
    for (const application of applications) {
      for (let offset = 0; ; offset += pageSize) {
        const request = new ListDevicesRequest();
        request.setApplicationId(application.id);
        request.setLimit(pageSize);
        request.setOffset(offset);
        const response: any = await this.unary((callback) =>
          this.deviceClient.list(request, this.metadata(), callback as any),
        );
        const page = response.getResultList();
        for (const item of page) {
          const lastSeen = item.getLastSeenAt?.();
          catalog.push({
            devEUI: item.getDevEui(),
            name: item.getName(),
            description: item.getDescription(),
            tenantID: CHIRPSTACK_TENANT_ID || undefined,
            applicationID: application.id,
            applicationName: application.name,
            deviceProfileID: item.getDeviceProfileId(),
            deviceProfileName: item.getDeviceProfileName(),
            lastSeenAt: lastSeen?.toDate?.().toISOString(),
          });
        }
        if (
          offset + page.length >= response.getTotalCount() ||
          page.length < pageSize
        )
          break;
      }
    }
    return catalog;
  }
}
