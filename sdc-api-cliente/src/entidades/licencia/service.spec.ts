import { LicenciasService } from './service';

describe('LicenciasService - integridad del catalogo', () => {
  const build = (
    options: { defaultExiste?: boolean; asignaciones?: number } = {},
  ) => {
    const repository = {
      getById: jest.fn(async () => ({
        _id: 'plan-1',
        nombre: 'Pro',
        maxdHectareas: 100,
      })),
      get: jest.fn(async () => ({
        totalCount: options.defaultExiste ? 1 : 0,
        datos: options.defaultExiste ? [{ _id: 'base', default: true }] : [],
      })),
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

  it('preserva planes con historial y exige archivarlos', async () => {
    const { service, repository } = build({ asignaciones: 1 });
    await expect(service.delete('plan-1')).rejects.toThrow(
      'no puede eliminarse',
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
