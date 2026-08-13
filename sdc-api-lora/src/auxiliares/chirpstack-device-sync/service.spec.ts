jest.mock('../../env', () => ({
  API_DATOS: 'http://datos.test',
  CHIRPSTACK_API_TOKEN: 'test-chirpstack-token',
  CHIRPSTACK_DEVICE_SYNC_ENABLED: true,
  CHIRPSTACK_DEVICE_SYNC_INTERVAL_MS: 300_000,
  CHIRPSTACK_DEVICE_SYNC_STARTUP_DELAY_MS: 30_000,
  CHIRPSTACK_GRPC_ADDRESS: 'localhost:8080',
  CHIRPSTACK_TENANT_ID: '',
  LORAWAN_CATALOG_INTERNAL_TOKEN: 'test-internal-token',
}));

import { ChirpstackDeviceSyncService } from './service';

describe('ChirpstackDeviceSyncService', () => {
  it('sincroniza solo metadatos y autentica el limite interno de Chaman', async () => {
    const post = jest.fn().mockResolvedValue({ total: 1 });
    const service = new ChirpstackDeviceSyncService({ POST: post } as any);
    const item = {
      devEUI: '24E124454E358347',
      name: 'Controlador Arturo',
      description: 'UC511',
      applicationID: 'app-1',
      applicationName: 'Sensores de campo',
      deviceProfileID: 'profile-1',
      deviceProfileName: 'Milesight UC511 AU915',
      lastSeenAt: '2026-08-13T12:00:00.000Z',
    };
    jest.spyOn(service as any, 'readCatalog').mockResolvedValue([item]);

    await service.sync();

    expect(post).toHaveBeenCalledWith(
      'http://datos.test/dispositivos/lorawan-catalog/sync',
      { items: [item] },
      {
        headers: {
          'x-chaman-internal-token': 'test-internal-token',
        },
      },
    );
    const serialized = JSON.stringify(post.mock.calls[0]);
    expect(serialized).not.toMatch(/appKey|nwkKey|sessionKey/i);

    service.onModuleDestroy();
  });

  it('evita ejecuciones superpuestas', async () => {
    const post = jest.fn();
    const service = new ChirpstackDeviceSyncService({ POST: post } as any);
    (service as any).running = true;

    await service.sync();

    expect(post).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
