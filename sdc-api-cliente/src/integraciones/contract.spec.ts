import {
  calendarDate,
  externalId,
  hash,
  normalizeBody,
  resourceId,
} from './contract';
import { IntegrationRegistry } from './registry';
import { projectPhenology } from './phenology';

const credential = 'chm_test_key_demo.' + 'a'.repeat(43);
const client: any = {
  id: 'demo',
  name: 'Demo',
  advisorUserId: 'a'.repeat(24),
  permissionIndex: 0,
  enabled: true,
  expiresAt: '2099-01-01T00:00:00Z',
  requestsPerMinute: 60,
  scopes: ['estructura:crear', 'fenologia:leer'],
  keys: [
    {
      id: 'key_demo',
      sha256: hash(credential),
      expiresAt: '2099-01-01T00:00:00Z',
    },
  ],
};

describe('Integration input contract', () => {
  test('requires explicit advisor ownership or an existing external producer', () => {
    expect(
      normalizeBody('establecimientos', {
        nombre: 'Campo propio',
        carteraPropiaAsesor: true,
      }),
    ).toEqual({ nombre: 'Campo propio', carteraPropiaAsesor: true });
    expect(
      normalizeBody('establecimientos', {
        nombre: 'Campo del cliente',
        productorIdExterno: 'p1',
      }),
    ).toEqual({ nombre: 'Campo del cliente', productorIdExterno: 'p1' });
    for (const extra of [
      {},
      { carteraPropiaAsesor: false },
      { carteraPropiaAsesor: 'true' },
      { carteraPropiaAsesor: true, productorIdExterno: null },
      { carteraPropiaAsesor: true, productorIdExterno: 'p1' },
      { carteraPropiaAsesor: true, idAsesorPropietario: 'x' },
      { carteraPropiaAsesor: true, idTenant: 'x' },
    ]) {
      expect(() =>
        normalizeBody('establecimientos', { nombre: 'Campo', ...extra }),
      ).toThrow();
    }
  });
  test.each([
    '$where',
    '',
    'a/b',
    '../x',
    'a?x',
    'x'.repeat(81),
    { $ne: null },
  ])('rejects an unsafe external identifier %p', (value) =>
    expect(() => externalId(value)).toThrow(),
  );
  test('IDs are stable across restarts and isolated by integration, advisor and resource type', () => {
    const id = resourceId(client, 'lotes', 'campo-1');
    expect(resourceId({ ...client }, 'lotes', 'campo-1')).toBe(id);
    expect(resourceId({ ...client, id: 'other' }, 'lotes', 'campo-1')).not.toBe(
      id,
    );
    expect(
      resourceId(
        { ...client, advisorUserId: 'b'.repeat(24) },
        'lotes',
        'campo-1',
      ),
    ).not.toBe(id);
    expect(resourceId(client, 'siembras', 'campo-1')).not.toBe(id);
  });
  test.each(['2026-02-30', '2026-13-01', '2026-1-2', '', null])(
    'rejects invalid calendar date %p',
    (value) => expect(() => calendarDate(value)).toThrow(),
  );
  test('never accepts arbitrary tenant, owner, formulas, or Mongo operators', () => {
    for (const field of [
      'idTenant',
      'idAsesorPropietario',
      '_id',
      '$set',
      'permisos',
      'apikey',
    ])
      expect(() =>
        normalizeBody('productores', { nombre: 'Cliente', [field]: 'x' }),
      ).toThrow();
  });
  test('requires an actual location and area; does not fabricate a polygon', () => {
    const body = {
      nombre: 'Lote',
      establecimientoIdExterno: 'farm',
      ubicacion: { lat: -32.2, lng: -63.4 },
      superficieHa: 12,
    };
    expect(normalizeBody('lotes', body)).toEqual(body);
    expect(() =>
      normalizeBody('lotes', { ...body, ubicacion: undefined }),
    ).toThrow();
    expect(() =>
      normalizeBody('lotes', { ...body, ubicacion: { lat: '-32', lng: -63 } }),
    ).toThrow();
    expect(() =>
      normalizeBody('lotes', { ...body, ubicacion: { lat: 91, lng: -63 } }),
    ).toThrow();
    expect(() =>
      normalizeBody('lotes', { ...body, superficieHa: 0 }),
    ).toThrow();
  });
});

describe('Integration credentials', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.ENV = 'testing';
    process.env.CHAMAN_INTEGRATIONS_ENABLED = 'true';
    process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify([client]);
  });
  afterEach(() => {
    process.env = { ...original };
  });
  test('authenticates only hashed, enabled and unexpired keys', () => {
    const registry = new IntegrationRegistry();
    expect(registry.authenticate(credential).id).toBe('demo');
    expect(() => registry.authenticate(credential + 'x')).toThrow();
    expect(() => registry.authenticate(['key'])).toThrow();
    expect(() => registry.authenticate(undefined)).toThrow();
  });
  test.each([
    { enabled: false },
    { expiresAt: '2001-01-01' },
    { keys: [{ ...client.keys[0], expiresAt: '2001-01-01' }] },
  ])('rejects disabled/expired registry %p', (override) => {
    process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify([
      { ...client, ...override },
    ]);
    expect(() => new IntegrationRegistry().authenticate(credential)).toThrow();
  });
  test('does not become enabled by copying code to Production', () => {
    process.env.ENV = 'production';
    expect(() => new IntegrationRegistry()).toThrow();
  });
  test('is off by default and never requires a secret for normal app startup', () => {
    delete process.env.CHAMAN_INTEGRATIONS_ENABLED;
    delete process.env.CHAMAN_INTEGRATIONS_CLIENTS;
    expect(() => new IntegrationRegistry().authenticate(credential)).toThrow();
  });
  test('rejects duplicate clients, duplicate key IDs and unsupported scopes', () => {
    for (const entries of [
      [client, client],
      [client, { ...client, id: 'other' }],
      [{ ...client, scopes: ['Admin'] }],
    ]) {
      process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify(entries);
      expect(() => new IntegrationRegistry()).toThrow();
    }
  });
  test('requires a separate advisor for independent integration portfolios', () => {
    process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify([
      client,
      {
        ...client,
        id: 'second',
        keys: [{ ...client.keys[0], id: 'second_key' }],
      },
    ]);
    expect(() => new IntegrationRegistry()).toThrow();
  });
});

