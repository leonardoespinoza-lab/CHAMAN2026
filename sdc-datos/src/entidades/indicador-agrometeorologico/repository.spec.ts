import { IndicadoresAgrometeorologicosRepository } from './repository';
import { createHash } from 'node:crypto';

describe('IndicadoresAgrometeorologicosRepository - generaciones', () => {
  const row = (generationId = 'generation-new') =>
    ({
      idSiembra: '64b000000000000000000001',
      idLote: '64b000000000000000000002',
      idEstablecimiento: '64b000000000000000000003',
      fecha: '2026-07-16',
      esPronostico: false,
      metricas: {
        temperatureMinC: 5,
        temperatureMeanC: 10,
        temperatureMaxC: 15,
      },
      fuente: 'open_meteo',
      fuentePorVariable: {},
      banderasCalidad: [],
      advertencias: [],
      completitudPct: 100,
      versionCalculo: 'agromet-test-v1',
      versionParametros: 'parameters-test-v1',
      calculadoEn: '2026-07-16T12:00:00.000Z',
      generacionCalculo: generationId,
    }) as any;
  const expectedInterval = () => {
    const dates = [row().fecha];
    return {
      desde: dates[0],
      hasta: dates[dates.length - 1],
      cantidad: dates.length,
      checksumFechas: createHash('sha256')
        .update(
          `${row().idSiembra}|${row().versionCalculo}|${dates.join(',')}`,
        )
        .digest('hex'),
    };
  };

  it('activa la generacion solo despues de persistirla y verificar su cantidad', async () => {
    const legacyModel = {};
    const generatedModel = {
      bulkWrite: jest.fn().mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const generationModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({
          generacionEnProceso: 'generation-new',
          generacionActiva: 'generation-old',
        })
        .mockResolvedValueOnce({
          generacionActiva: 'generation-new',
        }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      legacyModel as any,
      generatedModel as any,
      generationModel as any,
    );

    const result = await repository.replaceGeneration(
      row().idSiembra,
      row().versionCalculo,
      'generation-new',
      [row()],
      expectedInterval(),
    );

    expect(result).toMatchObject({
      generationId: 'generation-new',
      indicators: 1,
      cleanupPending: false,
    });
    expect(generatedModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(generatedModel.countDocuments).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: row().versionCalculo,
      generacionCalculo: 'generation-new',
    });
    expect(
      generationModel.findOneAndUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(generatedModel.bulkWrite.mock.invocationCallOrder[0]);
    expect(
      generatedModel.countDocuments.mock.invocationCallOrder[0],
    ).toBeLessThan(generationModel.findOneAndUpdate.mock.invocationCallOrder[1]);
    expect(generatedModel.updateMany).toHaveBeenCalledWith(
      {
        idSiembra: row().idSiembra,
        versionCalculo: row().versionCalculo,
        generacionCalculo: 'generation-old',
        expiraEn: { $exists: false },
      },
      {
        $set: {
          expiraEn: expect.any(Date),
        },
      },
    );
  });

  it('no mueve el puntero activo si la nueva generacion quedo incompleta', async () => {
    const generatedModel = {
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const generationModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        generacionEnProceso: 'generation-new',
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        expectedInterval(),
      ),
    ).rejects.toThrow('quedo incompleta');

    expect(generationModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(generatedModel.deleteMany).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: row().versionCalculo,
      generacionCalculo: 'generation-new',
    });
    expect(generationModel.updateOne).toHaveBeenCalledTimes(1);
  });

  it('rechaza una corrida concurrente cuando no puede adquirir el lease', async () => {
    const generatedModel = {
      bulkWrite: jest.fn(),
      countDocuments: jest.fn(),
      deleteMany: jest.fn(),
    };
    const generationModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn(),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        expectedInterval(),
      ),
    ).rejects.toThrow('No se pudo adquirir el lease');

    expect(generatedModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('no activa ni conserva staging si el lease vence antes del cambio de puntero', async () => {
    const generatedModel = {
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      countDocuments: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const generationModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({
          generacionEnProceso: 'generation-new',
        })
        .mockResolvedValueOnce(null),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        expectedInterval(),
      ),
    ).rejects.toThrow('vencio antes de activarla');

    expect(generatedModel.deleteMany).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: row().versionCalculo,
      generacionCalculo: 'generation-new',
    });
  });

  it('lee exclusivamente las filas indicadas por el manifiesto activo', async () => {
    const generationModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          generacionActiva: 'generation-active',
          cantidadIndicadores: 1,
          activadaEn: '2026-07-16T12:05:00.000Z',
        }),
      }),
    };
    const generatedFind = {
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([row('generation-active')]),
      }),
    };
    const generatedModel = {
      find: jest.fn().mockReturnValue(generatedFind),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    const result = await repository.getActiveGeneration(
      row().idSiembra,
      row().versionCalculo,
    );

    expect(result.generationId).toBe('generation-active');
    expect(result.data).toHaveLength(1);
    expect(generatedModel.find).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: row().versionCalculo,
      generacionCalculo: 'generation-active',
    });
  });

  it('rechaza una serie truncada aunque todas las filas recibidas se persistan', async () => {
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      {} as any,
      {} as any,
    );
    const interval = {
      desde: '2026-07-15',
      hasta: '2026-07-16',
      cantidad: 2,
      checksumFechas: createHash('sha256')
        .update(
          `${row().idSiembra}|${row().versionCalculo}|2026-07-15,2026-07-16`,
        )
        .digest('hex'),
    };

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        interval,
      ),
    ).rejects.toThrow('no cubre de forma continua');
  });

  it('rechaza un intervalo continuo si un dia no tiene cobertura termica completa', async () => {
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      {} as any,
      {} as any,
    );
    const withoutTemperature = {
      ...row(),
      metricas: { photoperiodHours: 10.5 },
    };

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [withoutTemperature],
        expectedInterval(),
      ),
    ).rejects.toThrow('cobertura termica diaria completa');
  });

  it('reintenta la lectura si el puntero cambia entre manifiesto y filas', async () => {
    const generationModel = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            generacionActiva: 'generation-old',
            cantidadIndicadores: 1,
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            generacionActiva: 'generation-new',
            cantidadIndicadores: 1,
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            generacionActiva: 'generation-new',
            cantidadIndicadores: 1,
            activadaEn: '2026-07-16T12:05:00.000Z',
          }),
        }),
    };
    const generatedModel = {
      find: jest
        .fn()
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([row('generation-new')]),
          }),
        }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    const result = await repository.getActiveGeneration(
      row().idSiembra,
      row().versionCalculo,
    );

    expect(result.generationId).toBe('generation-new');
    expect(result.data).toHaveLength(1);
  });

  it('mantiene la lectura legacy mientras la primera generacion esta en staging', async () => {
    const generationModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          generacionActiva: 'legacy',
          cantidadIndicadores: 0,
          generacionEnProceso: 'generation-new',
        }),
      }),
    };
    const generatedModel = {
      find: jest.fn(),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    const result = await repository.getActiveGeneration(
      row().idSiembra,
      row().versionCalculo,
    );

    expect(result).toEqual({
      generationId: undefined,
      activatedAt: undefined,
      data: [],
    });
    expect(generatedModel.find).not.toHaveBeenCalled();
  });

  it('no permite que la ruta legacy escriba una siembra ya eliminada', async () => {
    const legacyModel = {
      bulkWrite: jest.fn(),
    };
    const generationModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { idSiembra: row().idSiembra },
          ]),
        }),
      }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      legacyModel as any,
      {} as any,
      generationModel as any,
    );

    await expect(repository.upsertMany([row()])).resolves.toEqual({
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
    });
    expect(legacyModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('purga una escritura legacy si la siembra se elimina durante el upsert', async () => {
    const legacyModel = {
      bulkWrite: jest.fn().mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const firstQuery = {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    };
    const secondQuery = {
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ idSiembra: row().idSiembra }]),
      }),
    };
    const generationModel = {
      find: jest
        .fn()
        .mockReturnValueOnce(firstQuery)
        .mockReturnValueOnce(secondQuery),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      legacyModel as any,
      {} as any,
      generationModel as any,
    );

    await repository.upsertMany([row()]);

    expect(legacyModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(legacyModel.deleteMany).toHaveBeenCalledWith({
      idSiembra: { $in: [row().idSiembra] },
    });
  });

  it('elimina legacy, generaciones y manifiestos al borrar una siembra', async () => {
    const legacyModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 4 }),
    };
    const generatedModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 8 }),
    };
    const generationModel = {
      updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      legacyModel as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(repository.deleteBySowing(row().idSiembra)).resolves.toEqual({
      legacyDeleted: 4,
      generatedDeleted: 8,
      generationManifestsDeleted: 1,
    });
    expect(generationModel.updateOne).toHaveBeenCalledWith(
      {
        idSiembra: row().idSiembra,
        versionCalculo: '__deleted__',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          generacionActiva: 'deleted',
          eliminadaEn: expect.any(Date),
        }),
      }),
      { upsert: true, runValidators: true },
    );
    expect(generationModel.deleteMany).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: { $ne: '__deleted__' },
    });
  });

  it('rechaza un reproceso cuando la siembra tiene una marca de eliminacion', async () => {
    const generatedModel = {
      bulkWrite: jest.fn(),
    };
    const generationModel = {
      exists: jest.fn().mockResolvedValue({ _id: 'tombstone' }),
      findOneAndUpdate: jest.fn(),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        expectedInterval(),
      ),
    ).rejects.toThrow('fue eliminada');

    expect(generatedModel.bulkWrite).not.toHaveBeenCalled();
    expect(generationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('descarta una generacion si la siembra se elimina durante el reproceso', async () => {
    const generatedModel = {
      bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      countDocuments: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      updateMany: jest.fn(),
    };
    const generationModel = {
      exists: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'tombstone' }),
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({
          generacionEnProceso: 'generation-new',
          generacionActiva: 'generation-old',
        })
        .mockResolvedValueOnce({
          generacionActiva: 'generation-new',
        }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const repository = new IndicadoresAgrometeorologicosRepository(
      {} as any,
      generatedModel as any,
      generationModel as any,
    );

    await expect(
      repository.replaceGeneration(
        row().idSiembra,
        row().versionCalculo,
        'generation-new',
        [row()],
        expectedInterval(),
      ),
    ).rejects.toThrow('durante el reproceso');

    expect(generationModel.deleteMany).toHaveBeenCalledWith({
      idSiembra: row().idSiembra,
      versionCalculo: row().versionCalculo,
    });
    expect(generatedModel.updateMany).not.toHaveBeenCalled();
  });
});
