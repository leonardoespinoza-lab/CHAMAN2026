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

describe('SemillasRepository - importacion de catalogo segura', () => {
  it('usa compare-and-set estructural y runValidators al reemplazar resistencia', async () => {
    const expected = [
      {
        idEnfermedad: 'trigo.roya_hoja',
        enfermedad: 'Roya de la Hoja',
        perfil: 'S',
        multiplicador: 1,
        detalleSanitario: {
          interpretacion: 'dato legacy',
          metodo: 'ensayo',
        },
      },
    ];
    const replacement = [
      {
        ...expected[0],
        perfil: 'R',
        multiplicador: 0.05,
        indiceResistencia: 1,
      },
    ];
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'semilla-1' }),
    };
    const repository = new SemillasRepository(model as any);

    await repository.replaceCatalogResistance(
      'semilla-1',
      {
        cultivo: 'Trigo',
        semillero: 'Semillero',
        variedad: 'Variedad',
        ciclo: 'CORTO',
      },
      expected as any,
      replacement as any,
    );

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'semilla-1',
        resistencia: { $size: 1 },
        'resistencia.0': { $type: 'object' },
        'resistencia.0.idEnfermedad': 'trigo.roya_hoja',
        'resistencia.0.enfermedad': 'Roya de la Hoja',
        'resistencia.0.perfil': 'S',
        'resistencia.0.multiplicador': 1,
        'resistencia.0.detalleSanitario': { $type: 'object' },
        'resistencia.0.detalleSanitario.interpretacion': 'dato legacy',
        'resistencia.0.detalleSanitario.metodo': 'ensayo',
        cultivo: 'Trigo',
        semillero: 'Semillero',
        variedad: 'Variedad',
        ciclo: 'CORTO',
        campania: { $exists: false },
        $expr: expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({
              $eq: expect.arrayContaining([
                expect.objectContaining({
                  $cond: expect.arrayContaining([
                    expect.objectContaining({
                      $eq: [
                        {
                          $type: {
                            $arrayElemAt: ['$resistencia', 0],
                          },
                        },
                        'object',
                      ],
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
        }),
      }),
      { $set: { resistencia: replacement } },
      { new: true, runValidators: true },
    );
  });

  it('valida el documento efectivo antes de escribir', async () => {
    const validate = jest.fn().mockResolvedValue(undefined);
    const Model = jest.fn().mockImplementation(() => ({ validate }));
    const repository = new SemillasRepository(Model as any);

    await repository.validateCatalogDocument({
      cultivo: 'Trigo',
      semillero: 'Semillero',
      variedad: 'Variedad',
      ciclo: 'CORTO',
      resistencia: [],
    });

    expect(Model).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('protege el rollback de altas con todos los campos conocidos', async () => {
    const deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const repository = new SemillasRepository({ deleteOne } as any);
    const expected = {
      _id: 'semilla-1',
      __v: 0,
      cultivo: 'Trigo',
      semillero: 'Semillero',
      variedad: 'Variedad',
      ciclo: 'CORTO',
      resistencia: [],
    } as any;

    await expect(
      repository.deleteCreatedCatalogDocument('semilla-1', expected),
    ).resolves.toBe(true);

    const filter = deleteOne.mock.calls[0][0];
    expect(filter).toMatchObject({
      _id: 'semilla-1',
      __v: 0,
      cultivo: 'Trigo',
      variedad: 'Variedad',
      resistencia: [],
      campania: { $exists: false },
      sensibilidadHelada: { $exists: false },
      fichaVarietal: { $exists: false },
      parametrosAgrometeorologicos: { $exists: false },
    });
  });
});
