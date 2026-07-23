import { BadRequestException } from '@nestjs/common';
import { LotesService } from './service';

describe('LotesService - alcance organizacional fail-closed', () => {
  function subject(lote: Record<string, unknown>) {
    const repository = {
      getById: jest.fn().mockResolvedValue({ _id: 'lote-1', ...lote }),
      get: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
    };
    const service = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, repository };
  }

  it.each([
    ['Quimica', 'idQuimica', 'quimica-1'],
    ['Distribuidor', 'idDistribuidor', 'distribuidor-1'],
    ['Productor', 'idProductor', 'productor-1'],
    ['Establecimiento', 'idEstablecimiento', 'establecimiento-1'],
  ])(
    'deniega a %s un lote huerfano sin %s',
    async (nivel, campoPermiso, idPermiso) => {
      const { service } = subject({});

      await expect(
        service.getById('lote-1', {
          nivel,
          rol: 'Lectura',
          [campoPermiso]: idPermiso,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    ['Quimica', 'idQuimica', 'quimica-1'],
    ['Distribuidor', 'idDistribuidor', 'distribuidor-1'],
    ['Productor', 'idProductor', 'productor-1'],
    ['Establecimiento', 'idEstablecimiento', 'establecimiento-1'],
  ])(
    'deniega a %s cuando el permiso no identifica su relacion %s',
    async (nivel, campoLote, idLote) => {
      const { service } = subject({ [campoLote]: idLote });

      await expect(
        service.getById('lote-1', {
          nivel,
          rol: 'Lectura',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('mantiene acceso global para Admin y aislamiento exacto para Tenant', () => {
    const { service } = subject({});
    const puedeVer = (service as any).puedeVer.bind(service);

    expect(puedeVer({ _id: 'huerfano' }, { nivel: 'Admin' })).toBe(true);
    expect(
      puedeVer(
        { _id: 'lote-a', idTenant: 'tenant-a' },
        { nivel: 'Tenant', idTenant: 'tenant-a' },
      ),
    ).toBe(true);
    expect(
      puedeVer(
        { _id: 'lote-a', idTenant: 'tenant-a' },
        { nivel: 'Tenant', idTenant: 'tenant-b' },
      ),
    ).toBe(false);
    expect(
      puedeVer(
        { _id: 'lote-huerfano' },
        { nivel: 'Tenant', idTenant: 'tenant-a' },
      ),
    ).toBe(false);
  });

  it('genera un filtro imposible cuando falta el identificador del permiso', async () => {
    const { service, repository } = subject({});

    await service.get({} as any, {
      nivel: 'Productor',
      rol: 'Lectura',
    } as any);

    expect(JSON.parse(repository.get.mock.calls[0][0].filter)).toEqual({
      $and: [{ _id: { $in: [] } }],
    });
  });
});
