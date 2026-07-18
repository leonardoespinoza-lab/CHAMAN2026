import { SiembrasService } from './service';

describe('SiembrasService canonical soil integration', () => {
  it('calcula la huella con el suelo canonico sin persistir sus capas como manuales', async () => {
    const siembra = {
      _id: 'sowing-1',
      idLote: 'lot-1',
      fechaSiembra: '2026-05-05',
    };
    const persistedLot = {
      _id: 'lot-1',
      texturaLixiviacion: 'Franco',
      texturaEscorrentia: 'Franco',
      suelos: [
        {
          numeroDeSensor: 1,
          profundidad: 10,
          textura: 'Franco',
          capacidadDeCampo: 30,
          puntoMarchitez: 14,
          hayRaices: true,
        },
      ],
    };
    const repository = {
      getById: jest.fn().mockResolvedValue(siembra),
      update: jest.fn().mockImplementation((_id, data) => ({ ...siembra, ...data })),
    };
    const lotes = {
      getById: jest.fn().mockResolvedValue(persistedLot),
      update: jest.fn().mockResolvedValue(persistedLot),
    };
    const fertilizaciones = {
      getFilter: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const fumigaciones = {
      getFilter: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const algoritmos = {
      calcularHumedadSeca: jest.fn().mockReturnValue(1000),
      calcularHuellaHidricaReal: jest.fn().mockResolvedValue({ huella: {} }),
    };
    const soilInputs = {
      getForLot: jest.fn().mockResolvedValue({
        loteId: 'lot-1',
        status: 'ready',
        stale: false,
        selectionPolicyVersion: 'test',
        selectionReason: 'automatic_assessment',
        operationalTexture: 'Franco limoso',
        fieldCapacityPercentage: 34,
        wiltingPointPercentage: 11,
        depthLayers: [
          {
            depthFromCm: 0,
            depthToCm: 15,
            texture: 'Franco limoso',
            fieldCapacityPercentage: 34,
            wiltingPointPercentage: 11,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        provenance: {},
      }),
    };
    const alertas = {
      finalizarTodasPorSiembra: jest.fn().mockResolvedValue(2),
    };
    const service = new SiembrasService(
      repository as any,
      lotes as any,
      fertilizaciones as any,
      fumigaciones as any,
      algoritmos as any,
      soilInputs as any,
      { deleteBySowing: jest.fn() } as any,
      { deleteByIdSiembra: jest.fn() } as any,
      alertas as any,
    );

    await service.cosechar('sowing-1', {
      fechaCosecha: '2026-11-10',
      rendimientoObtenidoKgHa: 1100,
      humedadCosecha: 10,
    } as any);

    expect(algoritmos.calcularHuellaHidricaReal).toHaveBeenCalledWith(
      expect.objectContaining({
        lote: expect.objectContaining({
          texturaLixiviacion: 'Franco limoso',
          texturaEscorrentia: 'Franco limoso',
          capacidadDeCampo: 34,
          puntoMarchitez: 11,
        }),
      }),
    );
    expect(lotes.update).toHaveBeenCalledWith(
      'lot-1',
      expect.objectContaining({
        suelos: [
          expect.objectContaining({
            textura: 'Franco',
            capacidadDeCampo: 30,
            puntoMarchitez: 14,
            hayRaices: false,
          }),
        ],
      }),
    );
    expect(alertas.finalizarTodasPorSiembra).toHaveBeenCalledWith(
      'sowing-1',
      expect.stringContaining('cerrado por cosecha'),
      '2026-11-10T00:00:00.000Z',
    );
  });

  it('marca y limpia los indicadores aun cuando la siembra ya no existe', async () => {
    const repository = {
      delete: jest.fn().mockResolvedValue(null),
    };
    const indicadores = {
      deleteBySowing: jest.fn().mockResolvedValue({
        legacyDeleted: 0,
        generatedDeleted: 0,
        generationManifestsDeleted: 0,
      }),
    };
    const service = new SiembrasService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      indicadores as any,
      { deleteByIdSiembra: jest.fn().mockResolvedValue(undefined) } as any,
      { finalizarTodasPorSiembra: jest.fn() } as any,
    );

    await expect(service.delete('64b000000000000000000001')).rejects.toThrow(
      'No encontrado',
    );
    expect(indicadores.deleteBySowing).toHaveBeenCalledWith(
      '64b000000000000000000001',
    );
  });
});
