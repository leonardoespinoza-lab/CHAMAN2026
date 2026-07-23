import { dbQuery } from './helper.service';

describe('dbQuery', () => {
  it('interpreta un sort JSON antes de paginar lecturas meteorologicas', async () => {
    const queryChain: any = {
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([{ fecha: '2026-07-20' }]),
    };
    const model: any = {
      countDocuments: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockReturnValue(queryChain),
    };

    const result = await dbQuery(model, {
      page: 0,
      limit: 5000,
      sort: JSON.stringify({ fecha: -1, fechaCreacion: -1, _id: -1 }),
    });

    expect(queryChain.sort).toHaveBeenCalledWith({
      fecha: -1,
      fechaCreacion: -1,
      _id: -1,
    });
    expect(result.datos).toHaveLength(1);
  });

  it('conserva la sintaxis Mongo tradicional para ordenes simples', async () => {
    const queryChain: any = {
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    };
    const model: any = {
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockReturnValue(queryChain),
    };

    await dbQuery(model, { sort: '-fechaDeLaImagen' });

    expect(queryChain.sort).toHaveBeenCalledWith('-fechaDeLaImagen');
  });

  it('excluye archivados por defecto y permite pedirlos para auditoria', async () => {
    const chain = (): any => ({
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    });
    const model: any = {
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockImplementation(() => chain()),
    };

    await dbQuery(model, {});
    expect(model.countDocuments).toHaveBeenLastCalledWith({ archivado: { $ne: true } });

    await dbQuery(model, { onlyArchived: true });
    expect(model.countDocuments).toHaveBeenLastCalledWith({ archivado: true });

    await dbQuery(model, { includeArchived: true });
    expect(model.countDocuments).toHaveBeenLastCalledWith({});
  });
});
