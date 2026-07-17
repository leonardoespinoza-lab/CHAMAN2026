import { SemillasRepository } from './repository';

describe('SemillasRepository - actualizacion termica segura', () => {
  it('actualiza parametros por ruta y aplica unset sin reemplazar el subdocumento completo', async () => {
    const model = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'semilla-1' }),
    };
    const repository = new SemillasRepository(model as any);

    await repository.update(
      'semilla-1',
      {
        cultivo: 'Maiz',
        parametrosAgrometeorologicos: {
          version: 'agromet-test-2',
          kcInicial: 0.5,
          profundidadRadicularCm: 90,
        },
      } as any,
      [
        'requerimientoFrio',
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.modeloVernalizacion',
      ],
    );

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'semilla-1',
      {
        $set: {
          cultivo: 'Maiz',
          'parametrosAgrometeorologicos.version': 'agromet-test-2',
          'parametrosAgrometeorologicos.kcInicial': 0.5,
          'parametrosAgrometeorologicos.profundidadRadicularCm': 90,
        },
        $unset: {
          requerimientoFrio: 1,
          'parametrosAgrometeorologicos.requerimientoVernalizacion': 1,
          'parametrosAgrometeorologicos.modeloVernalizacion': 1,
        },
      },
      { new: true },
    );
    const update = model.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.parametrosAgrometeorologicos).toBeUndefined();
  });

  it('evita conflictos entre set y unset sobre la misma ruta', async () => {
    const model = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'semilla-1' }),
    };
    const repository = new SemillasRepository(model as any);

    await repository.update(
      'semilla-1',
      {
        requerimientoFrio: { horasFrio: 500 },
      },
      ['requerimientoFrio'],
    );

    const update = model.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set).toBeUndefined();
    expect(update.$unset).toEqual({ requerimientoFrio: 1 });
  });

  it('colapsa un unset padre y evita rutas descendientes conflictivas', async () => {
    const model = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({ _id: 'semilla-1' }),
    };
    const repository = new SemillasRepository(model as any);

    await repository.update(
      'semilla-1',
      {
        parametrosAgrometeorologicos: {
          version: 'no-debe-persistirse',
          kcInicial: 0.5,
        },
      } as any,
      [
        'parametrosAgrometeorologicos.gddPorEtapa',
        'parametrosAgrometeorologicos',
        'parametrosAgrometeorologicos.fotoperiodoVarietal',
      ],
    );

    const update = model.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set).toBeUndefined();
    expect(update.$unset).toEqual({
      parametrosAgrometeorologicos: 1,
    });
  });
});
