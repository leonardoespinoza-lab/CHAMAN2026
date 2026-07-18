import { BadRequestException } from '@nestjs/common';
import { AlertasService } from './service';

describe('AlertasService datos - frontera atomica', () => {
  it('rechaza eventos sin identidad idempotente completa', async () => {
    const repository = { registrarEventoSiembra: jest.fn() };
    const service = new AlertasService(repository as any);

    await expect(
      service.registrarEventoSiembra({
        alerta: { idSiembra: 'siembra-1' },
        eventKey: '',
        reporte: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.registrarEventoSiembra).not.toHaveBeenCalled();
  });

  it('devuelve cuantas copias equivalentes cerro el repositorio', async () => {
    const repository = {
      finalizarEventoSiembra: jest.fn().mockResolvedValue(2),
    };
    const service = new AlertasService(repository as any);

    await expect(
      service.finalizarEventoSiembra({
        idSiembra: 'siembra-1',
        descripcion: 'Prediccion sanitaria: Roya',
        comentario: 'Fin de ventana',
        fecha: '2026-07-16T12:00:00.000Z',
      }),
    ).resolves.toEqual({ finalizada: true, modificadas: 2 });
  });

  it('finaliza todas las alertas al cerrar el ciclo productivo', async () => {
    const repository = {
      finalizarTodasPorSiembra: jest.fn().mockResolvedValue(3),
    };
    const service = new AlertasService(repository as any);

    await expect(
      service.finalizarTodasPorSiembra(
        'siembra-1',
        'Ciclo productivo cerrado',
        '2026-11-10T00:00:00.000Z',
      ),
    ).resolves.toBe(3);
    expect(repository.finalizarTodasPorSiembra).toHaveBeenCalledWith(
      'siembra-1',
      'Ciclo productivo cerrado',
      '2026-11-10T00:00:00.000Z',
    );
  });
});
