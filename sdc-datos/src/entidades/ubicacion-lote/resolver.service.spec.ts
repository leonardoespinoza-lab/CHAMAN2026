import { area, feature, pointOnFeature } from '@turf/turf';
import { LotLocationConfidenceService } from './confidence.service';
import { LotAdministrativeResolver } from './resolver.service';

describe('LotAdministrativeResolver', () => {
  const lotGeometry: any = {
    type: 'Polygon',
    coordinates: [
      [
        [-61.98, -32.82],
        [-61.94, -32.82],
        [-61.94, -32.79],
        [-61.98, -32.79],
        [-61.98, -32.82],
      ],
    ],
  };
  const normalized: any = {
    geometry: lotGeometry,
    geometryHash: 'hash',
    areaM2: area(feature(lotGeometry)),
    representativePoint: pointOnFeature(feature(lotGeometry)).geometry,
    warnings: [],
    swappedCoordinates: false,
  };
  const province = entity(
    'provincias',
    '82',
    'Santa Fe',
    rectangle(-62.2, -33.1, -61.7, -32.5),
    { categoria: 'Provincia' },
  );
  const department = entity(
    'departamentos',
    '82077',
    'Caseros',
    rectangle(-62.2, -33.1, -61.7, -32.5),
    { provincia: { id: '82', name: 'Santa Fe' }, categoria: 'Departamento' },
  );

  function createRepository(overrides: Record<string, any> = {}) {
    return {
      findIntersecting: jest.fn(async (_snapshot: string, resource: string) => {
        if (resource === 'provincias') return [province];
        if (resource === 'departamentos') return [department];
        return [];
      }),
      findNearby: jest.fn(async () => []),
      ...overrides,
    } as any;
  }

  function input(extra: Record<string, any> = {}) {
    return {
      loteId: 'lot-1',
      snapshotId: 'snap-1',
      sourceVersion: 'source-1',
      resolverVersion: 'resolver-1',
      resolutionKey: 'key-1',
      geometry: normalized,
      ...extra,
    } as any;
  }

  it('resuelve un lote rural dentro de una unica provincia y departamento sin inventar municipio', async () => {
    const resolver = new LotAdministrativeResolver(
      createRepository(),
      new LotLocationConfidenceService(),
    );
    const result = await resolver.resolve(input());
    expect(result.location.estado).toBe('ready');
    expect(result.location.provincia?.nombre).toBe('Santa Fe');
    expect(result.location.nivelAdministrativo2?.nombre).toBe('Caseros');
    expect(result.location.municipio).toBeNull();
    expect(result.location.confianza).toBe('alta');
  });

  it('conserva todas las intersecciones cuando el lote cruza dos departamentos', async () => {
    const west = entity(
      'departamentos',
      '82001',
      'Oeste',
      rectangle(-62.1, -33, -61.96, -32.6),
      { provincia: { id: '82', name: 'Santa Fe' } },
    );
    const east = entity(
      'departamentos',
      '82002',
      'Este',
      rectangle(-61.96, -33, -61.7, -32.6),
      { provincia: { id: '82', name: 'Santa Fe' } },
    );
    const repository = createRepository({
      findIntersecting: jest.fn(async (_snapshot: string, resource: string) => {
        if (resource === 'provincias') return [province];
        if (resource === 'departamentos') return [west, east];
        return [];
      }),
    });
    const resolver = new LotAdministrativeResolver(
      repository,
      new LotLocationConfidenceService(),
    );
    const result = await resolver.resolve(input());
    const departments = result.intersections.filter(
      (item) => item.recurso === 'departamentos',
    );
    expect(result.location.estado).toBe('partial');
    expect(departments).toHaveLength(2);
    expect(
      result.location.jurisdiccionesSecundarias?.some(
        (item) => item.nombre === 'Oeste' || item.nombre === 'Este',
      ),
    ).toBe(true);
  });

  it('centraliza las etiquetas Partido, Comuna y Departamento', () => {
    const resolver = new LotAdministrativeResolver(
      createRepository(),
      new LotLocationConfidenceService(),
    );
    expect((resolver as any).admin2Type('Buenos Aires')).toBe('Partido');
    expect(
      (resolver as any).admin2Type('Ciudad Autónoma de Buenos Aires'),
    ).toBe('Comuna');
    expect((resolver as any).admin2Type('Córdoba')).toBe('Departamento');
  });

  it('resuelve municipio solo cuando un gobierno local municipal contiene el lote', async () => {
    const government = entity(
      'gobiernos_locales',
      'gl-1',
      'Municipalidad de Casilda',
      rectangle(-62.2, -33.1, -61.7, -32.5),
      { category: 'Municipio' },
    );
    const repository = createRepository({
      findIntersecting: jest.fn(async (_snapshot: string, resource: string) => {
        if (resource === 'provincias') return [province];
        if (resource === 'departamentos') return [department];
        if (resource === 'gobiernos_locales') return [government];
        return [];
      }),
    });
    const resolver = new LotAdministrativeResolver(
      repository,
      new LotLocationConfidenceService(),
    );

    const result = await resolver.resolve(input());
    expect(result.location.municipio?.nombre).toBe('Municipalidad de Casilda');
  });

  it('marca parcial cuando una parte del lote queda fuera de cobertura argentina', async () => {
    const halfProvince = entity(
      'provincias',
      '82',
      'Santa Fe',
      rectangle(-62.2, -33.1, -61.96, -32.5),
      { categoria: 'Provincia' },
    );
    const halfDepartment = entity(
      'departamentos',
      '82077',
      'Caseros',
      rectangle(-62.2, -33.1, -61.96, -32.5),
    );
    const repository = createRepository({
      findIntersecting: jest.fn(async (_snapshot: string, resource: string) => {
        if (resource === 'provincias') return [halfProvince];
        if (resource === 'departamentos') return [halfDepartment];
        return [];
      }),
    });
    const resolver = new LotAdministrativeResolver(
      repository,
      new LotLocationConfidenceService(),
    );

    const result = await resolver.resolve(input());
    expect(result.location.estado).toBe('partial');
    expect(result.location.coberturaPorcentaje).toBeLessThan(99.5);
    expect(result.location.advertencias?.join(' ')).toContain(
      'fuera de la cobertura',
    );
  });

  it('mide localidad desde el limite del poligono y aplica desempate administrativo', async () => {
    const near = entity(
      'localidades',
      'loc-1',
      'Pujato',
      { type: 'Point', coordinates: [-61.939, -32.8] },
      {
        provincia: { id: '82', name: 'Santa Fe' },
        departamento: { id: '82077', name: 'Caseros' },
      },
    );
    const repository = createRepository({
      findNearby: jest.fn(async (_snapshot: string, resource: string) =>
        resource === 'localidades' ? [{ ...near, distanceMeters: 100 }] : [],
      ),
    });
    const resolver = new LotAdministrativeResolver(
      repository,
      new LotLocationConfidenceService(),
    );
    const result = await resolver.resolve(input());
    expect(result.location.localidadReferencia?.nombre).toBe('Pujato');
    expect(
      result.location.localidadReferencia?.distanciaMetros,
    ).toBeGreaterThan(0);
    expect(result.location.localidadReferencia?.distanciaMetros).toBeLessThan(
      200,
    );
    expect(result.location.localidadReferencia?.dentroDelLote).toBe(false);
  });

  it('clasifica fuera de cobertura cuando no hay provincia oficial', async () => {
    const repository = createRepository({
      findIntersecting: jest.fn(async () => []),
    });
    const resolver = new LotAdministrativeResolver(
      repository,
      new LotLocationConfidenceService(),
    );
    const result = await resolver.resolve(input());
    expect(result.location.estado).toBe('outside_supported_area');
    expect(result.location.confianza).toBe('baja');
  });

  it('informa conflicto sin sobrescribir la ubicacion manual', async () => {
    const resolver = new LotAdministrativeResolver(
      createRepository(),
      new LotLocationConfidenceService(),
    );
    const result = await resolver.resolve(
      input({
        manualDepartment: {
          id: 'legacy',
          name: 'General Lopez',
          province: 'Santa Fe',
        },
      }),
    );
    expect(result.location.conflictoManual?.existe).toBe(true);
    expect(result.location.conflictoManual?.departamentoManual).toBe(
      'General Lopez',
    );
    expect(result.location.nivelAdministrativo2?.nombre).toBe('Caseros');
  });
});

function rectangle(west: number, south: number, east: number, north: number) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

function entity(
  resource: string,
  entityId: string,
  name: string,
  geometry: any,
  extra: Record<string, any> = {},
) {
  return {
    snapshotId: 'snap-1',
    resource,
    entityId,
    name,
    geometry,
    sourceUrl: 'https://apis.datos.gob.ar/georef',
    contentHash: `${resource}-${entityId}`,
    license: 'CC BY 4.0',
    attribution: 'Servicio Georef - argentina.gob.ar/georef',
    ...extra,
  } as any;
}
