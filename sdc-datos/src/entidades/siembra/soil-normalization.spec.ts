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
      simularHuellaHidrica: jest.fn().mockReturnValue({ huella: {} }),
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
      {
        deleteBySowing: jest.fn(),
        getActiveGeneration: jest.fn().mockResolvedValue({
          data: [
            {
              fecha: '2026-05-05',
              esPronostico: false,
              fuente: 'open_meteo',
              metricas: { precipitationMm: 1, et0Mm: 2 },
            },
          ],
        }),
      } as any,
      { deleteByIdSiembra: jest.fn() } as any,
      alertas as any,
    );

    await service.cosechar('sowing-1', {
      fechaCosecha: '2026-11-10',
      rendimientoObtenidoKgHa: 1100,
      humedadCosecha: 10,
    } as any);

    expect(algoritmos.simularHuellaHidrica).toHaveBeenCalledWith(
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

  it('cierra la cosecha y guarda huella incompleta cuando faltan entradas secundarias', async () => {
    const siembra = {
      _id: 'sowing-incomplete',
      idLote: 'lot-incomplete',
      fechaSiembra: '2026-05-05',
      semilla: { cultivo: 'Trigo' },
    };
    const repository = {
      getById: jest.fn().mockResolvedValue(siembra),
      update: jest.fn().mockImplementation((_id, data) => ({ ...siembra, ...data })),
    };
    const lotes = {
      getById: jest.fn().mockResolvedValue({ _id: 'lot-incomplete' }),
      update: jest.fn().mockRejectedValue(new Error('resumen de lote no disponible')),
    };
    const seguimiento = {
      estado: 'seguimiento',
      periodo: { diasClima: 1, diasDesdeSiembra: 1, diasCiclo: 120, avanceCiclo: 1 },
      progreso: {
        verde: { mm: 1, litrosHa: 10000, litrosKg: 10, porcentaje: 10, detalle: '' },
        azul: { mm: 0, litrosHa: 0, litrosKg: 0, porcentaje: 0, detalle: '' },
        gris: { litrosHa: 0, litrosKg: 0, aplicaciones: 0, porcentaje: 0, detalle: '' },
        total: { litrosHa: 10000, litrosKg: 10, porcentaje: 10, detalle: '' },
      },
      inputs: { fertilizaciones: 0, fumigaciones: 0, climaDisponible: true },
      parciales: { lluviaTotalMm: 1 },
      calidad: { nivel: 'baja', score: 35, observaciones: ['Faltan datos'] },
      metodologia: { version: 'test', enfoque: 'seguimiento', limites: [] },
      faltantes: [
        { campo: 'labranza', accion: 'Completar labranza', bloque: 'siembra' },
      ],
      trazas: [],
    };
    const algoritmos = {
      calcularHumedadSeca: jest.fn().mockReturnValue(1000),
      simularHuellaHidrica: jest.fn().mockImplementation(() => {
        throw new Error('faltan entradas de manejo');
      }),
      calcularHuellaHidricaReal: jest.fn(),
      simularSeguimientoHuellaHidrica: jest.fn().mockReturnValue(seguimiento),
      calcularSeguimientoHuellaHidrica: jest.fn().mockResolvedValue(seguimiento),
    };
    const service = new SiembrasService(
      repository as any,
      lotes as any,
      { getFilter: jest.fn().mockRejectedValue(new Error('sin fertilizacion')) } as any,
      { getFilter: jest.fn().mockResolvedValue({ datos: [] }) } as any,
      algoritmos as any,
      { getForLot: jest.fn().mockResolvedValue(null) } as any,
      {
        getActiveGeneration: jest.fn().mockResolvedValue({
          data: [
            {
              fecha: '2026-05-05',
              esPronostico: false,
              fuente: 'sensor_lorawan',
              metricas: { precipitationMm: 1, et0Mm: 2 },
            },
          ],
        }),
      } as any,
      { deleteByIdSiembra: jest.fn() } as any,
      { finalizarTodasPorSiembra: jest.fn().mockRejectedValue(new Error('alertas no disponibles')) } as any,
    );

    await expect(
      service.cosechar('sowing-incomplete', {
        fechaCosecha: '2026-07-20',
        rendimientoObtenidoKgHa: 1100,
        humedadCosecha: 10,
      } as any),
    ).resolves.toEqual(expect.objectContaining({ activa: false }));

    expect(repository.update).toHaveBeenCalledWith(
      'sowing-incomplete',
      expect.objectContaining({
        activa: false,
        huellaHidrica: expect.objectContaining({
          estado: 'incompleta',
          faltantes: [expect.objectContaining({ campo: 'labranza' })],
        }),
      }),
    );
    expect(algoritmos.calcularHuellaHidricaReal).not.toHaveBeenCalled();
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
