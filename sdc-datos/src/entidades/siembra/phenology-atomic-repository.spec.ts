import { SiembrasRepository } from './repository';

describe('SiembrasRepository - append fenologico atomico', () => {
  function subject() {
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'siembra-1' }),
    };
    return {
      repository: new SiembrasRepository(model as any),
      model,
    };
  }

  it('reserva en una sola operacion el id y el registro que sera corregido', async () => {
    const { repository, model } = subject();

    await repository.appendPhenologyRecord('siembra-1', {
      id: 'correccion-1',
      tipoEvento: 'correccion',
      etapa: 'Brotacion',
      fechaInicioEtapa: '2026-07-16',
      reemplazaRegistroId: 'original-1',
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'siembra-1',
        $and: [
          { 'registrosFenologicos.id': { $ne: 'correccion-1' } },
          {
            registrosFenologicos: {
              $elemMatch: { id: 'original-1' },
            },
          },
          {
            'registrosFenologicos.reemplazaRegistroId': {
              $ne: 'original-1',
            },
          },
        ],
      },
      {
        $push: {
          registrosFenologicos: expect.objectContaining({
            id: 'correccion-1',
            reemplazaRegistroId: 'original-1',
          }),
        },
      },
      { new: true },
    );
  });

  it('mantiene deduplicacion atomica para un evento sin correccion', async () => {
    const { repository, model } = subject();

    await repository.appendPhenologyRecord('siembra-1', {
      id: 'observacion-1',
      tipoEvento: 'observacion',
      etapa: 'Brotacion',
      fechaObservacion: '2026-07-16',
    });

    expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({
      _id: 'siembra-1',
      $and: [{ 'registrosFenologicos.id': { $ne: 'observacion-1' } }],
    });
  });
});
