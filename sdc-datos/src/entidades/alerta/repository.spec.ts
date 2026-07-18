import { AlertasRepository } from './repository';
import { AlertaSchema } from './modelos/schema';

const query = (value: any) => {
  const chain: any = {};
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(value);
  return chain;
};

const comandoSanitario = () => ({
  alerta: {
    idSiembra: '64b000000000000000000001',
    activa: true,
    fecha: '2026-07-16T12:00:00.000Z',
    fechaUltimoEvento: '2026-07-16T12:00:00.000Z',
    estadoActual: 'Nueva' as const,
    descripcion: 'Prediccion sanitaria: Roya de la Hoja',
    titulo: 'Roya de la Hoja',
    tipo: 'enfermedad',
    categoria: 'sanitaria' as const,
    severidad: 'media' as const,
    prioridad: 50,
    dedupeKey: '64b000000000000000000001:sanitaria:enfermedad:roya-de-la-hoja',
  },
  eventKey: 'enfermedad:64b000000000000000000001:roya-de-la-hoja:v4:2026-07-16',
  reporte: { resultado: 25, enfermedad: 'Roya de la Hoja' },
});

describe('AlertasRepository - deduplicacion atomica', () => {
  it('declara una identidad activa unica sin bloquear documentos historicos', () => {
    const index = AlertaSchema.indexes().find(
      ([fields]) => fields.claveDedupeActiva === 1,
    );

    expect(index).toBeDefined();
    expect(index?.[1]).toEqual(
      expect.objectContaining({
        unique: true,
        sparse: true,
        name: 'alerta_activa_dedupe_unica',
      }),
    );
  });

  it('abre o actualiza la alerta y anexa el evento en un unico findOneAndUpdate', async () => {
    const model = {
      init: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(null)),
      findOneAndUpdate: jest.fn().mockResolvedValue({
        value: { _id: 'alerta-1', activa: true },
        lastErrorObject: { updatedExisting: false, upserted: 'alerta-1' },
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const repository = new AlertasRepository(model as any);

    const result = await repository.registrarEventoSiembra(comandoSanitario());

    expect(result).toMatchObject({ creada: true, duplicada: false });
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(model.init.mock.invocationCallOrder[0]).toBeLessThan(
      model.findOneAndUpdate.mock.invocationCallOrder[0],
    );
    const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      claveDedupeActiva: expect.stringMatching(/^[a-f0-9]{64}$/),
      eventKeys: { $ne: comandoSanitario().eventKey },
    });
    expect(update).toEqual(
      expect.objectContaining({
        $push: {
          reportes: expect.objectContaining({
            eventKey: comandoSanitario().eventKey,
            dedupeKey: comandoSanitario().alerta.dedupeKey,
          }),
        },
        $addToSet: { eventKeys: comandoSanitario().eventKey },
      }),
    );
    expect(options).toEqual(
      expect.objectContaining({ upsert: true, includeResultMetadata: true }),
    );
  });

  it('convierte una colision 11000 concurrente del mismo eventKey en duplicado', async () => {
    const existente = {
      _id: 'alerta-1',
      activa: true,
      eventKeys: [comandoSanitario().eventKey],
      reportes: [],
    };
    const model = {
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(existente))
        .mockReturnValueOnce(query(existente)),
      findOneAndUpdate: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 })),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const repository = new AlertasRepository(model as any);

    await expect(
      repository.registrarEventoSiembra(comandoSanitario()),
    ).resolves.toMatchObject({
      alerta: existente,
      creada: false,
      duplicada: true,
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('reintenta sobre la alerta ganadora cuando dos eventos distintos abren a la vez', async () => {
    const ganadora = {
      _id: 'alerta-ganadora',
      activa: true,
      eventKeys: ['evento-concurrente-distinto'],
      reportes: [{ eventKey: 'evento-concurrente-distinto' }],
    };
    const model = {
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(ganadora)),
      findOneAndUpdate: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('E11000'), { code: 11000 }),
        )
        .mockResolvedValueOnce({
          value: { _id: 'alerta-ganadora', activa: true },
          lastErrorObject: { updatedExisting: true },
        }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const repository = new AlertasRepository(model as any);

    await expect(
      repository.registrarEventoSiembra(comandoSanitario()),
    ).resolves.toMatchObject({
      creada: false,
      duplicada: false,
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(model.findOneAndUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        eventKeys: { $ne: comandoSanitario().eventKey },
      }),
    );
  });

  it('adopta la alerta sanitaria v3 y archiva las copias activas equivalentes', async () => {
    const legado = {
      _id: 'alerta-v3',
      activa: true,
      descripcion: 'Riesgo de Enfermedad',
      titulo: 'Roya de la Hoja',
      reportes: [{ eventKey: 'evento-viejo' }],
    };
    const model = {
      findOne: jest
        .fn()
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(legado)),
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({ _id: 'alerta-v3' })
        .mockResolvedValueOnce({
          value: { _id: 'alerta-v3', activa: true },
          lastErrorObject: { updatedExisting: true },
        }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const repository = new AlertasRepository(model as any);

    const result = await repository.registrarEventoSiembra(comandoSanitario());

    expect(result).toMatchObject({ creada: false, duplicada: false });
    expect(model.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: expect.objectContaining({
        dedupeKey: comandoSanitario().alerta.dedupeKey,
        eventKeys: ['evento-viejo'],
        claveDedupeActiva: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $ne: 'alerta-v3' },
        activa: true,
        $or: expect.arrayContaining([
          { dedupeKey: comandoSanitario().alerta.dedupeKey },
          {
            descripcion: 'Riesgo de Enfermedad',
            titulo: 'Roya de la Hoja',
          },
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          activa: false,
          estadoActual: 'Finalizada',
        }),
        $unset: { claveDedupeActiva: '' },
      }),
    );
  });

  it('finaliza atomicamente todas las copias v4 y v3 de una enfermedad', async () => {
    const model = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    };
    const repository = new AlertasRepository(model as any);

    const modified = await repository.finalizarEventoSiembra({
      idSiembra: comandoSanitario().alerta.idSiembra,
      descripcion: comandoSanitario().alerta.descripcion,
      comentario: 'La salida vigente no es alertable',
      dedupeKey: comandoSanitario().alerta.dedupeKey,
      tituloLegado: 'Roya de la Hoja',
      fecha: '2026-07-16T13:00:00.000Z',
    });

    expect(modified).toBe(2);
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        idSiembra: comandoSanitario().alerta.idSiembra,
        activa: true,
        $or: [
          { dedupeKey: comandoSanitario().alerta.dedupeKey },
          {
            descripcion: 'Riesgo de Enfermedad',
            titulo: 'Roya de la Hoja',
          },
        ],
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ activa: false }),
        $unset: { claveDedupeActiva: '' },
        $push: {
          estados: expect.objectContaining({
            comentario: 'La salida vigente no es alertable',
          }),
        },
      }),
    );
  });
});
