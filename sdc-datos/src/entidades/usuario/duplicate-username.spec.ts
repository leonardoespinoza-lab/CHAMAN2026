import { ConflictException } from '@nestjs/common';
import { UsuariosService } from './service';

describe('UsuariosService - username único', () => {
  it('traduce E11000 a un mensaje funcional y no expone el error de Mongo', async () => {
    const repository = {
      create: jest.fn().mockRejectedValue({
        code: 11000,
        keyPattern: { username: 1 },
        keyValue: { username: 'productor 1' },
      }),
    };
    const service = new UsuariosService(repository as any);

    await expect(
      service.create({ username: 'productor 1' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.create({ username: 'productor 1' } as any),
    ).rejects.toThrow('Ese nombre de usuario ya existe');
  });
});
