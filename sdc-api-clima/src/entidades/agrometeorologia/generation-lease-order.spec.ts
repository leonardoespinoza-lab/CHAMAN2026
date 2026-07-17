import { AgrometeorologicalEngineService } from './agrometeorological-engine.service';

describe('AgrometeorologicalEngineService - lease antes del snapshot', () => {
  function subject() {
    let liberarPrimeraLectura!: () => void;
    let indicarPrimeraLectura!: () => void;
    const primeraLectura = new Promise<void>((resolve) => {
      liberarPrimeraLectura = resolve;
    });
    const primeraLecturaIniciada = new Promise<void>((resolve) => {
      indicarPrimeraLectura = resolve;
    });
    let lecturas = 0;
    const repository = {
      acquireIndicadoresGenerationLease: jest.fn().mockResolvedValue({
        leaseUntil: '2026-07-16T13:00:00.000Z',
      }),
      releaseIndicadoresGenerationLease: jest
        .fn()
        .mockResolvedValue(undefined),
      getSiembra: jest.fn(async () => {
        lecturas += 1;
        if (lecturas === 1) {
          indicarPrimeraLectura();
          await primeraLectura;
        }
        return {
          _id: 'siembra-1',
          idLote: 'lote-1',
          idEstablecimiento: 'establecimiento-1',
          fechaSiembra: '2026-07-16T00:00:00.000Z',
          semilla: { cultivo: 'Trigo' },
        };
      }),
      getLote: jest.fn().mockResolvedValue({
        _id: 'lote-1',
        idEstablecimiento: 'establecimiento-1',
        ubicacion: { centro: { lat: -39, lng: -68 } },
      }),
      getEstablecimiento: jest.fn().mockResolvedValue({
        _id: 'establecimiento-1',
      }),
      getObservaciones: jest.fn().mockResolvedValue({ datos: [] }),
      getSoilAgronomicInputs: jest.fn().mockResolvedValue(null),
      replaceIndicadoresGeneration: jest.fn().mockResolvedValue({
        generationId: 'generation',
      }),
    };
    const engine = new AgrometeorologicalEngineService(
      repository as any,
      {} as any,
    );
    jest.spyOn(engine, 'calculateIndicators').mockReturnValue([
      {
        idSiembra: 'siembra-1',
        fecha: '2026-07-16',
        advertencias: [],
      } as any,
    ]);
    return {
      engine,
      repository,
      liberarPrimeraLectura,
      primeraLecturaIniciada,
    };
  }

  it('adquiere el lease antes de leer y serializa dos reprocesos de la misma siembra', async () => {
    const {
      engine,
      repository,
      liberarPrimeraLectura,
      primeraLecturaIniciada,
    } = subject();

    const primero = engine.procesarSiembra('siembra-1', {
      sincronizarClima: false,
    });
    await primeraLecturaIniciada;
    const segundo = engine.procesarSiembra('siembra-1', {
      sincronizarClima: false,
    });

    expect(
      repository.acquireIndicadoresGenerationLease.mock
        .invocationCallOrder[0],
    ).toBeLessThan(repository.getSiembra.mock.invocationCallOrder[0]);
    expect(repository.acquireIndicadoresGenerationLease).toHaveBeenCalledTimes(
      1,
    );

    liberarPrimeraLectura();
    await Promise.all([primero, segundo]);

    expect(repository.getSiembra).toHaveBeenCalledTimes(2);
    expect(repository.acquireIndicadoresGenerationLease).toHaveBeenCalledTimes(
      2,
    );
    expect(
      repository.releaseIndicadoresGenerationLease.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      repository.acquireIndicadoresGenerationLease.mock
        .invocationCallOrder[1],
    );
  });
});
