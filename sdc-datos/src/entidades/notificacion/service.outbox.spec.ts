import { BadRequestException, ConflictException } from '@nestjs/common';
import { NotificacionsService } from './service';

describe('NotificacionsService - contrato seguro del outbox', () => {
  const repository = () => ({
    getFilter: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
    getById: jest.fn(),
    createIdempotent: jest.fn().mockImplementation(async (data) => data),
    claimPush: jest.fn().mockImplementation(async (data) => ({
      reclamada: true,
      motivo: 'creada',
      notificacion: data,
    })),
    finalizarEntregaPush: jest.fn().mockResolvedValue({ _id: 'notificacion-1' }),
    update: jest.fn().mockImplementation(async (_id, data) => data),
    updateMany: jest.fn().mockImplementation(async (_query, data) => data),
    delete: jest.fn(),
  });

  it('canoniza data.eventKey en el campo indexable al crear', async () => {
    const repo = repository();
    const service = new NotificacionsService(repo as any);

    await service.create({
      tenant: { idUsuario: 'usuario-1' },
      data: { eventKey: 'evento-1' },
    });

    expect(repo.createIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'evento-1',
        data: { eventKey: 'evento-1' },
      }),
    );
  });

  it('rechaza identidades inconsistentes o sin usuario', async () => {
    const service = new NotificacionsService(repository() as any);

    await expect(
      service.create({
        eventKey: 'evento-1',
        tenant: { idUsuario: 'usuario-1' },
        data: { eventKey: 'evento-2' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.claimPush({ eventKey: 'evento-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('oculta tombstones en lecturas comunes pero permite la lectura interna', async () => {
    const repo = repository();
    const service = new NotificacionsService(repo as any);

    await service.getFilter({ filter: JSON.stringify({ leido: false }) });
    expect(JSON.parse(repo.getFilter.mock.calls[0][0].filter)).toEqual({
      leido: false,
      oculta: { $ne: true },
    });

    await service.getFilter({ includeHidden: 'true' } as any);
    expect(repo.getFilter.mock.calls[1][0]).toEqual({ includeHidden: 'true' });
  });

  it('impide modificar la identidad y el estado del outbox por el PUT generico', async () => {
    const repo = repository();
    const service = new NotificacionsService(repo as any);

    await service.update('notificacion-1', {
      leido: true,
      eventKey: 'adulterado',
      data: { eventKey: 'adulterado' },
      entregaPush: { estado: 'enviada' },
      tenant: { idUsuario: 'otro-usuario' },
    });

    expect(repo.update).toHaveBeenCalledWith('notificacion-1', { leido: true });
  });

  it('rechaza finalizar un claim inexistente o ya resuelto', async () => {
    const repo = repository();
    repo.finalizarEntregaPush.mockResolvedValueOnce(null);
    const service = new NotificacionsService(repo as any);

    await expect(
      service.finalizarEntregaPush('notificacion-1', {
        claimId: 'claim-1',
        resultado: 'enviada',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
