import { ForbiddenException } from '@nestjs/common';
import { EstacionsService } from './service';

describe('EstacionsService - aislamiento por tenant', () => {
  const crearServicio = () => {
    const repository = {
      getById: jest.fn(),
      getFiltered: jest.fn(async (query) => ({
        datos: [],
        totalCount: 0,
        query,
      })),
    };
    const establecimientos = {
      get: jest.fn(async () => ({
        datos: [{ _id: 'est-1' }, { _id: 'est-2' }],
        totalCount: 2,
      })),
    };
    return {
      service: new EstacionsService(repository as any, establecimientos as any),
      repository,
      establecimientos,
    };
  };

  it('limita la lista del asesor a sus establecimientos asignados', async () => {
    const { service, repository } = crearServicio();
    await service.getFiltered(
      { filter: JSON.stringify({ origen: 'Chaman' }) },
      {
        nivel: 'Asesor',
        rol: 'Lectura',
        idEstablecimientos: ['est-1', 'est-3'],
      },
    );
    const filtro = JSON.parse(repository.getFiltered.mock.calls[0][0].filter);
    expect(filtro.$and).toContainEqual({
      idEstablecimiento: { $in: ['est-1', 'est-3'] },
    });
  });

  it('impide leer por id una estacion de otro establecimiento', async () => {
    const { service, repository } = crearServicio();
    repository.getById.mockResolvedValue({
      _id: 'station-2',
      idEstablecimiento: 'est-2',
    });
    await expect(
      service.getById('station-2', {
        nivel: 'Asesor',
        rol: 'Lectura',
        idEstablecimientos: ['est-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resuelve establecimientos del distribuidor antes de filtrar estaciones', async () => {
    const { service, repository, establecimientos } = crearServicio();
    await service.getFiltered(
      {},
      { nivel: 'Distribuidor', rol: 'Lectura', idDistribuidor: 'dist-1' },
    );
    expect(establecimientos.get).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: JSON.stringify({ idDistribuidor: 'dist-1' }),
      }),
    );
    const filtro = JSON.parse(repository.getFiltered.mock.calls[0][0].filter);
    expect(filtro.$and[0].idEstablecimiento.$in).toEqual(['est-1', 'est-2']);
  });
});
