import { LicenciasService } from './service';

describe('LicenciasService - integridad del catalogo', () => {
  const build = (
    options: {
      defaultExiste?: boolean;
      codigoVersionExiste?: boolean;
      asignaciones?: number;
      planDefault?: boolean;
    } = {},
  ) => {
    const repository = {
      getById: jest.fn(async () => ({
        _id: 'plan-1',
        nombre: 'Pro',
        codigo: 'pro',
        version: 1,
        default: options.planDefault || false,
        maxdHectareas: 100,
      })),
      get: jest.fn(async (query: any) => {
        const filter = JSON.parse(query?.filter || '{}');
        if (filter.default === true) {
          return {
            totalCount: options.defaultExiste ? 1 : 0,
            datos: options.defaultExiste
              ? [{ _id: 'base', default: true }]
              : [],
          };
        }
        if (filter.codigo && filter.version) {
          return {
            totalCount: options.codigoVersionExiste ? 1 : 0,
            datos: options.codigoVersionExiste
              ? [{ _id: 'existente', ...filter }]
              : [],
          };
        }
        return { totalCount: 0, datos: [] };
      }),
      create: jest.fn(async (data: any) => ({ _id: 'nuevo', ...data })),
      update: jest.fn(async (_id: string, data: any) => ({ _id, ...data })),
      delete: jest.fn(async (id: string) => ({ _id: id })),
    };
    const asignaciones = {
      get: jest.fn(async () => ({
        totalCount: options.asignaciones || 0,
        datos: [],
      })),
    };
    return {
      service: new LicenciasService(repository as any, asignaciones as any),
      repository,
    };
  };

  it('normaliza los nombres historicos de capacidad sin romper consumidores existentes', async () => {
    const { service } = build();
    const plan = await service.getById('plan-1');
    expect(plan.maxHectareas).toBe(100);
    expect(plan.maxdHectareas).toBe(100);
  });

  it('impide crear mas de un plan por defecto', async () => {
    const { service } = build({ defaultExiste: true });
    await expect(
      service.create({ nombre: 'Otro base', default: true }),
    ).rejects.toThrow('Ya existe un plan por defecto');
  });

  it('impide duplicar codigo y version en el catalogo compartido', async () => {
    const { service } = build({ codigoVersionExiste: true });
    await expect(
      service.create({ nombre: 'Pro duplicado', codigo: 'PRO', version: 1 }),
    ).rejects.toThrow('Ya existe el plan pro version 1');
  });

  it('protege el plan por defecto contra archivado accidental', async () => {
    const { service, repository } = build({ planDefault: true });
    await expect(
      service.update('plan-1', { estado: 'archivado' }),
    ).rejects.toThrow('El plan por defecto no puede archivarse');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('preserva planes con historial y exige archivarlos', async () => {
    const { service, repository } = build({ asignaciones: 1 });
    await expect(service.delete('plan-1')).rejects.toThrow(
      'no puede eliminarse',
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
