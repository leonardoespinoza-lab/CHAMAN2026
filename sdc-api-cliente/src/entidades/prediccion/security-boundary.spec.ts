import { PrediccionsService } from './service';

describe('Predicciones - autorizacion canonica', () => {
  function subject({
    prediccion = {
      _id: 'prediccion-1',
      idSiembra: 'siembra-1',
    },
    siembra = {
      _id: 'siembra-1',
      idLote: 'lote-1',
    },
  }: {
    prediccion?: Record<string, unknown>;
    siembra?: Record<string, unknown>;
  } = {}) {
    const repository = {
      getById: jest.fn().mockResolvedValue(prediccion),
      getSiembraById: jest.fn().mockResolvedValue(siembra),
      deleteByIdSiembra: jest.fn().mockResolvedValue(undefined),
      agroclima: jest.fn().mockResolvedValue({}),
      reconstruir: jest.fn().mockResolvedValue([]),
    };
    const lotesService = {
      getById: jest.fn().mockResolvedValue({ _id: 'lote-1' }),
    };
    return {
      service: new PrediccionsService(
        repository as any,
        {} as any,
        lotesService as any,
      ),
      repository,
      lotesService,
    };
  }

  const permisoProductor = {
    nivel: 'Productor',
    rol: 'Lectura',
    idProductor: 'productor-1',
  } as any;

  it('autoriza una prediccion legacy solamente mediante su lote canonico', async () => {
    const { service, lotesService } = subject();

    await expect(
      service.getById('prediccion-1', permisoProductor),
    ).resolves.toMatchObject({ _id: 'prediccion-1' });
    expect(lotesService.getById).toHaveBeenCalledWith(
      'lote-1',
      permisoProductor,
    );
  });

  it('no usa el lote como fallback cuando existe un tenant contradictorio', async () => {
    const { service, lotesService } = subject({
      siembra: {
        _id: 'siembra-1',
        idLote: 'lote-1',
        idProductor: 'productor-ajeno',
      },
    });

    await expect(
      service.getById('prediccion-1', permisoProductor),
    ).rejects.toThrow('No tiene permiso');
    expect(lotesService.getById).not.toHaveBeenCalled();
  });

  it('rechaza documentos sin siembra canonica para usuarios no administradores', async () => {
    const { service, repository } = subject({
      prediccion: { _id: 'prediccion-huerfana' },
    });

    await expect(
      service.getById('prediccion-huerfana', permisoProductor),
    ).rejects.toThrow('siembra canonica');
    expect(repository.getSiembraById).not.toHaveBeenCalled();
  });

  it('borra todas las predicciones legacy luego de autorizar la siembra', async () => {
    const { service, repository } = subject();

    await service.deleteByIdSiembra('siembra-1', permisoProductor);

    expect(repository.deleteByIdSiembra).toHaveBeenCalledWith('siembra-1');
  });

  it('protege agroclima con la misma autorizacion canonica', async () => {
    const { service, repository } = subject({
      siembra: {
        _id: 'siembra-1',
        idLote: 'lote-1',
        idProductor: 'productor-ajeno',
      },
    });

    await expect(
      service.agroclima('siembra-1', permisoProductor),
    ).rejects.toThrow('No tiene permiso');
    expect(repository.agroclima).not.toHaveBeenCalled();
  });

  it('protege tambien la reconstruccion sanitaria completa', async () => {
    const { service, repository } = subject({
      siembra: {
        _id: 'siembra-1',
        idLote: 'lote-1',
        idProductor: 'productor-ajeno',
      },
    });

    await expect(
      service.reconstruir('siembra-1', permisoProductor),
    ).rejects.toThrow('No tiene permiso');
    expect(repository.reconstruir).not.toHaveBeenCalled();
  });
});
