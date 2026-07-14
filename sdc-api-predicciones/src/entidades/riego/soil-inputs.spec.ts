import { RiegoService } from './service';
import { LotesService } from '../lote/service';
import { calcularRiegoV12 } from './riego-v12.engine';

describe('RiegoService - entradas agronomicas de suelo', () => {
  const createRiegoService = (lotesService: any) =>
    new RiegoService(
      {} as any,
      {} as any,
      lotesService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

  it('aplica el perfil canonico sobre una copia antes de ejecutar riego', async () => {
    const lotesService = {
      getSoilAgronomicInputs: jest.fn().mockResolvedValue({
        loteId: 'lote-1',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        operationalTexture: 'Franco limoso',
        fieldCapacityPercentage: 31,
        wiltingPointPercentage: 15,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 30,
            texture: 'Franco limoso',
            fieldCapacityPercentage: 31,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      }),
    };
    const service = createRiegoService(lotesService);
    const original = {
      _id: 'lote-1',
      capacidadDeCampo: 20,
      puntoMarchitez: 8,
      suelos: [{ profundidad: 10, hayRaices: true }],
    } as any;

    const resolved = await service.resolverLoteConEntradasAgronomicas(original);

    expect(resolved).not.toBe(original);
    expect(resolved).toMatchObject({
      capacidadDeCampo: 31,
      puntoMarchitez: 15,
      texturaLixiviacion: 'Franco limoso',
      texturaEscorrentia: 'Franco limoso',
    });
    expect(resolved.suelos[0]).toMatchObject({
      profundidad: 30,
      capacidadDeCampo: 31,
      puntoMarchitez: 15,
      hayRaices: true,
    });
    expect(original).toEqual({
      _id: 'lote-1',
      capacidadDeCampo: 20,
      puntoMarchitez: 8,
      suelos: [{ profundidad: 10, hayRaices: true }],
    });
  });

  it('conserva el perfil legado si el servicio canonico falla', async () => {
    const lotesService = {
      getSoilAgronomicInputs: jest
        .fn()
        .mockRejectedValue(new Error('datos no disponible')),
    };
    const service = createRiegoService(lotesService);
    const original = {
      _id: 'lote-1',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      suelos: [{ profundidad: 30, textura: 'Franco' }],
    } as any;

    const resolved = await service.resolverLoteConEntradasAgronomicas(original);

    expect(resolved).toEqual(original);
    expect(resolved).not.toBe(original);
    expect(resolved.suelos[0]).not.toBe(original.suelos[0]);
  });

  it('no persiste como sensor una capacidad canonica o manual usada en memoria', () => {
    const service = createRiegoService({});
    const [layer] = service.actualizarSueloConRiegoV12(
      [
        {
          numeroDeSensor: 1,
          profundidad: 30,
          capacidadDeCampo: 20,
          puntoMarchitez: 8,
        },
      ],
      [
        {
          numeroDeSensor: 1,
          profundidad: 30,
          capacidadCampo: 31,
          puntoMarchitez: 15,
          fuenteCapacidadCampo: 'manual',
          hayRaices: true,
        },
      ],
    );

    expect(layer).toMatchObject({
      capacidadDeCampo: 20,
      puntoMarchitez: 8,
      hayRaices: true,
    });
  });

  it('persiste solamente la capacidad calibrada por lecturas del sensor', () => {
    const service = createRiegoService({});
    const [layer] = service.actualizarSueloConRiegoV12(
      [
        {
          numeroDeSensor: 1,
          profundidad: 30,
          capacidadDeCampo: 20,
          puntoMarchitez: 8,
        },
      ],
      [
        {
          numeroDeSensor: 1,
          profundidad: 30,
          capacidadCampo: 29,
          puntoMarchitez: 15,
          fuenteCapacidadCampo: 'auto',
        },
      ],
    );

    expect(layer).toMatchObject({
      capacidadDeCampo: 29,
      puntoMarchitez: 8,
    });
  });

  it('una deteccion de raices no crea propiedades hidraulicas vacias', () => {
    const service = createRiegoService({});
    const [layer] = service.actualizarSueloConRiegoV12(
      [],
      [
        {
          numeroDeSensor: 1,
          profundidad: 30,
          capacidadCampo: 31,
          puntoMarchitez: 15,
          fuenteCapacidadCampo: 'manual',
          hayRaices: true,
        },
      ],
    );

    expect(layer).toMatchObject({
      numeroDeSensor: 1,
      profundidad: 30,
      hayRaices: true,
    });
    expect(layer).not.toHaveProperty('capacidadDeCampo');
    expect(layer).not.toHaveProperty('puntoMarchitez');
  });

  it('no reduce varios canales a una capa cartografica sin mapeo de sensor', () => {
    const service = createRiegoService({});
    const lotePersistido = {
      _id: 'lote-1',
      sueloProcedencia: 'soilgrids',
      sueloConfirmadoPorUsuario: false,
      suelos: [{ profundidad: 30, textura: 'Franco' }],
    } as any;
    const loteCanonico = {
      ...lotePersistido,
      capacidadDeCampo: 31,
      puntoMarchitez: 15,
      suelos: [
        {
          profundidad: 30,
          textura: 'Franco',
          capacidadDeCampo: 31,
          puntoMarchitez: 15,
        },
      ],
    } as any;
    const persistidosConSensor =
      service.getSuelosPersistidosConMapeoSensor(lotePersistido);
    const sueloParaV12 = service.getSuelosParaRiegoV12(
      loteCanonico,
      persistidosConSensor,
    );

    expect(sueloParaV12).toEqual([]);

    const resultado = calcularRiegoV12({
      siembra: { fechaSiembra: '2026-05-05' } as any,
      lote: loteCanonico,
      cultivo: 'Trigo',
      crono: undefined as any,
      suelo: sueloParaV12,
      humedadSuelo: [
        {
          fecha: '2026-07-14T00:00:00.000Z',
          humedadSuelo: {
            1: { avg: 24 },
            2: { avg: 26 },
            3: { avg: 28 },
          },
        },
      ] as any,
      lluviaHistorica: [],
      pronostico7Dias: [
        {
          fecha: '2026-07-15',
          et0: 3,
          lluvia: 0,
          probabilidadLluvia: 0,
        },
      ] as any,
    });

    expect(resultado.nivelesLecturaSensor).toHaveLength(3);
    expect(
      resultado.nivelesLecturaSensor.map((nivel) => nivel.numeroDeSensor),
    ).toEqual([1, 2, 3]);
    expect(
      service.actualizarSueloConRiegoV12(
        persistidosConSensor,
        resultado.nivelesLecturaSensor,
      ),
    ).toHaveLength(3);
  });

  it('preserva un layout real y usa sus propiedades canonicas por profundidad', () => {
    const service = createRiegoService({});
    const lotePersistido = {
      _id: 'lote-1',
      suelos: [
        { numeroDeSensor: 1, profundidad: 10, capacidadDeCampo: 20 },
        { numeroDeSensor: 2, profundidad: 30, capacidadDeCampo: 21 },
      ],
    } as any;
    const loteCanonico = {
      ...lotePersistido,
      suelos: [
        { numeroDeSensor: 1, profundidad: 10, capacidadDeCampo: 31 },
        { numeroDeSensor: 2, profundidad: 30, capacidadDeCampo: 29 },
      ],
    } as any;
    const persistidosConSensor =
      service.getSuelosPersistidosConMapeoSensor(lotePersistido);

    expect(
      service.getSuelosParaRiegoV12(loteCanonico, persistidosConSensor),
    ).toEqual(loteCanonico.suelos);
  });

  it('no elimina capas no mapeadas al persistir una sonda existente', () => {
    const service = createRiegoService({});
    const lotePersistido = {
      _id: 'lote-1',
      suelos: [
        { numeroDeSensor: 1, profundidad: 10, hayRaices: false },
        { profundidad: 80, textura: 'Arcilloso' },
      ],
    } as any;
    const persistidosConSensor =
      service.getSuelosPersistidosConMapeoSensor(lotePersistido);
    const sensorActualizado = [
      { numeroDeSensor: 1, profundidad: 10, hayRaices: true },
    ];

    expect(
      service.mergeSuelosConActualizacionSensor(
        lotePersistido,
        persistidosConSensor,
        sensorActualizado,
      ),
    ).toEqual([
      { numeroDeSensor: 1, profundidad: 10, hayRaices: true },
      { profundidad: 80, textura: 'Arcilloso' },
    ]);
  });
});

describe('LotesService - carga para calibracion por sonda', () => {
  it('solicita el perfil existente para no reconstruir capas incompletas', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const service = new LotesService(repository as any);

    await service.getByIdSonda('sonda-1');

    const query = repository.get.mock.calls[0][0];
    expect(query.select).toContain('suelos');
    expect(query.select).toContain('puntoMarchitez');
    expect(query.select).toContain('sueloProcedencia');
  });
});
