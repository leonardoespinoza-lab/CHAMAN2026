import { BadRequestException } from '@nestjs/common';
import { SiembrasService } from './service';

describe('SiembrasService - autorización de edición', () => {
  function subject(siembra: Record<string, unknown>) {
    const repository = {
      getById: jest.fn().mockResolvedValue(siembra),
      update: jest.fn().mockResolvedValue(siembra),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const prediccionsService = {
      deleteByIdSiembra: jest.fn().mockResolvedValue(undefined),
      prediccion: jest.fn().mockResolvedValue([]),
      reconstruir: jest.fn().mockResolvedValue([]),
      agroclima: jest.fn().mockResolvedValue({}),
    };
    const lotesService = {
      getById: jest.fn().mockResolvedValue({
        _id: 'lote-propio',
        idProductor: 'productor-propio',
        ubicacion: { centro: { lat: -39, lng: -68 } },
      }),
      generarNdvi: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SiembrasService(
      repository as any,
      prediccionsService as any,
      {} as any,
      {} as any,
      lotesService as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'getCrono')
      .mockResolvedValue({ _id: 'crono-1' });
    jest
      .spyOn(service as any, 'evaluarAgroclima')
      .mockResolvedValue(undefined);
    return { service, repository, lotesService, prediccionsService };
  }

  it('rechaza editar una siembra ajena aunque el payload indique un lote propio', async () => {
    const { service, repository, lotesService } = subject({
      _id: 'siembra-ajena',
      idLote: 'lote-ajeno',
      idProductor: 'productor-ajeno',
    });

    await expect(
      service.update(
        'siembra-ajena',
        { idLote: 'lote-propio' },
        {
          nivel: 'Productor',
          rol: 'Escritura',
          idProductor: 'productor-propio',
        },
      ),
    ).rejects.toThrow('No tiene permiso');

    expect(lotesService.getById).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('impide trasladar una siembra autorizada a otro lote', async () => {
    const { service, repository } = subject({
      _id: 'siembra-propia',
      idLote: 'lote-original',
      idProductor: 'productor-propio',
      semilla: {},
    });

    await expect(
      service.update(
        'siembra-propia',
        { idLote: 'otro-lote' },
        {
          nivel: 'Productor',
          rol: 'Escritura',
          idProductor: 'productor-propio',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('autoriza una siembra legacy sin tenant solo mediante su lote canonico', async () => {
    const { service, lotesService } = subject({
      _id: 'siembra-legacy',
      idLote: 'lote-propio',
    });

    await expect(
      service.getById('siembra-legacy', {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'productor-propio',
      }),
    ).resolves.toMatchObject({ _id: 'siembra-legacy' });
    expect(lotesService.getById).toHaveBeenCalledWith(
      'lote-propio',
      expect.objectContaining({ idProductor: 'productor-propio' }),
    );
  });

  it('rechaza una siembra legacy cuando tampoco se autoriza el lote canonico', async () => {
    const { service, lotesService } = subject({
      _id: 'siembra-legacy',
      idLote: 'lote-ajeno',
    });
    lotesService.getById.mockRejectedValue(new Error('lote no autorizado'));

    await expect(
      service.getById('siembra-legacy', {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'productor-ajeno',
      }),
    ).rejects.toThrow('No tiene permiso');
  });

  it('serializa dos pipelines de decision para la misma siembra', async () => {
    const { service, repository, prediccionsService } = subject({
      _id: 'siembra-propia',
      idLote: 'lote-propio',
      idProductor: 'productor-propio',
    });
    let liberarPrimero: () => void;
    let indicarInicio: () => void;
    const primero = new Promise<void>((resolve) => {
      liberarPrimero = resolve;
    });
    const iniciado = new Promise<void>((resolve) => {
      indicarInicio = resolve;
    });
    repository.reprocesarAgrometeorologia
      .mockImplementationOnce(() => {
        indicarInicio();
        return primero;
      })
      .mockResolvedValueOnce(undefined);
    const permiso = {
      nivel: 'Productor',
      rol: 'Escritura',
      idProductor: 'productor-propio',
    };

    const pipeline1 = (service as any).ejecutarPipelineDecision(
      'siembra-propia',
      permiso,
      false,
      true,
    );
    const pipeline2 = (service as any).ejecutarPipelineDecision(
      'siembra-propia',
      permiso,
      false,
      true,
    );
    await iniciado;
    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledTimes(1);

    liberarPrimero!();
    await Promise.all([pipeline1, pipeline2]);

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledTimes(2);
    expect(prediccionsService.reconstruir).toHaveBeenCalledTimes(2);
    expect(
      prediccionsService.reconstruir.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.reprocesarAgrometeorologia.mock.invocationCallOrder[1],
    );
    expect(prediccionsService.agroclima).toHaveBeenCalledTimes(2);
  });
});
