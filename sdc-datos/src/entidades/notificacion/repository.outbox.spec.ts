import { NotificacionsRepository } from './repository';
import { NotificacionSchema } from './modelos/schema';

const query = (value: any) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const data = () => ({
  titulo: 'Riesgo sanitario',
  mensaje: 'Validar a campo',
  tenant: { idUsuario: 'usuario-1', idProductor: 'productor-1' },
  eventKey: 'enfermedad:siembra-1:roya:v4:2026-07-16',
  data: {
    eventKey: 'enfermedad:siembra-1:roya:v4:2026-07-16',
  },
});

describe('NotificacionsRepository - outbox y deduplicacion atomica', () => {
  it('declara unicidad parcial por usuario y eventKey sin bloquear historicos', () => {
    const index = NotificacionSchema.indexes().find(
      ([fields]) =>
        fields['tenant.idUsuario'] === 1 && fields.eventKey === 1,
    );

    expect(index).toBeDefined();
    expect(index?.[1]).toEqual(
      expect.objectContaining({
        unique: true,
        name: 'uniq_notificacion_usuario_evento',
        partialFilterExpression: {
          'tenant.idUsuario': { $type: 'string' },
          eventKey: { $type: 'string' },
        },
      }),
    );
  });

  it('persiste el claim antes de habilitar el envio externo', async () => {
    const creada = {
      ...data(),
      _id: 'notificacion-1',
      entregaPush: { estado: 'reclamada', claimId: 'claim-1' },
    };
    const model = {
      init: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(null)),
      create: jest.fn().mockResolvedValue(creada),
    };
    const repository = new NotificacionsRepository(model as any);
    const ahora = new Date('2026-07-16T12:00:00.000Z');
    const lease = new Date('2026-07-16T12:05:00.000Z');

    await expect(
      repository.claimPush(data(), 'claim-1', ahora, lease),
    ).resolves.toEqual({
      reclamada: true,
      motivo: 'creada',
      notificacion: creada,
    });

    expect(model.init.mock.invocationCallOrder[0]).toBeLessThan(
      model.create.mock.invocationCallOrder[0],
    );
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: data().eventKey,
        entregaPush: {
          estado: 'reclamada',
          claimId: 'claim-1',
          reclamadaEn: ahora,
          leaseHasta: lease,
          intentos: 1,
        },
      }),
    );
  });

  it('convierte una colision E11000 concurrente en duplicado sin segundo claim', async () => {
    const ganadora = {
      ...data(),
      _id: 'notificacion-ganadora',
      entregaPush: { estado: 'enviada', claimId: 'claim-ganadora' },
    };
    const model = {
      init: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(ganadora))
        .mockReturnValueOnce(query(ganadora)),
      create: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 })),
      findOneAndUpdate: jest.fn().mockReturnValue(query(null)),
    };
    const repository = new NotificacionsRepository(model as any);

    await expect(
      repository.claimPush(
        data(),
        'claim-perdedora',
        new Date('2026-07-16T12:00:00.000Z'),
        new Date('2026-07-16T12:05:00.000Z'),
      ),
    ).resolves.toMatchObject({
      reclamada: false,
      motivo: 'duplicada',
      notificacion: ganadora,
    });
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('reclama atomicamente un claim vencido y aumenta el numero de intentos', async () => {
    const vencida = {
      ...data(),
      _id: 'notificacion-1',
      entregaPush: {
        estado: 'reclamada',
        claimId: 'claim-vieja',
        leaseHasta: new Date('2026-07-16T11:59:00.000Z'),
        intentos: 1,
      },
    };
    const renovada = {
      ...vencida,
      entregaPush: { ...vencida.entregaPush, claimId: 'claim-nueva' },
    };
    const model = {
      init: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockReturnValue(query(vencida)),
      findOneAndUpdate: jest.fn().mockReturnValue(query(renovada)),
    };
    const repository = new NotificacionsRepository(model as any);
    const ahora = new Date('2026-07-16T12:00:00.000Z');

    await expect(
      repository.claimPush(
        data(),
        'claim-nueva',
        ahora,
        new Date('2026-07-16T12:05:00.000Z'),
      ),
    ).resolves.toMatchObject({ reclamada: true, motivo: 'reintento' });

    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual(
      expect.objectContaining({
        'tenant.idUsuario': 'usuario-1',
        eventKey: data().eventKey,
        $or: expect.arrayContaining([
          {
            'entregaPush.estado': 'reclamada',
            'entregaPush.leaseHasta': { $lte: ahora },
          },
        ]),
      }),
    );
    expect(update).toEqual(
      expect.objectContaining({
        $inc: { 'entregaPush.intentos': 1 },
        $set: expect.objectContaining({
          'entregaPush.claimId': 'claim-nueva',
        }),
      }),
    );
  });

  it('solo finaliza el claim vigente y programa retry al fallar', async () => {
    const finalizada = {
      ...data(),
      _id: 'notificacion-1',
      entregaPush: { estado: 'fallida', claimId: 'claim-1' },
    };
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue(query(finalizada)),
    };
    const repository = new NotificacionsRepository(model as any);
    const ahora = new Date('2026-07-16T12:00:00.000Z');
    const retry = new Date('2026-07-16T12:05:00.000Z');

    await repository.finalizarEntregaPush(
      'notificacion-1',
      {
        claimId: 'claim-1',
        resultado: 'fallida',
        detalle: 'proveedor-no-disponible',
      },
      ahora,
      retry,
    );

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'notificacion-1',
        'entregaPush.estado': 'reclamada',
        'entregaPush.claimId': 'claim-1',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          'entregaPush.estado': 'fallida',
          'entregaPush.fallidaEn': ahora,
          'entregaPush.proximoIntentoEn': retry,
        }),
      }),
      { new: true },
    );
  });

  it('oculta una notificacion idempotente sin borrar su tombstone', async () => {
    const existente = { ...data(), _id: 'notificacion-1' };
    const model = {
      findById: jest.fn().mockReturnValue(query(existente)),
      findByIdAndUpdate: jest.fn().mockResolvedValue({
        ...existente,
        oculta: true,
      }),
      findByIdAndDelete: jest.fn(),
    };
    const repository = new NotificacionsRepository(model as any);

    await repository.delete('notificacion-1');

    expect(model.findByIdAndDelete).not.toHaveBeenCalled();
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'notificacion-1',
      {
        $set: expect.objectContaining({
          oculta: true,
          leido: true,
          fechaEliminacion: expect.any(Date),
        }),
      },
      { new: true },
    );
  });
});
