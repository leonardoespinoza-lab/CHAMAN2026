import { UsuariosRepository } from './repository';

describe('UsuariosRepository - elegibilidad de inicio de sesion', () => {
  it('excluye usuarios archivados o desactivados de la consulta de login', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const populate = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ populate });
    const model: any = {
      findOne: jest.fn().mockReturnValue({ select }),
    };
    const repository = new UsuariosRepository(model);

    await repository.getByUsernameForLogin('operador');

    expect(model.findOne).toHaveBeenCalledWith({
      username: 'operador',
      archivado: { $ne: true },
      activo: { $ne: false },
    });
    expect(select).toHaveBeenCalledWith('+hash');
  });

  it('permite que autenticacion detecte una cuenta social desactivada sin ocultarla', async () => {
    const lean = jest.fn().mockResolvedValue({ activo: false });
    const populate = jest.fn().mockReturnValue({ lean });
    const model: any = {
      findOne: jest.fn().mockReturnValue({ populate }),
    };
    const repository = new UsuariosRepository(model);

    await repository.getByEmail('persona@example.com');

    expect(model.findOne).toHaveBeenCalledWith({ email: 'persona@example.com' });
  });
});
