import { SemillasService } from './service';
import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  IImportacionCatalogoCultivosRequest,
  IResultadoImportacionCatalogoCultivos,
} from 'modelos/src';

describe('SemillasService - decision pipeline durable', () => {
  function setup() {
    const repository = {
      update: jest.fn(async (_id, data) => ({ _id: 'semilla-1', ...data })),
      importar: jest.fn(),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueForSeed: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    return {
      repository,
      queue,
      service: new SemillasService(repository as any, queue as any),
    };
  }

  function request(
    modo: IImportacionCatalogoCultivosRequest['modo'],
  ): IImportacionCatalogoCultivosRequest {
    return {
      formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
      modo,
      planHash: modo === 'confirmar' ? 'plan-abc' : undefined,
      filas: [],
    };
  }

  function result(
    modo: IResultadoImportacionCatalogoCultivos['modo'],
    overrides: Partial<IResultadoImportacionCatalogoCultivos> = {},
  ): IResultadoImportacionCatalogoCultivos {
    return {
      formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
      modo,
      planHash: 'plan-abc',
      altas: 0,
      actualizaciones: 0,
      sinCambios: 0,
      errores: [],
      cambios: [],
      ...overrides,
    };
  }

  it('encola sanidad completa cuando cambia resistencia', async () => {
    const { service, repository, queue } = setup();

    await service.update('semilla-1', {
      resistencia: [{ enfermedad: 'Roya', tipo: 'MS' }] as any,
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(queue.enqueueForSeed).toHaveBeenCalledWith('semilla-1', {
      trigger: 'semilla.science-updated',
      changedFields: ['resistencia'],
      sincronizarClima: false,
    });
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });

  it('no recalcula por cambios editoriales sin efecto cientifico', async () => {
    const { service, queue } = setup();

    await service.update('semilla-1', { observaciones: 'Texto editorial' });

    expect(queue.enqueueForSeed).not.toHaveBeenCalled();
  });

  it('propaga una falla solo cuando cola y recuperacion sincronica fallan', async () => {
    const { service, queue } = setup();
    queue.enqueueForSeed.mockRejectedValueOnce(new Error('Redis caido'));

    await expect(
      service.update('semilla-1', { sensibilidadHelada: {} }),
    ).rejects.toThrow('Redis caido');
  });

  it('encola una sola recomputacion por semilla actualizada al confirmar', async () => {
    const { service, repository, queue } = setup();
    const body = request('confirmar');
    const imported = result('confirmar', {
      altas: 1,
      actualizaciones: 2,
      sinCambios: 3,
      idsCreados: ['semilla-nueva'],
      idsActualizados: ['semilla-2', 'semilla-1', 'semilla-2'],
    });
    repository.importar.mockResolvedValue(imported);

    await expect(service.importar(body)).resolves.toBe(imported);

    expect(repository.importar).toHaveBeenCalledTimes(1);
    expect(repository.importar).toHaveBeenCalledWith(body);
    expect(queue.enqueueForSeed).toHaveBeenCalledTimes(2);
    expect(queue.enqueueForSeed).toHaveBeenNthCalledWith(1, 'semilla-2', {
      trigger: 'semilla.science-updated',
      changedFields: ['resistencia'],
      sincronizarClima: false,
      operationId: 'plan-abc/semilla-2',
    });
    expect(queue.enqueueForSeed).toHaveBeenNthCalledWith(2, 'semilla-1', {
      trigger: 'semilla.science-updated',
      changedFields: ['resistencia'],
      sincronizarClima: false,
      operationId: 'plan-abc/semilla-1',
    });
  });

  it('no encola altas, filas sin cambios ni previsualizaciones', async () => {
    const { service, repository, queue } = setup();
    repository.importar
      .mockResolvedValueOnce(
        result('confirmar', {
          altas: 2,
          sinCambios: 4,
          idsCreados: ['semilla-nueva-1', 'semilla-nueva-2'],
          idsActualizados: [],
        }),
      )
      .mockResolvedValueOnce(
        result('previsualizar', {
          actualizaciones: 1,
          idsActualizados: ['no-debe-encolar'],
        }),
      );

    await service.importar(request('confirmar'));
    await service.importar(request('previsualizar'));

    expect(queue.enqueueForSeed).not.toHaveBeenCalled();
    expect(repository.reprocesarAgrometeorologia).not.toHaveBeenCalled();
  });
});
