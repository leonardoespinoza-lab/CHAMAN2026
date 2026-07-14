import { AgrometeorologiaBatchService } from './batch.service';

describe('AgrometeorologiaBatchService', () => {
  it('descarga una sola serie meteorologica por establecimiento y procesa todas sus siembras', async () => {
    const establishment = {
      _id: '64b000000000000000000003',
      ubicacion: [{ centro: { lat: -33, lng: -61.9 } }],
    };
    const repository = {
      getSiembras: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: '64b000000000000000000001',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2026-05-10',
            establecimiento: establishment,
          },
          {
            _id: '64b000000000000000000002',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2026-04-20',
            establecimiento: establishment,
          },
        ],
      }),
      getEstablecimiento: jest.fn(),
    };
    const ingestion = { sincronizar: jest.fn().mockResolvedValue({}) };
    const engine = {
      resolveCycleStart: jest.fn((item) => item.fechaSiembra),
      procesarSiembra: jest
        .fn()
        .mockResolvedValue({ indicadores: 1, advertencias: [] }),
    };
    const batch = new AgrometeorologiaBatchService(
      repository as any,
      ingestion as any,
      engine as any,
    );

    const result = await batch.procesarActivas();
    expect(result).toEqual({
      siembras: 2,
      procesadas: 2,
      fallidas: 0,
      establecimientos: 1,
    });
    expect(ingestion.sincronizar).toHaveBeenCalledTimes(1);
    expect(ingestion.sincronizar.mock.calls[0][2]).toBe('2026-04-20');
    expect(engine.resolveCycleStart).toHaveBeenCalledTimes(2);
    expect(engine.procesarSiembra).toHaveBeenCalledTimes(2);
    expect(engine.procesarSiembra).toHaveBeenCalledWith(expect.any(String), {
      sincronizarClima: false,
    });
  });

  it('descarga solo la campaña vigente para implantaciones perennes historicas', async () => {
    const establishment = {
      _id: '64b000000000000000000003',
      ubicacion: [{ centro: { lat: -33, lng: -61.9 } }],
    };
    const repository = {
      getSiembras: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: '64b000000000000000000001',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2020-08-15',
            establecimiento: establishment,
            semilla: { cultivo: 'Manzano' },
          },
          {
            _id: '64b000000000000000000002',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2024-09-01',
            establecimiento: establishment,
            semilla: { cultivo: 'Pecan' },
          },
        ],
      }),
      getEstablecimiento: jest.fn(),
    };
    const ingestion = { sincronizar: jest.fn().mockResolvedValue({}) };
    const engine = {
      resolveCycleStart: jest.fn().mockReturnValue('2026-07-01'),
      procesarSiembra: jest
        .fn()
        .mockResolvedValue({ indicadores: 1, advertencias: [] }),
    };
    const batch = new AgrometeorologiaBatchService(
      repository as any,
      ingestion as any,
      engine as any,
    );

    const result = await batch.procesarActivas();

    expect(result.fallidas).toBe(0);
    expect(ingestion.sincronizar).toHaveBeenCalledWith(
      establishment,
      { lat: -33, lng: -61.9 },
      '2026-07-01',
      false,
    );
  });
});
