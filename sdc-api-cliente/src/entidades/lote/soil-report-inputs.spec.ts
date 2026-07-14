import { LotesService } from './service';

describe('LotesService - suelo canonico en informe agronomico', () => {
  const createService = (repository: any) =>
    new LotesService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

  it('proyecta entradas canonicas sobre una copia del lote', async () => {
    const repository = {
      getSoilAgronomicInputs: jest.fn().mockResolvedValue({
        loteId: 'lote-1',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test-v1',
        selectionReason: 'automatic_assessment',
        operationalTexture: 'Franco limoso',
        fieldCapacityPercentage: 32,
        wiltingPointPercentage: 15,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 30,
            texture: 'Franco limoso',
            fieldCapacityPercentage: 32,
            wiltingPointPercentage: 15,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      }),
    };
    const service = createService(repository);
    const original = {
      _id: 'lote-1',
      capacidadDeCampo: 20,
      puntoMarchitez: 9,
      suelos: [],
    };

    const resolved = await service.resolveLotWithSoilInputs(original);

    expect(resolved).toMatchObject({
      capacidadDeCampo: 32,
      puntoMarchitez: 15,
      texturaLixiviacion: 'Franco limoso',
      texturaEscorrentia: 'Franco limoso',
    });
    expect(resolved.suelos).toHaveLength(1);
    expect(original).toEqual({
      _id: 'lote-1',
      capacidadDeCampo: 20,
      puntoMarchitez: 9,
      suelos: [],
    });
  });

  it('mantiene una copia del perfil legado si el contrato no esta disponible', async () => {
    const repository = {
      getSoilAgronomicInputs: jest
        .fn()
        .mockRejectedValue(new Error('servicio temporalmente no disponible')),
    };
    const service = createService(repository);
    const original = {
      _id: 'lote-1',
      capacidadDeCampo: 30,
      puntoMarchitez: 12,
      suelos: [{ profundidad: 30, textura: 'Franco' }],
    };

    const resolved = await service.resolveLotWithSoilInputs(original);

    expect(resolved).toEqual(original);
    expect(resolved).not.toBe(original);
    expect(resolved.suelos[0]).not.toBe(original.suelos[0]);
  });
});
