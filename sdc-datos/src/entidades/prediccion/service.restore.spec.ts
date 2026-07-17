import { PrediccionsService } from './service';

describe('Predicciones datos - restauracion controlada', () => {
  function subject() {
    const repository = {
      replaceByIdSiembra: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new PrediccionsService(repository as any),
      repository,
    };
  }

  it('restaura solamente documentos de la siembra indicada y limpia virtuales', async () => {
    const { service, repository } = subject();

    await service.restoreByIdSiembra('siembra-1', [
      {
        _id: 'prediccion-1',
        id: 'virtual-1',
        idSiembra: 'siembra-1',
        fecha: '2026-07-14T00:00:00.000Z',
        siembra: { _id: 'siembra-1' },
      } as any,
    ]);

    expect(repository.replaceByIdSiembra).toHaveBeenCalledWith(
      'siembra-1',
      [
        expect.not.objectContaining({
          id: expect.anything(),
          siembra: expect.anything(),
        }),
      ],
    );
  });

  it('rechaza un respaldo mezclado con otra siembra', async () => {
    const { service, repository } = subject();

    await expect(
      service.restoreByIdSiembra('siembra-1', [
        { idSiembra: 'siembra-ajena' } as any,
      ]),
    ).rejects.toThrow('otra siembra');
    expect(repository.replaceByIdSiembra).not.toHaveBeenCalled();
  });
});
