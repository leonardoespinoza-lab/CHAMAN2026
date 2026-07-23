import { ForbiddenException } from '@nestjs/common';
import { IPermiso } from 'modelos/src';
import { UsuariosService } from './service';

describe('UsuariosService tenant module scope', () => {
  const tenantRepository = {
    getById: jest.fn(),
  };
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
    tenantRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tenantRepository.getById.mockResolvedValue({
      _id: 'tenant-a',
      estado: 'activo',
      capacidades: {
        administrarAsesores: true,
        administrarProductores: true,
      },
      modulos: { Clima: true, NDVI: true, Malezas: false },
      entidadRaiz: {
        tipo: 'Distribuidor',
        idEntidad: 'dist-a',
      },
    });
    establecimientosRepository.getById.mockReset();
    distribuidoresRepository.getById.mockReset();
  });

  it('rechaza modulos que el tenant no tiene habilitados', async () => {
    await expect(
      (service as any).validarPermisosAsignados(
        [
          {
            nivel: 'Asesor',
            rol: 'Lectura',
            idTenant: 'tenant-a',
            modulos: { Clima: true, Malezas: true },
          },
        ],
        { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('conserva solamente el subconjunto contratado y solicitado', async () => {
    const permisos: IPermiso[] = [
      {
        nivel: 'Asesor' as const,
        rol: 'Lectura' as const,
        idTenant: 'tenant-a',
        modulos: { Clima: true, NDVI: false },
      },
    ];
    await (service as any).validarPermisosAsignados(permisos, {
      nivel: 'Tenant',
      rol: 'Admin',
      idTenant: 'tenant-a',
    });
    expect(permisos[0].modulos).toEqual({ Clima: true, NDVI: false });
  });

  it('deriva el tenant de la sesion al crear un asesor', async () => {
    const permisos: IPermiso[] = [
      {
        nivel: 'Asesor' as const,
        rol: 'Admin' as const,
        modulos: { Clima: true },
      },
    ];

    await (service as any).validarPermisosAsignados(permisos, {
      nivel: 'Tenant',
      rol: 'Admin',
      idTenant: 'tenant-a',
    });

    expect(permisos[0].idTenant).toBe('tenant-a');
  });

  it('rechaza un tenant distinto aunque llegue manipulado desde el cliente', async () => {
    await expect(
      (service as any).validarPermisosAsignados(
        [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idTenant: 'tenant-b',
            modulos: { Clima: true },
          },
        ],
        { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no permite que un administrador tenant cree otro nivel Tenant', async () => {
    await expect(
      (service as any).validarPermisosAsignados(
        [
          {
            nivel: 'Tenant',
            rol: 'Admin',
            idTenant: 'tenant-a',
            modulos: { Clima: true },
          },
        ],
        { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza asignar al asesor un establecimiento de otro tenant', async () => {
    establecimientosRepository.getById.mockResolvedValue({
      _id: 'est-b',
      idTenant: 'tenant-b',
    });

    await expect(
      (service as any).validarPermisosAsignados(
        [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idEstablecimientos: ['est-b'],
            modulos: { Clima: true },
          },
        ],
        { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza vincular al asesor con un distribuidor ajeno al tenant', async () => {
    distribuidoresRepository.getById.mockResolvedValue({
      _id: 'dist-b',
      idQuimica: 'quimica-b',
    });

    await expect(
      (service as any).validarPermisosAsignados(
        [
          {
            nivel: 'Asesor',
            rol: 'Admin',
            idDistribuidor: 'dist-b',
            modulos: { Clima: true },
          },
        ],
        { nivel: 'Tenant', rol: 'Admin', idTenant: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite el distribuidor raiz declarado por el tenant', async () => {
    distribuidoresRepository.getById.mockResolvedValue({
      _id: 'dist-a',
      idQuimica: 'quimica-a',
    });
    const permisos: IPermiso[] = [
      {
        nivel: 'Asesor',
        rol: 'Admin',
        idDistribuidor: 'dist-a',
        modulos: { Clima: true },
      },
    ];

    await (service as any).validarPermisosAsignados(permisos, {
      nivel: 'Tenant',
      rol: 'Admin',
      idTenant: 'tenant-a',
    });

    expect(permisos[0]).toMatchObject({
      idTenant: 'tenant-a',
      idDistribuidor: 'dist-a',
      idQuimica: 'quimica-a',
    });
  });
});
