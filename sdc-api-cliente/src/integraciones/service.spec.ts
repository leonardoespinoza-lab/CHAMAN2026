import { IntegrationsService } from './service';
import { resourceId, RESOURCE_TYPES } from './contract';

describe('Multi-client integration resources', () => {
  let service: IntegrationsService;
  let db: Record<string, Map<string, any>>;
  let repositories: any[];
  let business: any[];
  let ctx: any;
  let decisions: any;
  const seedId = 'c'.repeat(24);
  const bodies = {
    productores: { nombre: 'Cliente de prueba' },
    establecimientos: { nombre: 'Campo', productorIdExterno: 'p1' },
    lotes: {
      nombre: 'Lote',
      establecimientoIdExterno: 'e1',
      ubicacion: { lat: -32, lng: -63 },
      superficieHa: 10,
    },
    siembras: {
      loteIdExterno: 'l1',
      idSemilla: seedId,
      fechaSiembra: '2026-05-01',
    },
  };
  const ids = ['p1', 'e1', 'l1', 's1'];
  beforeEach(() => {
    ctx = {
      client: { id: 'partner-a', advisorUserId: 'a'.repeat(24) },
      permission: { nivel: 'Asesor', rol: 'Admin', idAsesor: 'a'.repeat(24) },
      license: { _id: 'd'.repeat(24) },
    };
    db = Object.fromEntries(RESOURCE_TYPES.map((kind) => [kind, new Map()]));
    repositories = RESOURCE_TYPES.map((kind) => ({
      getById: jest.fn(async (id) => db[kind].get(id)),
      get: jest.fn(async (query) => ({
        datos: [...db[kind].values()].filter((item) => {
          const f = JSON.parse(query.filter || '{}');
          return Object.entries(f).every(([key, value]) => item[key] === value);
        }),
      })),
    }));
    business = RESOURCE_TYPES.map((kind, index) => ({
      create: jest.fn(async (input, permission) => {
        const data = structuredClone(input);
        if (db[kind].has(data._id)) throw new Error('duplicate _id');
        if (kind === 'productores')
          data.idAsesorPropietario = permission.idAsesor;
        if (kind === 'siembras')
          data.semilla = { cultivo: 'Trigo', variedad: 'Demo' };
        db[kind].set(data._id, data);
        return data;
      }),
    }));
    business[3].agrometeorologia = jest.fn(async () => ({
      series: [],
      dataSource: {},
    }));
    business[2].update = jest.fn(async (id, values) =>
      Object.assign(db.lotes.get(id), values),
    );
    decisions = { enqueueForSowing: jest.fn(async () => ({ id: 'queued' })) };
    const tails = new Map<string, Promise<any>>();
    const runtime = {
      exclusive: async (key, task) => {
        const previous = tails.get(key) || Promise.resolve();
        const next = previous.catch(() => {}).then(() => task(async () => {}));
        tails.set(key, next);
        return next;
      },
    };
    service = new IntegrationsService(
      business[0],
      business[1],
      business[2],
      business[3],
      {
        getById: jest.fn(async () => ({ _id: seedId, cultivo: 'Trigo' })),
      } as any,
      repositories[0],
      repositories[1],
      repositories[2],
      repositories[3],
      runtime as any,
      decisions,
    );
  });
  async function chain(context = ctx) {
    for (let index = 0; index < RESOURCE_TYPES.length; index++)
      await service.create(
        RESOURCE_TYPES[index],
        ids[index],
        bodies[RESOURCE_TYPES[index]],
        context,
      );
  }
  test('creates the hierarchy and queries the canonical result', async () => {
    await chain();
    for (let i = 0; i < RESOURCE_TYPES.length; i++)
      expect(await service.get(RESOURCE_TYPES[i], ids[i], ctx)).toMatchObject({
        idExterno: ids[i],
        estado: 'registrado',
      });
    expect(await service.phenology('s1', ctx)).toMatchObject({
      estado: 'pendiente',
      etapa: null,
    });
    expect(business[3].agrometeorologia).toHaveBeenCalledWith(
      resourceId(ctx.client, 'siembras', 's1'),
      undefined,
      undefined,
      false,
      ctx.permission,
    );
  });
  test('repeating the same external IDs, even concurrently, does not duplicate or charge a new licence', async () => {
    await chain();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.create('productores', 'p1', bodies.productores, ctx),
      ),
    );
    expect(results.every((result) => result.creado === false)).toBe(true);
    expect(db.productores.size).toBe(1);
    expect(business[0].create).toHaveBeenCalledTimes(1);
    expect(business[0].create.mock.calls[0][2]).toBe(ctx.license);
  });
  test('same external identifiers are independent for different integrations', async () => {
    await chain();
    const other = {
      ...ctx,
      permission: { ...ctx.permission, idAsesor: 'b'.repeat(24) },
      client: { ...ctx.client, id: 'partner-b', advisorUserId: 'b'.repeat(24) },
    };
    await expect(service.get('lotes', 'l1', other)).rejects.toThrow();
    await chain(other);
    for (const kind of RESOURCE_TYPES) expect(db[kind].size).toBe(2);
  });
  test('does not let a changed payload overwrite an existing resource', async () => {
    await chain();
    await expect(
      service.create('productores', 'p1', { nombre: 'Otra persona' }, ctx),
    ).rejects.toThrow('otros datos');
    await expect(
      service.create(
        'siembras',
        's1',
        { ...bodies.siembras, fechaSiembra: '2026-06-01' },
        ctx,
      ),
    ).rejects.toThrow('otros datos');
    expect(db.productores.values().next().value.nombre).toBe(
      bodies.productores.nombre,
    );
  });
  test('foreign or archived parent breaks access even when an ID exists', async () => {
    await chain();
    const producer = db.productores.values().next().value;
    producer.idAsesorPropietario = 'b'.repeat(24);
    await expect(service.get('lotes', 'l1', ctx)).rejects.toThrow();
    await expect(service.phenology('s1', ctx)).rejects.toThrow();
    producer.idAsesorPropietario = ctx.client.advisorUserId;
    producer.archivado = true;
    await expect(service.get('siembras', 's1', ctx)).rejects.toThrow();
  });
  test('refuses a second active sowing for the same field', async () => {
    await chain();
    await expect(
      service.create('siembras', 's2', bodies.siembras, ctx),
    ).rejects.toThrow('siembra activa');
    expect(db.siembras.size).toBe(1);
  });
  test('a failure after the database write can be recovered by the same external ID', async () => {
    const original = business[0].create.getMockImplementation();
    business[0].create.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('response lost');
    });
    expect(
      await service.create('productores', 'p1', bodies.productores, ctx),
    ).toMatchObject({ creado: false });
    expect(db.productores.size).toBe(1);
  });
  test('replays repair a sowing-to-field link and confirm the durable calculation queue', async () => {
    await chain();
    delete db.lotes.values().next().value.idSiembra;
    await service.create('siembras', 's1', bodies.siembras, ctx);
    expect(db.lotes.values().next().value.idSiembra).toBe(
      resourceId(ctx.client, 'siembras', 's1'),
    );
    expect(decisions.enqueueForSowing).toHaveBeenCalledWith(
      resourceId(ctx.client, 'siembras', 's1'),
      expect.objectContaining({
        operationId: expect.stringMatching(/^integration-init-/),
        trigger: 'reconciliation',
      }),
    );
    decisions.enqueueForSowing.mockRejectedValueOnce(new Error('queue failed'));
    await expect(
      service.create('siembras', 's1', bodies.siembras, ctx),
    ).rejects.toThrow('procesamiento no confirmado');
    expect(db.siembras.size).toBe(1);
  });
  test('does not mistake a database outage for a missing record or return private documents', async () => {
    repositories[0].getById.mockRejectedValueOnce(
      new Error('private connection string'),
    );
    await expect(
      service.create('productores', 'p1', bodies.productores, ctx),
    ).rejects.toThrow('No se pudo consultar');
    expect(business[0].create).not.toHaveBeenCalled();
    await chain();
    const result = await service.get('productores', 'p1', ctx);
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('idAsesorPropietario');
  });
});
