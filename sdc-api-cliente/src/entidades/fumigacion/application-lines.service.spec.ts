import { FumigacionsService } from './service';

describe('FumigacionsService - mezcla de productos', () => {
  const permiso = { nivel: 'Productor', rol: 'Escritura', idProductor: 'p1' } as any;
  const usuario = { _id: 'u1', username: 'productor' } as any;

  function subject() {
    const repository = {
      create: jest.fn((data) => Promise.resolve({ _id: 'aplicacion-1', ...data })),
    };
    const alertas = { getUltimaActivaByIdSiembra: jest.fn().mockResolvedValue(undefined) };
    const siembras = { getById: jest.fn().mockResolvedValue({
      _id: 's1', idLote: 'l1', idProductor: 'p1', idEstablecimiento: 'e1', idDistribuidor: 'd1', idQuimica: 'q1',
    }) };
    const agroquimicos = { getById: jest.fn((id: string) => Promise.resolve({
      _id: id,
      nombre: id === 'a1' ? 'Producto A' : 'Producto B',
      idPrincipioActivo: id === 'a1' ? 'pa1' : 'pa2',
      concentracion: id === 'a1' ? 40 : 25,
    })) };
    const principios = { getById: jest.fn((id: string) => Promise.resolve({
      _id: id, nombre: id === 'pa1' ? 'Activo A' : 'Activo B', koc: 150, persistencia: 18,
    })) };
    return {
      service: new FumigacionsService(repository as any, alertas as any, siembras as any, agroquimicos as any, principios as any),
      repository,
      alertas,
    };
  }

  it('crea una sola labor, guarda toda la mezcla y trata alertas una sola vez', async () => {
    const { service, repository, alertas } = subject();
    await service.create({
      idSiembra: 's1',
      lineas: [
        { idAgroquimico: 'a1', dosisLtHa: 1.2, duracion: 12 },
        { idAgroquimico: 'a2', dosisLtHa: 0.6, duracion: 20 },
      ],
    }, usuario, permiso);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(alertas.getUltimaActivaByIdSiembra).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      idAgroquimico: 'a1',
      idPrincipioActivo: 'pa1',
      concentracion: 40,
      dosisLtHa: 1.2,
      duracion: 20,
      lineas: [
        expect.objectContaining({ idAgroquimico: 'a1', idPrincipioActivo: 'pa1', dosisLtHa: 1.2 }),
        expect.objectContaining({ idAgroquimico: 'a2', idPrincipioActivo: 'pa2', dosisLtHa: 0.6 }),
      ],
    }));
  });
});
