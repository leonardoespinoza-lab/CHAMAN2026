import { AgrometeorologiaBatchService } from './batch.service';

describe('AgrometeorologiaBatchService', () => {
  it('descarga una sola serie meteorologica por lote y procesa todas sus siembras', async () => {
    const establishment = {
      _id: '64b000000000000000000003',
      ubicacion: [{ centro: { lat: -33, lng: -61.9 } }],
    };
    const lot = {
      _id: '64b000000000000000000010',
      idEstablecimiento: establishment._id,
      ubicacion: { centro: { lat: -33.01, lng: -61.91 } },
    };
    const repository = {
      getSiembras: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: '64b000000000000000000001',
            idEstablecimiento: establishment._id,
            idLote: lot._id,
            lote: lot,
            fechaSiembra: '2026-05-10',
            establecimiento: establishment,
          },
          {
            _id: '64b000000000000000000002',
            idEstablecimiento: establishment._id,
            idLote: lot._id,
            lote: lot,
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
    expect(ingestion.sincronizar.mock.calls[0][4]).toBe(lot._id);
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
            fechaCosecha: '2021-03-15',
            establecimiento: establishment,
            semilla: { cultivo: 'Manzano' },
          },
          {
            _id: '64b000000000000000000002',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2024-09-01',
            fechaCosecha: '2025-04-10',
            establecimiento: establishment,
            semilla: { cultivo: 'Pecan' },
          },
          {
            _id: '64b000000000000000000004',
            idEstablecimiento: establishment._id,
            fechaSiembra: '2025-05-01',
            fechaCosecha: '2025-12-10',
            establecimiento: establishment,
            semilla: { cultivo: 'Trigo' },
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
    expect(result.siembras).toBe(2);
    expect(engine.procesarSiembra).toHaveBeenCalledTimes(2);
    const filter = JSON.parse(
      repository.getSiembras.mock.calls[0][0].filter,
    );
    expect(filter).toEqual({ activa: { $ne: false } });
    expect(ingestion.sincronizar).toHaveBeenCalledWith(
      establishment,
      { lat: -33, lng: -61.9 },
      '2026-07-01',
      false,
      undefined,
    );
  });

  it('mantiene contextos Open-Meteo separados para lotes del mismo establecimiento', async () => {
    const establishment = {
      _id: '64b000000000000000000003',
      ubicacion: [{ centro: { lat: -33, lng: -61.9 } }],
    };
    const lotA = {
      _id: '64b000000000000000000010',
      idEstablecimiento: establishment._id,
      ubicacion: { centro: { lat: -33.1, lng: -61.8 } },
    };
    const lotB = {
      _id: '64b000000000000000000011',
      idEstablecimiento: establishment._id,
      ubicacion: { centro: { lat: -34.2, lng: -60.7 } },
    };
    const repository = {
      getSiembras: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: '64b000000000000000000001',
            idEstablecimiento: establishment._id,
            idLote: lotA._id,
            lote: lotA,
            fechaSiembra: '2026-05-10',
            establecimiento: establishment,
          },
          {
            _id: '64b000000000000000000002',
            idEstablecimiento: establishment._id,
            idLote: lotB._id,
            lote: lotB,
            fechaSiembra: '2026-05-11',
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

    expect(result).toMatchObject({
      siembras: 2,
      procesadas: 2,
      fallidas: 0,
      establecimientos: 1,
    });
    expect(ingestion.sincronizar).toHaveBeenCalledTimes(2);
    expect(ingestion.sincronizar).toHaveBeenCalledWith(
      establishment,
      { lat: -33.1, lng: -61.8 },
      '2026-05-10',
      false,
      lotA._id,
    );
    expect(ingestion.sincronizar).toHaveBeenCalledWith(
      establishment,
      { lat: -34.2, lng: -60.7 },
      '2026-05-11',
      false,
      lotB._id,
    );
  });
});
