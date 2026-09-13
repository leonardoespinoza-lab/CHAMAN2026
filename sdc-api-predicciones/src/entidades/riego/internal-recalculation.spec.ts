jest.mock('../../env', () => ({
  AGROMETEO_INTERNAL_TOKEN: 'synthetic-internal-token',
}));
import { RiegoController } from './controller';

describe('Recalculo interno de riego', () => {
  it('exige token interno y no invoca el motor con credenciales invalidas', async () => {
    const service = { prediccion: jest.fn() };
    const controller = new RiegoController(service as any);
    for (const token of [undefined, '', 'invalid']) {
      await expect(controller.recalcular('s1', token)).rejects.toThrow(
        'Unauthorized',
      );
    }
    expect(service.prediccion).not.toHaveBeenCalled();
  });
  it('solicita errores propagados sin HTTPS y conserva el error para el pipeline', async () => {
    const service = {
      prediccion: jest.fn().mockRejectedValue(new Error('persistencia')),
    };
    const controller = new RiegoController(service as any);
    await expect(
      controller.recalcular('s1', 'synthetic-internal-token'),
    ).rejects.toThrow('persistencia');
    expect(service.prediccion).toHaveBeenCalledWith('s1', false, {
      propagarErrores: true,
    });
  });
  it('no cambia el contrato del endpoint anterior', async () => {
    const service = { prediccion: jest.fn() };
    await new RiegoController(service as any).prediccion('s1');
    expect(service.prediccion).toHaveBeenCalledWith('s1');
  });
});
