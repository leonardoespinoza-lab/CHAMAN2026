import { BadRequestException } from '@nestjs/common';
import { SiembrasService } from './service';

describe('SiembrasService - limite de escritura fenologica', () => {
  const createSubject = () => {
    const repository = {
      getFilter: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(async (data) => data),
      update: jest.fn(async (_id, data) => data),
      appendPhenologyRecord: jest.fn(async (_id, record) => ({
        _id,
        registrosFenologicos: [record],
      })),
      delete: jest.fn(),
    };
    const lotesService = {
      getById: jest.fn(),
      update: jest.fn(async (_id, data) => data),
    };
    const fertilizacionsService = {
      getFilter: jest.fn(async () => ({ datos: [] })),
    };
    const fumigacionsService = {
      getFilter: jest.fn(async () => ({ datos: [] })),
    };
    const algoritmosService = {
      calcularHumedadSeca: jest.fn(() => 9000),
      simularHuellaHidrica: jest.fn(() => ({ huella: {} })),
      simularSeguimientoHuellaHidrica: jest.fn(() => ({
        estado: 'seguimiento',
        periodo: { diasClima: 0, diasDesdeSiembra: 0, diasCiclo: 1, avanceCiclo: 0 },
        progreso: {
          verde: { mm: 0, litrosHa: 0, porcentaje: 0, detalle: '' },
          azul: { mm: 0, litrosHa: 0, porcentaje: 0, detalle: '' },
          gris: { litrosHa: 0, aplicaciones: 0, porcentaje: 0, detalle: '' },
          total: { litrosHa: 0, porcentaje: 0, detalle: '' },
        },
        inputs: { fertilizaciones: 0, fumigaciones: 0, climaDisponible: false },
        parciales: {},
        calidad: { nivel: 'baja', score: 0, observaciones: [] },
        metodologia: { version: 'test', enfoque: 'seguimiento' },
        faltantes: [],
        trazas: [],
      })),
      calcularSeguimientoHuellaHidrica: jest.fn(),
      calcularPrediccionMalezas: jest.fn(),
    };
    const soilInputsService = {
      getForLot: jest.fn(async () => null),
    };
    const indicatorsService = {
      deleteBySowing: jest.fn(),
      getActiveGeneration: jest.fn(async () => ({ data: [] })),
    };
    return {
      service: new SiembrasService(
        repository as any,
        lotesService as any,
        fertilizacionsService as any,
        fumigacionsService as any,
        algoritmosService as any,
        soilInputsService as any,
        indicatorsService as any,
        { deleteByIdSiembra: jest.fn() } as any,
        { finalizarTodasPorSiembra: jest.fn() } as any,
      ),
      repository,
      lotesService,
    };
  };

  it('descarta el historial crudo en altas y ediciones genericas', async () => {
    const { service, repository } = createSubject();
    const rawHistory = [
      {
        id: 'inyectado',
        tipoEvento: 'biofix',
        etapa: 'Brotacion',
        fechaInicioEtapa: '2026-07-02',
      },
    ];

    await service.create({
      idLote: 'lote-1',
      registrosFenologicos: rawHistory,
    } as any);
    await service.update('siembra-1', {
      idLote: 'lote-1',
      registrosFenologicos: rawHistory,
    } as any);

    expect(repository.create.mock.calls[0][0]).not.toHaveProperty(
      'registrosFenologicos',
    );
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
      'registrosFenologicos',
    );
  });

  it.each([
    { 'registrosFenologicos.0': { id: 'inyectado' } },
    { $set: { registrosFenologicos: [{ id: 'inyectado' }] } },
    { datos: { '$set.registrosFenologicos': [] } },
  ])('rechaza claves Mongo capaces de eludir el limite: %p', async (payload) => {
    const { service, repository } = createSubject();

    await expect(
      service.update('siembra-1', payload as any),
    ).rejects.toThrow(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rechaza un biofix sin objetivos en el limite comun de datos', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      _id: 'siembra-1',
      registrosFenologicos: [],
    });

    await expect(
      service.appendPhenologyRecord('siembra-1', {
        id: 'biofix-1',
        tipoEvento: 'biofix',
        etapa: 'Brotacion',
        fechaInicioEtapa: '2026-07-02',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.appendPhenologyRecord).not.toHaveBeenCalled();
  });

  it('agrega un evento validado de forma atomica y deduplica objetivos', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      _id: 'siembra-1',
      registrosFenologicos: [],
    });

    await service.appendPhenologyRecord('siembra-1', {
      id: 'biofix-1',
      tipoEvento: 'biofix',
      etapa: 'Brotacion',
      fechaInicioEtapa: '2026-07-02',
      objetivosBiofix: ['inicio_forzado', 'inicio_forzado'],
    });

    expect(repository.appendPhenologyRecord).toHaveBeenCalledWith(
      'siembra-1',
      expect.objectContaining({
        objetivosBiofix: ['inicio_forzado'],
      }),
    );
  });

  it('no permite duplicar ids ni corregir un evento inexistente', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      _id: 'siembra-1',
      registrosFenologicos: [
        {
          id: 'existente',
          tipoEvento: 'inicio_etapa',
          etapa: 'Emergencia',
          fechaInicioEtapa: '2026-07-01',
        },
      ],
    });

    await expect(
      service.appendPhenologyRecord('siembra-1', {
        id: 'existente',
        tipoEvento: 'inicio_etapa',
        etapa: 'Emergencia',
        fechaInicioEtapa: '2026-07-01',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.appendPhenologyRecord('siembra-1', {
        id: 'correccion-1',
        tipoEvento: 'correccion',
        etapa: 'Emergencia',
        fechaInicioEtapa: '2026-07-02',
        reemplazaRegistroId: 'ausente',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('no permite una segunda correccion del mismo registro', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      _id: 'siembra-1',
      registrosFenologicos: [
        {
          id: 'original',
          tipoEvento: 'inicio_etapa',
          etapa: 'Emergencia',
          fechaInicioEtapa: '2026-07-01',
        },
        {
          id: 'correccion-existente',
          tipoEvento: 'correccion',
          etapa: 'Emergencia',
          fechaInicioEtapa: '2026-07-02',
          reemplazaRegistroId: 'original',
        },
      ],
    });

    await expect(
      service.appendPhenologyRecord('siembra-1', {
        id: 'segunda-correccion',
        tipoEvento: 'correccion',
        etapa: 'Emergencia',
        fechaInicioEtapa: '2026-07-03',
        reemplazaRegistroId: 'original',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.appendPhenologyRecord).not.toHaveBeenCalled();
  });

  it('la cosecha tampoco puede reemplazar el historial fenologico', async () => {
    const { service, repository, lotesService } = createSubject();
    repository.getById.mockResolvedValue({
      _id: 'siembra-1',
      idLote: 'lote-1',
      fechaSiembra: '2026-05-01',
      registrosFenologicos: [{ id: 'existente' }],
    });
    lotesService.getById.mockResolvedValue({
      _id: 'lote-1',
      suelos: [],
    });

    await service.cosechar('siembra-1', {
      fechaCosecha: '2026-07-16',
      rendimientoObtenidoKgHa: 10000,
      humedadCosecha: 10,
      registrosFenologicos: [],
    } as any);

    expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
      'registrosFenologicos',
    );
  });
});
