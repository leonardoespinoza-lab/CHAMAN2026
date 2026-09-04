import { BadRequestException } from '@nestjs/common';
import { LotesService } from './service';

describe('LotesService - prediccion estacional de malezas', () => {
  const createService = () => {
    const repository = {
      getById: jest.fn(),
      prediccionMalezas: jest.fn(),
    };
    const service = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { repository, service };
  };

  const permisoProductor = {
    nivel: 'Productor',
    idProductor: 'productor-1',
  } as any;

  it('autoriza el lote antes de solicitar el calculo y conserva el reinicio solicitado', async () => {
    const { repository, service } = createService();
    const resultado = { estado: 'ok', especies: [] };
    repository.getById.mockResolvedValue({
      _id: 'lote-1',
      idProductor: 'productor-1',
    });
    repository.prediccionMalezas.mockResolvedValue(resultado);

    await expect(
      service.prediccionMalezas('lote-1', permisoProductor, true),
    ).resolves.toBe(resultado);

    expect(repository.getById).toHaveBeenCalledWith('lote-1');
    expect(repository.prediccionMalezas).toHaveBeenCalledWith('lote-1', true);
  });

  it('no ejecuta el motor cuando el lote queda fuera del alcance del usuario', async () => {
    const { repository, service } = createService();
    repository.getById.mockResolvedValue({
      _id: 'lote-1',
      idProductor: 'otro-productor',
    });

    await expect(
      service.prediccionMalezas('lote-1', permisoProductor),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.prediccionMalezas).not.toHaveBeenCalled();
  });
});
