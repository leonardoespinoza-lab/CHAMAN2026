import { BadRequestException } from '@nestjs/common';
import { IPermiso } from 'modelos/src';
import { UsuariosService } from './service';

describe('UsuariosService - Compania y Asesor como ambitos hermanos', () => {
  const establecimientosRepository = {
    getById: jest.fn(),
  };
  const distribuidoresRepository = {
    getById: jest.fn(),
  };
  const service = new UsuariosService(
    {} as any,
    {} as any,
    {} as any,
    establecimientosRepository as any,
    {} as any,
    distribuidoresRepository as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deriva la Compania desde la sesion y descarta un distribuidor inyectado', async () => {
    const permisos: IPermiso[] = [
      {
        nivel: 'Asesor',
        rol: 'Admin',
        idQuimica: 'quimica-manipulada',
        idDistribuidor: 'distribuidor-manipulado',
        idEstablecimientos: [],
      },
    ];

    await (service as any).validarPermisosAsignados(permisos, {
      nivel: 'Quimica',
      rol: 'Admin',
      idQuimica: 'quimica-sesion',
    });

    expect(permisos[0]).toMatchObject({
      nivel: 'Asesor',
      idQuimica: 'quimica-sesion',
      idEstablecimientos: [],
      idLotes: [],
    });
    expect(permisos[0].idDistribuidor).toBeUndefined();
    expect(distribuidoresRepository.getById).not.toHaveBeenCalled();
  });

  it('no permite que un Distribuidor cree un Asesor hermano', async () => {
    const permisos: IPermiso[] = [
      {
        nivel: 'Asesor',
        rol: 'Admin',
        idQuimica: 'quimica-a',
        idEstablecimientos: [],
      },
    ];

    await expect(
      (service as any).validarPermisosAsignados(permisos, {
        nivel: 'Distribuidor',
        rol: 'Admin',
        idQuimica: 'quimica-a',
        idDistribuidor: 'distribuidor-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
