import { DispositivosRepository } from './repository';

describe('DispositivosRepository - inventario ChirpStack', () => {
  it('crea por DevEUI sin inventar asignaciones ni credenciales', async () => {
    const model: any = {
      findOne: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockImplementation(async (value) => value),
      updateOne: jest.fn(),
    };
    const repository = new DispositivosRepository(model);

    const result = await repository.syncFromLorawanCatalog([
      {
        devEUI: 'aabbccddeeff0011',
        name: 'Controlador Arturo UC511',
        applicationID: 'app-1',
        applicationName: 'Campo Arturo',
        deviceProfileID: 'profile-1',
      },
    ]);

    expect(result).toEqual({ total: 1, created: 1, updated: 0, unchanged: 0 });
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deveui: 'AABBCCDDEEFF0011',
        nombre: 'Controlador Arturo UC511',
        tipo: 'Sensor de Humedad de Suelo',
        servicios: expect.arrayContaining([
          expect.objectContaining({ id: 'perfil-suelo-sentek' }),
          expect.objectContaining({ id: 'nivel-napa' }),
        ]),
        metadata: expect.objectContaining({
          origenInventario: 'ChirpStack',
          chirpstackApplicationID: 'app-1',
        }),
      }),
    );
    const created = model.create.mock.calls[0][0];
    expect(created.idLote).toBeUndefined();
    expect(created.idProductor).toBeUndefined();
    expect(JSON.stringify(created).toLowerCase()).not.toContain('appkey');
  });

  it('preserva nombre y asignacion existentes al refrescar metadatos', async () => {
    const existing = {
      _id: 'device-1',
      deveui: 'AABBCCDDEEFF0011',
      nombre: 'Nombre auditado en Chaman',
      idLote: 'lote-1',
      idProductor: 'productor-1',
      metadata: { nota: 'conservar' },
    };
    const model: any = {
      findOne: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) }),
      create: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const repository = new DispositivosRepository(model);

    const result = await repository.syncFromLorawanCatalog([
      {
        devEUI: existing.deveui,
        name: 'Nombre cambiado en ChirpStack',
        applicationID: 'app-2',
      },
    ]);

    expect(result.updated).toBe(1);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: existing._id },
      {
        $set: {
          metadata: expect.objectContaining({
            nota: 'conservar',
            chirpstackApplicationID: 'app-2',
          }),
        },
      },
    );
    const update = model.updateOne.mock.calls[0][1].$set;
    expect(update.nombre).toBeUndefined();
    expect(update.idLote).toBeUndefined();
    expect(update.idProductor).toBeUndefined();
  });
});
