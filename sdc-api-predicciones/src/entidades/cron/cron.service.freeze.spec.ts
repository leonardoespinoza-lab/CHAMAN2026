jest.mock('../../env', () => ({
  PREDICCIONES_AGROCLIMA_CRON_ENABLED: false,
  PREDICCIONES_MALEZAS_CRON_ENABLED: false,
  PREDICCIONES_SANITARIAS_CRON_ENABLED: false,
  RIEGO_CRON_ENABLED: false,
}));
jest.mock('../prediccion/service', () => ({ PrediccionsService: class {} }));
jest.mock('../siembra/service', () => ({ SiembrasService: class {} }));
jest.mock('../riego/service', () => ({ RiegoService: class {} }));
jest.mock('../agroclima/service', () => ({ AgroclimaService: class {} }));

import { CronService } from './cron.service';

describe('CronService freeze', () => {
  it('no consulta ni genera predicciones sanitarias cuando el cron esta apagado', async () => {
    const siembras = { listarSiembrasParaPredicciones: jest.fn() };
    const predicciones = { prediccion: jest.fn() };
    const service = new CronService(
      siembras as any,
      predicciones as any,
      {} as any,
      {} as any,
    );

    await service.hacerPredicciones();

    expect(siembras.listarSiembrasParaPredicciones).not.toHaveBeenCalled();
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });
});
