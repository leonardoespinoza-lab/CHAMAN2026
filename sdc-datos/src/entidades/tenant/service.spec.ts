import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './service';

describe('TenantsService datos', () => {
  const repository = {
    get: jest.fn(),
    getById: jest.fn(),
    getBySlug: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
  };
  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantsService(repository as any);
  });

  it('normaliza slug y dominios antes de persistir', async () => {
    repository.getBySlug.mockResolvedValue(undefined);
    repository.create.mockImplementation(async (data: any) => data);
    const result = await service.create({
      nombre: 'Empresa Norte',
      slug: ' Empresa Norte ',
      dominios: [' HTTPS://NORTE.EXAMPLE.COM/ ', 'norte.example.com'],
    });
    expect(result.slug).toBe('empresa-norte');
    expect(result.dominios).toEqual(['norte.example.com']);
  });

  it('omite dominios vacios para permitir varios tenants sin dominio propio', async () => {
    repository.getBySlug.mockResolvedValue(undefined);
    repository.create.mockImplementation(async (data: any) => data);
    const result = await service.create({
      nombre: 'Empresa sin dominio',
      slug: 'empresa-sin-dominio',
      dominios: [],
    });
    expect(result.dominios).toBeUndefined();
  });

  it('rechaza un slug ya existente', async () => {
    repository.getBySlug.mockResolvedValue({ _id: 'existente' });
    await expect(
      service.create({ nombre: 'Empresa Norte', slug: 'empresa-norte' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
