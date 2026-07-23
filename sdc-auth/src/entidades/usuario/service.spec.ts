import { HttpException } from '@nestjs/common';
import { UsuariosService } from './service';

describe('UsuariosService - autenticacion segura', () => {
  it('trata usuario inactivo o inexistente como credencial invalida, no como caida', async () => {
    const repository = {
      getByUsername: jest
        .fn()
        .mockRejectedValue(new HttpException('No encontrado', 404)),
    };
    const service = new UsuariosService(repository as any, {} as any);

    await expect(service.getByUsername('inactivo')).resolves.toBeUndefined();
  });

  it('propaga errores reales de infraestructura', async () => {
    const repository = {
      getByUsername: jest
        .fn()
        .mockRejectedValue(new HttpException('No disponible', 503)),
    };
    const service = new UsuariosService(repository as any, {} as any);

    await expect(service.getByUsername('usuario')).rejects.toMatchObject({
      status: 503,
    });
  });
});