describe('Public phenology projection', () => {
  const sowing: any = {
    activa: true,
    fechaSiembra: '2026-05-01T12:00:00Z',
    semilla: { cultivo: 'Trigo', variedad: 'Demo', formula: 'private' },
  };
  const snapshot = (series: any[]): any => ({
    series,
    dataSource: { lastCalculatedAt: '2026-09-12T09:00:00Z' },
    summary: { privateThreshold: 950 },
    warnings: ['private formula'],
    parametersVersion: 'private',
  });
  const now = new Date('2026-09-12T12:00:00Z');
  const row = {
    date: '2026-09-12',
    isForecast: false,
    stage: 'Hoja bandera',
    stageSource: 'gdd_validado',
    stageConfidence: 'alta',
    metrics: { secret: 42 },
  };
  test('returns processed stage, never database fields, formulas or raw weather', () => {
    const result = projectPhenology('s1', sowing, snapshot([row]), now);
    expect(result).toMatchObject({
      etapa: 'Hoja bandera',
      estado: 'disponible',
      origen: 'estimada_termica',
      confirmadaEnCampo: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|Threshold|secret|metrics|parametersVersion/,
    );
  });
  test('never confuses forecast/future/pre-sowing data with the current stage', () => {
    const result = projectPhenology(
      's1',
      sowing,
      snapshot([
        { ...row, date: '2026-09-11' },
        { ...row, stage: 'wrong forecast', isForecast: true },
        { ...row, stage: 'wrong future', date: '2026-09-13' },
        { ...row, date: '2026-02-30' },
        { ...row, date: '2026-01-01' },
      ]),
      now,
    );
    expect(result.fechaDato).toBe('2026-09-11');
    expect(result.etapa).toBe('Hoja bandera');
  });
  test('observations, references, pending and stale responses are explicit', () => {
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([{ ...row, stageSource: 'campo' }]),
        now,
      ).confirmadaEnCampo,
    ).toBe(true);
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([{ ...row, stageSource: 'cronograma_referencia' }]),
        now,
      ).origen,
    ).toBe('referencia_calendario');
    expect(projectPhenology('s1', sowing, snapshot([]), now)).toMatchObject({
      etapa: null,
      estado: 'pendiente',
    });
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([{ ...row, date: '2026-09-01' }]),
        now,
      ).estado,
    ).toBe('desactualizada');
    expect(
      projectPhenology('s1', { ...sowing, activa: false }, snapshot([row]), now)
        .estado,
    ).toBe('cosechada');
  });
  test('keeps a current canonical field observation even when today weather is forecast', () => {
    const result = projectPhenology(
      's1',
      sowing,
      snapshot([
        {
          ...row,
          date: '2026-09-11',
          stage: 'Emergencia',
          stageSource: 'cronograma_referencia',
        },
        {
          ...row,
          stage: 'Espiguilla Terminal',
          stageSource: 'campo',
          isForecast: true,
          stageConfidence: 'media',
        },
        {
          ...row,
          date: '2026-09-13',
          stage: 'wrong future field',
          stageSource: 'campo',
          isForecast: true,
        },
      ]),
      now,
    );
    expect(result).toMatchObject({
      fechaDato: '2026-09-12',
      etapa: 'Espiguilla Terminal',
      origen: 'observada',
      confirmadaEnCampo: true,
      confianza: 'media',
      estado: 'disponible',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|secret|metrics|parametersVersion/,
    );
  });
  test.each([
    'gdd_validado',
    'proyeccion_anclada_campo',
    'cronograma_referencia',
    'rango_termico_referencia',
    'seguimiento',
  ])(
    'does not admit weather-forecast rows for unobserved source %s',
    (stageSource) => {
      expect(
        projectPhenology(
          's1',
          sowing,
          snapshot([{ ...row, isForecast: true, stageSource }]),
          now,
        ),
      ).toMatchObject({
        etapa: null,
        estado: 'pendiente',
        confirmadaEnCampo: false,
      });
    },
  );
  test('still excludes invalid, pre-sowing and missing weather status on field rows', () => {
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([
          {
            ...row,
            date: '2026-02-30',
            isForecast: true,
            stageSource: 'campo',
          },
          {
            ...row,
            date: '2026-04-30',
            isForecast: true,
            stageSource: 'campo',
          },
          { ...row, isForecast: undefined, stageSource: 'campo' },
        ]),
        now,
      ),
    ).toMatchObject({ etapa: null, estado: 'pendiente' });
  });
  test('revision is stable on repeated reads and changes with stage', () => {
    const first = projectPhenology('s1', sowing, snapshot([row]), now);
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([row]),
        new Date('2026-09-12T13:00:00Z'),
      ).revision,
    ).toBe(first.revision);
    expect(
      projectPhenology(
        's1',
        sowing,
        snapshot([{ ...row, stage: 'Espigazón' }]),
        now,
      ).revision,
    ).not.toBe(first.revision);
  });
});
