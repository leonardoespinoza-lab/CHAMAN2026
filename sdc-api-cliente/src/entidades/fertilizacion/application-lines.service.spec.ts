import { BadRequestException } from '@nestjs/common';
import { FertilizacionsService } from './service';

describe('FertilizacionsService - multiples productos', () => {
  const permiso = { nivel: 'Productor', rol: 'Escritura', idProductor: 'p1' } as any;

  function subject() {
    const repository = {
      create: jest.fn((data) => Promise.resolve({ _id: 'aplicacion-1', ...data })),
    };
    const lotes = {
      getById: jest.fn().mockResolvedValue({
        _id: 'l1', idProductor: 'p1', idEstablecimiento: 'e1', idDistribuidor: 'd1', idQuimica: 'q1',
      }),
    };
    const fertilizantes = {
      getById: jest.fn((id: string) => Promise.resolve({
        _id: id,
        nombre: id === 'f1' ? 'Urea' : 'MAP',
        porcentajeN: id === 'f1' ? 46 : 11,
        porcentajeP: id === 'f1' ? 0 : 52,
      })),
    };
    return {
      service: new FertilizacionsService(repository as any, lotes as any, fertilizantes as any),
      repository,
    };
  }

  it('guarda una labor con varias lineas y conserva la primera en campos legacy', async () => {
    const { service, repository } = subject();
    await service.create({
      idLote: 'l1',
      lineas: [
        { idFertilizante: 'f1', dosisKgHa: 90 },
        { idFertilizante: 'f2', dosisKgHa: 35 },
      ],
    }, permiso);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      idFertilizante: 'f1',
      dosisKgHa: 90,
      lineas: [
        expect.objectContaining({ idFertilizante: 'f1', dosisKgHa: 90, fertilizante: expect.objectContaining({ nombre: 'Urea' }) }),
        expect.objectContaining({ idFertilizante: 'f2', dosisKgHa: 35, fertilizante: expect.objectContaining({ nombre: 'MAP' }) }),
      ],
    }));
  });

  it('rechaza dosis invalidas y productos repetidos antes de escribir', async () => {
    const { service, repository } = subject();
    await expect(service.create({
      idLote: 'l1',
      lineas: [
        { idFertilizante: 'f1', dosisKgHa: 10 },
        { idFertilizante: 'f1', dosisKgHa: 0 },
      ],
    }, permiso)).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
