jest.mock(
  'src/entidades/fumigacion/service',
  () => ({ FumigacionsService: class FumigacionsService {} }),
  { virtual: true },
);

import { PrediccionsService } from './service';

describe('PrediccionsService - propagacion de fallos', () => {
  function subject(cultivo = 'Trigo') {
    const siembrasService = {
      getById: jest.fn().mockResolvedValue({
        _id: 'siembra-1',
        fechaSiembra: '2026-05-01T00:00:00.000Z',
        semilla: { cultivo },
      }),
    };
    const fallo = new Error('persistencia sanitaria no disponible');
    const trigo = {
      hacerPredicciones: jest.fn().mockRejectedValue(fallo),
    };
    const repository = {
      get: jest.fn().mockResolvedValue({
        datos: [
          {
            _id: 'prediccion-anterior',
            idSiembra: 'siembra-1',
            fecha: '2026-07-14T00:00:00.000Z',
          },
        ],
      }),
      deleteByIdSiembra: jest.fn().mockResolvedValue(undefined),
      restoreByIdSiembra: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PrediccionsService(
      siembrasService as any,
      trigo as any,
      { hacerPredicciones: jest.fn() } as any,
      { hacerPredicciones: jest.fn() } as any,
      { hacerPredicciones: jest.fn() } as any,
      { hacerPredicciones: jest.fn() } as any,
      { enviarNotificaciones: jest.fn() } as any,
      { registrarEventoSiembra: jest.fn() } as any,
      repository as any,
    );
    return { service, fallo, repository, siembrasService };
  }

  it('no transforma una falla del motor sanitario en una respuesta exitosa', async () => {
    const { service, fallo } = subject();

    await expect(service.prediccion('siembra-1')).rejects.toBe(fallo);
  });

  it('devuelve una serie vacia explicita para cultivos sin motor', async () => {
    const { service } = subject('Vid');

    await expect(service.prediccion('siembra-1')).resolves.toEqual([]);
  });

  it('restaura la serie anterior si falla una reconstruccion', async () => {
    const { service, fallo, repository } = subject();

    await expect(service.reconstruir('siembra-1')).rejects.toBe(fallo);

    expect(repository.deleteByIdSiembra).toHaveBeenCalledWith('siembra-1');
    expect(repository.restoreByIdSiembra).toHaveBeenCalledWith(
      'siembra-1',
      expect.arrayContaining([
        expect.objectContaining({ _id: 'prediccion-anterior' }),
      ]),
    );
  });
});
