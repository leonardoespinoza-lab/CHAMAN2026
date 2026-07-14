import { BadRequestException } from '@nestjs/common';
import { booleanPointInPolygon, feature, point } from '@turf/turf';
import { LotGeometryNormalizer } from './geometry-normalizer.service';

describe('LotGeometryNormalizer', () => {
  const service = new LotGeometryNormalizer();
  const ring = [
    [-61.98, -32.82],
    [-61.94, -32.82],
    [-61.94, -32.79],
    [-61.98, -32.79],
    [-61.98, -32.82],
  ];

  it('normaliza un Polygon, calcula superficie, punto interior y hash estable', () => {
    const first = service.normalize({
      geojson: { type: 'Polygon', coordinates: [ring] } as any,
    });
    const shifted = [...ring.slice(2, -1), ...ring.slice(0, 3)];
    const second = service.normalize({
      geojson: { type: 'Polygon', coordinates: [shifted] } as any,
    });

    expect(first.areaM2).toBeGreaterThan(1_000_000);
    expect(first.representativePoint.type).toBe('Point');
    expect(
      booleanPointInPolygon(
        point(first.representativePoint.coordinates),
        feature(first.geometry as any),
      ),
    ).toBe(true);
    expect(first.geometryHash).toBe(second.geometryHash);
  });

  it('cambia el hash cuando cambia realmente el limite agronomico', () => {
    const original = service.normalize({
      geojson: { type: 'Polygon', coordinates: [ring] } as any,
    });
    const moved = ring.map(([lon, lat], index) =>
      index === 1 ? [lon + 0.001, lat] : [lon, lat],
    );
    const changed = service.normalize({
      geojson: { type: 'Polygon', coordinates: [moved] } as any,
    });

    expect(changed.geometryHash).not.toBe(original.geometryHash);
  });

  it('detecta y corrige coordenadas latitud/longitud invertidas para Argentina', () => {
    const inverted = ring.map(([lon, lat]) => [lat, lon]);
    const result = service.normalize({
      geojson: { type: 'Polygon', coordinates: [inverted] } as any,
    });

    expect(result.swappedCoordinates).toBe(true);
    expect(result.warnings.join(' ')).toContain('orden latitud/longitud');
    expect((result.geometry.coordinates as number[][][])[0][0][0]).toBeLessThan(
      -50,
    );
  });

  it('acepta MultiPolygon y ordena sus partes para un hash reproducible', () => {
    const secondRing = ring.map(([lon, lat]) => [lon + 0.06, lat]);
    const a = service.normalize({
      geojson: {
        type: 'MultiPolygon',
        coordinates: [[ring], [secondRing]],
      } as any,
    });
    const b = service.normalize({
      geojson: {
        type: 'MultiPolygon',
        coordinates: [[secondRing], [ring]],
      } as any,
    });
    expect(a.geometry.type).toBe('MultiPolygon');
    expect(a.geometryHash).toBe(b.geometryHash);
  });

  it('rechaza geometria inexistente o anillos invalidos', () => {
    expect(() => service.normalize(undefined)).toThrow(BadRequestException);
    expect(() =>
      service.normalize({
        geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [-61, -32],
              [-61.1, -32],
              [-61, -32],
            ],
          ],
        },
      }),
    ).toThrow(BadRequestException);
  });
});
