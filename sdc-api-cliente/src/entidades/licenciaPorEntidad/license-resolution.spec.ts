import { LicenciaPorEntidadsService } from './service';

describe('LicenciaPorEntidadsService - resolucion y auditoria', () => {
  const planDefault = {
    _id: 'plan-default',
    nombre: 'Base',
    default: true,
    codigo: 'base',
    version: 1,
  };
  const planDistribuidor = {
    _id: 'plan-pro',
    nombre: 'Pro',
    codigo: 'pro',
    version: 2,
  };

  const build = (seed: any[] = []) => {
    const asignaciones = [...seed];
    const repository = {
      get: jest.fn(async (query: any) => {
        const filter = query.filter ? JSON.parse(query.filter) : {};
        return {
          datos: asignaciones
            .filter(
              (item) =>
                !filter.idEntidad || item.idEntidad === filter.idEntidad,
            )
            .map((item) => ({
              ...item,
              licencia:
                item.idLicencia === planDistribuidor._id
                  ? planDistribuidor
                  : planDefault,
            })),
          totalCount: asignaciones.length,
        };
      }),
      getById: jest.fn(),
      create: jest.fn(async (data: any) => {
        const created = { _id: `asig-${asignaciones.length + 1}`, ...data };
        asignaciones.unshift(created);
        return created;
      }),
      update: jest.fn(async (id: string, data: any) => {
        const found = asignaciones.find((item) => item._id === id);
        Object.assign(found, data);
        return found;
      }),
      delete: jest.fn(),
    };
    const licencias = {
      getById: jest.fn(async (id: string) =>
        id === planDistribuidor._id ? planDistribuidor : planDefault,
      ),
      getInternal: jest.fn(async () => ({
        datos: [planDefault],
        totalCount: 1,
      })),
    };
    const usage = {
      medir: jest.fn(async () => ({
        medidoEn: '2026-07-21T00:00:00.000Z',
        usuarios: { actual: 1, limite: 2, porcentaje: 50, excedido: false },
      })),
    };
    return {
      service: new LicenciaPorEntidadsService(
        repository as any,
        licencias as any,
        usage as any,
      ),
      repository,
      licencias,
      usage,
      asignaciones,
    };
  };

  it('prioriza la entidad directa y hereda solo cuando no existe asignacion vigente', async () => {
    const { service } = build([
      {
        _id: 'asig-dist',
        idEntidad: 'dist-1',
        tipoEntidad: 'Distribuidor',
        idLicencia: 'plan-pro',
        estado: 'activa',
        fechaInicio: '2026-01-01T00:00:00.000Z',
        fechaExpiracion: '2030-01-01T00:00:00.000Z',
      },
    ]);

    const estado = await service.getEstadoActualPorPermiso({
      nivel: 'Productor',
      rol: 'Admin',
      idProductor: 'prod-1',
      idDistribuidor: 'dist-1',
    } as any);

    expect(estado.licencia?._id).toBe('plan-pro');
    expect(estado.origenEfectivo).toBe('heredada');
    expect(estado.tipoEntidadFuente).toBe('Distribuidor');
  });

  it('ignora asignaciones vencidas y carga siempre el plan default real', async () => {
    const { service, licencias } = build([
      {
        _id: 'asig-vencida',
        idEntidad: 'prod-1',
        idLicencia: 'plan-pro',
        estado: 'activa',
        fechaExpiracion: '2020-01-01T00:00:00.000Z',
      },
    ]);

    const estado = await service.getEstadoActualPorPermiso({
      nivel: 'Productor',
      rol: 'Admin',
      idProductor: 'prod-1',
    } as any);

    expect(estado.licencia?._id).toBe('plan-default');
    expect(estado.origenEfectivo).toBe('default');
    expect(licencias.getInternal).toHaveBeenCalledTimes(1);
  });

  it('reemplaza la asignacion, conserva historial y nunca modifica el plan compartido', async () => {
    const { service, repository, licencias, asignaciones } = build([
      {
        _id: 'asig-anterior',
        idEntidad: 'dist-1',
        idLicencia: 'plan-default',
        estado: 'activa',
        fechaInicio: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const estado = await service.asignar(
      'dist-1',
      {
        tipoEntidad: 'Distribuidor',
        idLicencia: 'plan-pro',
        fechaInicio: '2026-07-01T00:00:00.000Z',
        fechaExpiracion: '2027-07-01T00:00:00.000Z',
        motivoCambio: 'Upgrade comercial',
        modalidadComercial: 'suscripcion',
      },
      { _id: 'admin-1' } as any,
    );

    expect(repository.update).toHaveBeenCalledWith(
      'asig-anterior',
      expect.objectContaining({ estado: 'reemplazada' }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idLicencia: 'plan-pro',
        idAsignacionAnterior: 'asig-anterior',
        creadoPorUsuario: 'admin-1',
        motivoCambio: 'Upgrade comercial',
        modalidadComercial: 'suscripcion',
      }),
    );
    expect(licencias.getById).toHaveBeenCalledWith('plan-pro');
    expect((licencias as any).update).toBeUndefined();
    expect(asignaciones.some((item) => item.estado === 'reemplazada')).toBe(
      true,
    );
    expect(estado.origenEfectivo).toBe('directa');
  });

  it('conserva la modalidad comercial elegida en la asignacion', async () => {
    const { service, repository } = build();

    await service.asignar(
      'prod-1',
      {
        tipoEntidad: 'Productor',
        idLicencia: 'plan-pro',
        modalidadComercial: 'prueba',
      },
      { _id: 'admin-1' } as any,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ modalidadComercial: 'prueba' }),
    );
  });

  it('vuelve a herencia cerrando la asignacion directa sin borrar historial', async () => {
    const { service, repository, asignaciones } = build([
      {
        _id: 'asig-directa',
        idEntidad: 'prod-1',
        idLicencia: 'plan-pro',
        estado: 'activa',
        fechaExpiracion: '2030-01-01T00:00:00.000Z',
      },
    ]);

    const estado = await service.heredar(
      'prod-1',
      { tipoEntidad: 'Productor', motivoCambio: 'Herencia elegida' },
      { _id: 'admin-1' } as any,
    );

    expect(repository.update).toHaveBeenCalledWith(
      'asig-directa',
      expect.objectContaining({
        estado: 'reemplazada',
        motivoCambio: 'Herencia elegida',
      }),
    );
    expect(repository.delete).not.toHaveBeenCalled();
    expect(asignaciones[0].estado).toBe('reemplazada');
    expect(estado.origenEfectivo).toBe('default');
  });

  it('rechaza modalidades comerciales desconocidas', async () => {
    const { service, repository } = build();
    await expect(
      service.asignar('prod-1', {
        tipoEntidad: 'Productor',
        idLicencia: 'plan-pro',
        modalidadComercial: 'otra' as any,
      }),
    ).rejects.toThrow('Modalidad comercial no valida');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('programa un cambio futuro sin cortar la licencia activa', async () => {
    const { service, repository } = build([
      {
        _id: 'asig-activa',
        idEntidad: 'dist-1',
        idLicencia: 'plan-default',
        estado: 'activa',
        fechaInicio: '2026-01-01T00:00:00.000Z',
        fechaExpiracion: '2030-01-01T00:00:00.000Z',
      },
    ]);

    await service.asignar(
      'dist-1',
      {
        tipoEntidad: 'Distribuidor',
        idLicencia: 'plan-pro',
        fechaInicio: '2030-01-01T00:00:00.000Z',
        fechaExpiracion: '2031-01-01T00:00:00.000Z',
      },
      { _id: 'admin-1' } as any,
    );

    expect(repository.update).not.toHaveBeenCalledWith(
      'asig-activa',
      expect.objectContaining({ estado: 'reemplazada' }),
    );
    const actual = await service.getEstadoPorEntidad('Distribuidor', 'dist-1');
    expect(actual.licencia?._id).toBe('plan-default');
  });

  it('rechaza tipos de entidad desconocidos', async () => {
    const { service } = build();
    await expect(
      service.getEstadoPorEntidad('Otro' as any, 'id-1'),
    ).rejects.toThrow('Tipo de entidad de licencia no valido');
  });
});
