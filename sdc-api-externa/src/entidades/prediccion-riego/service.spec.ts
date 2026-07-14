import { PrediccionRiegoService } from './service';

describe('PrediccionRiegoService', () => {
  it('solicita el lote poblado con _id y campos edaficos legacy', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [] }),
    };
    const service = new PrediccionRiegoService(repository as any);

    await service.getBySiembraYFecha('siembra-1');

    const query = repository.get.mock.calls[0][0];
    const populate = JSON.parse(query.populate);
    expect(populate).toEqual([
      {
        path: 'lote',
        select: '_id nombre puntoMarchitez capacidadDeCampo',
      },
    ]);
  });

  it('delega la lectura del contrato agronomico por lote', async () => {
    const inputs = { loteId: 'lote-1', stale: false };
    const repository = {
      getAgronomicInputsByLot: jest.fn().mockResolvedValue(inputs),
    };
    const service = new PrediccionRiegoService(repository as any);

    await expect(service.getAgronomicInputsByLot('lote-1')).resolves.toBe(
      inputs,
    );
    expect(repository.getAgronomicInputsByLot).toHaveBeenCalledWith('lote-1');
  });
});
