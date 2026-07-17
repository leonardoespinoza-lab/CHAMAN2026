import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReporteNDVIsService } from './service';

describe('ReporteNDVIsService - limite cientifico de escritura', () => {
  const metadataValida = (coverage = 84) => ({
    renderVersion: 'fixed-index-v3',
    qualityMask: { validCoveragePct: coverage },
    indicesStats: {
      ndvi: { validCoveragePct: coverage },
    },
    renderQa: {
      ndvi: { status: 'ok', validCoveragePct: coverage },
    },
  });

  const reporteValido = () => ({
    _id: 'reporte-1',
    idLote: 'lote-1',
    indices: { ndvi: 0.42, ndmi: 0.1 },
    ndviPromedio: 0.42,
    metadataImagen: metadataValida(),
  });

  const createSubject = () => {
    const repository = {
      getFilter: jest.fn(),
      getById: jest.fn(),
      getLastByIdProductor: jest.fn(),
      getLastByIdDistribuidor: jest.fn(),
      getLastByIdLote: jest.fn(),
      getLastByScope: jest.fn().mockResolvedValue([]),
      getLast: jest.fn(),
      create: jest.fn(async (data) => data),
      update: jest.fn(async (_id, data) => data),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    };
    return {
      service: new ReporteNDVIsService(repository as any),
      repository,
    };
  };

  it('acepta un reporte v3 valido y normaliza el promedio desde indices.ndvi', async () => {
    const { service, repository } = createSubject();

    await service.create({
      idLote: 'lote-1',
      indices: { ndvi: 0.42 },
      metadataImagen: metadataValida() as any,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ndviPromedio: 0.42,
        indices: expect.objectContaining({ ndvi: 0.42 }),
      }),
    );
  });

  it('consulta ultimos reportes solamente con un alcance tenant permitido', async () => {
    const { service, repository } = createSubject();

    await service.getLastByScope('establecimiento', 'establecimiento-1');

    expect(repository.getLastByScope).toHaveBeenCalledWith(
      'establecimiento',
      'establecimiento-1',
    );
  });

  it.each([
    ['empresa', 'empresa-1'],
    ['productor', ''],
  ])('rechaza un alcance tenant NDVI invalido: %s', async (scope, id) => {
    const { service, repository } = createSubject();

    await expect(service.getLastByScope(scope, id)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.getLastByScope).not.toHaveBeenCalled();
  });

  it('normaliza de forma segura un unico promedio valido', async () => {
    const { service, repository } = createSubject();

    await service.create({
      idLote: 'lote-1',
      ndviPromedio: 0.37,
      metadataImagen: metadataValida() as any,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ndviPromedio: 0.37,
        indices: { ndvi: 0.37 },
      }),
    );
  });

  it('normaliza diferencias numericas inocuas, pero rechaza valores contradictorios', async () => {
    const { service, repository } = createSubject();

    await service.create({
      indices: { ndvi: 0.42 },
      ndviPromedio: 0.4200005,
      metadataImagen: metadataValida() as any,
    });
    expect(repository.create.mock.calls[0][0].ndviPromedio).toBe(0.42);

    await expect(
      service.create({
        indices: { ndvi: 0.42 },
        ndviPromedio: 0.52,
        metadataImagen: metadataValida() as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([NaN, Infinity, -Infinity, -1.01, 1.01, '0.42'])(
    'rechaza un NDVI no cientifico: %p',
    async (value) => {
      const { service, repository } = createSubject();

      await expect(
        service.create({
          indices: { ndvi: value as number },
          metadataImagen: metadataValida() as any,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [undefined, 'sin metadata'],
    [{}, 'sin cobertura'],
    [{ qualityMask: { validCoveragePct: 2.99 } }, 'cobertura insuficiente'],
    [{ qualityMask: { validCoveragePct: NaN } }, 'cobertura no finita'],
    [{ qualityMask: { validCoveragePct: 101 } }, 'cobertura imposible'],
  ])('rechaza QA invalida: %s (%s)', async (metadata, _caso) => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        indices: { ndvi: 0.42 },
        metadataImagen: metadata as any,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('admite cobertura QA heredada para nuevas lecturas no-v3, pero v3 exige status ok', async () => {
    const { service, repository } = createSubject();

    await service.create({
      indices: { ndvi: 0.42 },
      metadataImagen: {
        renderVersion: 'legacy-v2',
        qualityMask: { validCoveragePct: 3 },
      } as any,
    });
    expect(repository.create).toHaveBeenCalledTimes(1);

    await expect(
      service.create({
        indices: { ndvi: 0.42 },
        metadataImagen: {
          renderVersion: 'fixed-index-v3',
          qualityMask: { validCoveragePct: 90 },
        } as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['warning', 'error'])(
    'rechaza cualquier status QA explicito distinto de ok: %s',
    async (status) => {
      const { service } = createSubject();
      const metadata = metadataValida() as any;
      metadata.renderQa.ndmi = { status, validCoveragePct: 80 };

      await expect(
        service.create({
          indices: { ndvi: 0.42 },
          metadataImagen: metadata,
        }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('rechaza QA contradictoria si cualquiera de sus coberturas baja del minimo', async () => {
    const { service } = createSubject();
    const metadata = metadataValida(90);
    metadata.qualityMask.validCoveragePct = 2.99;

    await expect(
      service.create({
        indices: { ndvi: 0.42 },
        metadataImagen: metadata as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('combina el registro actual con un parche y conserva QA profunda', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue(reporteValido());

    await service.update('reporte-1', {
      coleccion: 'sentinel-2-l2a',
      metadataImagen: {
        renderStrategy: 'fixed-index-scale-quality-masked',
        renderQa: {
          ndvi: { validCoveragePct: 82 },
        },
      } as any,
    });

    expect(repository.update).toHaveBeenCalledWith(
      'reporte-1',
      expect.objectContaining({
        ndviPromedio: 0.42,
        indices: expect.objectContaining({ ndvi: 0.42, ndmi: 0.1 }),
        metadataImagen: expect.objectContaining({
          renderVersion: 'fixed-index-v3',
          qualityMask: { validCoveragePct: 84 },
          renderQa: {
            ndvi: { status: 'ok', validCoveragePct: 82 },
          },
        }),
      }),
    );
  });

  it.each([
    { metadataImagen: null },
    { metadataImagen: { renderQa: null } },
    { metadataImagen: { renderQa: { ndvi: null } } },
    { metadataImagen: { renderQa: { ndvi: { status: 'warning' } } } },
    { metadataImagen: { qualityMask: { validCoveragePct: 2.99 } } },
    { metadataImagen: { renderVersion: 'legacy-v2' } },
    { indices: null },
  ])('no permite borrar ni degradar QA en update: %p', async (patch) => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue(reporteValido());

    await expect(service.update('reporte-1', patch as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('mantiene lecturas legacy, pero no permite reescribirlas sin aportar QA', async () => {
    const { service, repository } = createSubject();
    const legacy = {
      _id: 'legacy-1',
      ndviPromedio: 0.31,
      indices: { ndvi: 0.31 },
    };
    repository.getById.mockResolvedValue(legacy);

    await expect(service.getById('legacy-1')).resolves.toEqual(legacy);
    await expect(
      service.update('legacy-1', { coleccion: 'legacy' }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('conserva la semantica NotFound de update', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue(null);

    await expect(
      service.update('ausente', { coleccion: 'sentinel-2-l2a' }),
    ).rejects.toThrow(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
