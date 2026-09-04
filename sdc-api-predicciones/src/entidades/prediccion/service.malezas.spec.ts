jest.mock(
  'src/entidades/fumigacion/service',
  () => ({ FumigacionsService: class FumigacionsService {} }),
  { virtual: true },
);

import { PrediccionsService } from './service';

describe('PrediccionsService - malezas por lote', () => {
  it('recorre todos los lotes activos, incluso sin siembra', async () => {
    const siembras = {
      listarSiembrasParaMalezas: jest.fn(),
      getById: jest.fn(),
    };
    const lotes = {
      listarLotesParaMalezas: jest
        .fn()
        .mockResolvedValue([
          { _id: 'lote-con-siembra' },
          { _id: 'lote-sin-siembra' },
        ]),
      prediccionMalezas: jest
        .fn()
        .mockResolvedValueOnce({
          estado: 'operativo',
          idLote: 'lote-con-siembra',
          especies: [{ severidad: 'baja' }],
        })
        .mockResolvedValueOnce({
          estado: 'operativo',
          idLote: 'lote-sin-siembra',
          especies: [{ severidad: 'media' }],
        }),
    };
    const service = new PrediccionsService(
      siembras as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      lotes as any,
    );

    await service.hacerPrediccionesMalezas();

    expect(lotes.prediccionMalezas).toHaveBeenCalledTimes(2);
    expect(lotes.prediccionMalezas).toHaveBeenNthCalledWith(
      1,
      'lote-con-siembra',
    );
    expect(lotes.prediccionMalezas).toHaveBeenNthCalledWith(
      2,
      'lote-sin-siembra',
    );
    expect(siembras.listarSiembrasParaMalezas).not.toHaveBeenCalled();
    expect(siembras.getById).not.toHaveBeenCalled();
  });
});
