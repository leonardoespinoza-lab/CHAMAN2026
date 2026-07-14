import { SiembrasService } from './service';

describe('SiembrasService - cosecha canonica', () => {
  it('valida permisos y delega una sola vez el calculo de huella a sdc-datos', async () => {
    const updated = {
      _id: 'siembra-1',
      idLote: 'lote-1',
      activa: false,
      huellaHidrica: { total: { litrosKg: 420 } },
    };
    const repository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'siembra-1',
        idLote: 'lote-1',
      }),
      cosechar: jest.fn().mockResolvedValue(updated),
    };
    const lotesService = {
      getById: jest.fn().mockResolvedValue({ _id: 'lote-1' }),
      update: jest.fn(),
    };
    const service = new SiembrasService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      lotesService as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const payload = {
      fechaCosecha: '2026-07-14',
      rendimientoObtenidoKgHa: 5000,
      humedadCosecha: 14,
    } as any;

    await expect(
      service.cosechar('siembra-1', payload, {
        nivel: 'Admin',
        rol: 'Admin',
      } as any),
    ).resolves.toBe(updated);

    expect(repository.cosechar).toHaveBeenCalledTimes(1);
    expect(repository.cosechar).toHaveBeenCalledWith('siembra-1', payload);
    expect(lotesService.getById).toHaveBeenCalledWith(
      'lote-1',
      expect.objectContaining({ nivel: 'Admin' }),
    );
    expect(lotesService.update).not.toHaveBeenCalled();
    expect(payload).toEqual({
      fechaCosecha: '2026-07-14',
      rendimientoObtenidoKgHa: 5000,
      humedadCosecha: 14,
    });
  });
});
