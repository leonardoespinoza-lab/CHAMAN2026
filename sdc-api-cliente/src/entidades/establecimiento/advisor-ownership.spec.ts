import { BadRequestException } from '@nestjs/common';
import { EstablecimientosService } from './service';

describe('EstablecimientosService - asesor supervisor de red', () => {
  function createService() {
    const repository = {
      create: jest.fn(async (data) => ({ _id: 'est-nuevo', ...data })),
      get: jest.fn().mockResolvedValue({ totalCount: 0, datos: [] }),
      getById: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    const productores = {
      getById: jest.fn().mockResolvedValue({
        _id: 'prod-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
        idAsesorPropietario: 'asesor-1',
      }),
    };
    const service = new EstablecimientosService(
      repository as any,
      {} as any,
      productores as any,
      {} as any,
      undefined,
    );
    return { service, repository, productores };
  }

  it('bloquea el alta directa de establecimientos para el asesor', async () => {
    const { service, repository } = createService();

    await expect(
      service.create(
        { nombre: 'Campo directo' } as any,
        { nivel: 'Asesor', rol: 'Admin', idAsesor: 'asesor-1' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('bloquea edicion y borrado aunque el establecimiento este dentro de su red', async () => {
    const { service, repository } = createService();
    const permiso: any = {
      nivel: 'Asesor',
      rol: 'Admin',
      idAsesor: 'asesor-1',
      idEstablecimientos: ['est-1'],
    };

    await expect(
      service.update('est-1', { nombre: 'Cambio' } as any, permiso),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.delete('est-1', permiso)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('hereda el asesor propietario cuando el usuario productor crea el establecimiento', async () => {
    const { service, repository } = createService();

    const result = await service.create(
      { nombre: 'Campo del productor', idProductor: 'prod-1' } as any,
      {
        nivel: 'Productor',
        rol: 'Admin',
        idProductor: 'prod-1',
      } as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idProductor: 'prod-1',
        idAsesorPropietario: 'asesor-1',
        idDistribuidor: 'dist-1',
        idQuimica: 'quim-1',
      }),
    );
    expect(result._id).toBe('est-nuevo');
  });
});
