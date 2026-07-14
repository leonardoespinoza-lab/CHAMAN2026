import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { IUbicacion } from 'modelos/src';
import { area, cleanCoords, feature, pointOnFeature, rewind } from '@turf/turf';

export interface NormalizedLotGeometry {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  geometryHash: string;
  areaM2: number;
  representativePoint: { type: 'Point'; coordinates: [number, number] };
  warnings: string[];
  swappedCoordinates: boolean;
}

@Injectable()
export class LotGeometryNormalizer {
  normalize(location?: IUbicacion): NormalizedLotGeometry {
    const source = this.getSourceGeometry(location);
    if (!source) {
      throw new BadRequestException(
        'El lote no tiene un poligono para resolver su ubicacion.',
      );
    }

    const warnings: string[] = [];
    const shouldSwap = this.shouldSwapCoordinates(source.coordinates);
    let coordinates = this.mapPositions(source.coordinates, (position) =>
      shouldSwap ? [position[1], position[0]] : [position[0], position[1]],
    );
    if (shouldSwap) {
      warnings.push(
        'Se corrigio automaticamente el orden latitud/longitud del poligono.',
      );
    }

    coordinates = this.normalizeCoordinates(source.type, coordinates);
    const rawFeature = feature({ type: source.type, coordinates } as any);
    const cleaned = cleanCoords(rawFeature, { mutate: false });
    const normalized = rewind(cleaned, {
      mutate: false,
      reverse: false,
    }) as any;

    const normalizedGeometry =
      normalized.geometry as NormalizedLotGeometry['geometry'];
    this.validateGeometry(normalizedGeometry);

    const areaM2 = area(normalized as any);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
      throw new BadRequestException(
        'El poligono no tiene una superficie valida.',
      );
    }
    if (areaM2 < 10) {
      warnings.push(
        'La superficie del lote es menor a 10 m2; revisar el dibujo.',
      );
    }
    if (areaM2 > 1_000_000_000) {
      warnings.push('La superficie supera 100.000 ha; revisar el dibujo.');
    }

    const canonical = this.canonicalize(normalizedGeometry);
    const geometryHash = createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
    const representative = pointOnFeature(feature(normalizedGeometry as any));

    return {
      geometry: canonical,
      geometryHash,
      areaM2,
      representativePoint: representative.geometry as {
        type: 'Point';
        coordinates: [number, number];
      },
      warnings,
      swappedCoordinates: shouldSwap,
    };
  }

  private getSourceGeometry(location?: IUbicacion): {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  } | null {
    const geojson = location?.geojson as any;
    if (
      geojson?.coordinates?.length &&
      (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon')
    ) {
      return { type: geojson.type, coordinates: geojson.coordinates };
    }
    if (location?.poligono?.length) {
      return {
        type: 'Polygon',
        coordinates: [location.poligono.map((item) => [item.lng, item.lat])],
      };
    }
    return null;
  }

  private normalizeCoordinates(
    type: 'Polygon' | 'MultiPolygon',
    value: any,
  ): any {
    const polygons = type === 'Polygon' ? [value] : value;
    if (!Array.isArray(polygons) || !polygons.length) {
      throw new BadRequestException('La geometria no contiene poligonos.');
    }

    const normalizedPolygons = polygons.map((polygon) => {
      if (!Array.isArray(polygon) || !polygon.length) {
        throw new BadRequestException('El poligono no contiene anillos.');
      }
      return polygon.map((ring) => this.normalizeRing(ring));
    });
    return type === 'Polygon' ? normalizedPolygons[0] : normalizedPolygons;
  }

  private normalizeRing(ring: any): number[][] {
    if (!Array.isArray(ring)) {
      throw new BadRequestException('El anillo del poligono es invalido.');
    }
    const result: number[][] = [];
    for (const raw of ring) {
      const position = this.toPosition(raw);
      if (
        !result.length ||
        !this.positionsEqual(result[result.length - 1], position)
      ) {
        result.push(position);
      }
    }
    if (
      result.length &&
      !this.positionsEqual(result[0], result[result.length - 1])
    ) {
      result.push([...result[0]]);
    }
    if (result.length < 4) {
      throw new BadRequestException(
        'Cada anillo necesita al menos tres vertices distintos.',
      );
    }
    return result;
  }

  private toPosition(value: any): number[] {
    const lon = Number(value?.[0]);
    const lat = Number(value?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new BadRequestException(
        'El poligono contiene coordenadas no numericas.',
      );
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new BadRequestException(
        'El poligono contiene coordenadas fuera de rango.',
      );
    }
    return [Number(lon.toFixed(8)), Number(lat.toFixed(8))];
  }

  private validateGeometry(geometry: NormalizedLotGeometry['geometry']): void {
    const positions = this.flattenPositions(geometry.coordinates);
    if (!positions.length) {
      throw new BadRequestException('La geometria normalizada quedo vacia.');
    }
  }

  private shouldSwapCoordinates(coordinates: any): boolean {
    const positions = this.flattenPositions(coordinates).slice(0, 2000);
    if (!positions.length) return false;
    let argentinaNormal = 0;
    let argentinaSwapped = 0;
    for (const position of positions) {
      if (this.isArgentina(position[0], position[1])) argentinaNormal++;
      if (this.isArgentina(position[1], position[0])) argentinaSwapped++;
    }
    return (
      argentinaSwapped / positions.length > 0.8 &&
      argentinaNormal / positions.length < 0.2
    );
  }

  private isArgentina(lon: number, lat: number): boolean {
    return lon >= -74 && lon <= -52 && lat >= -57 && lat <= -20;
  }

  private flattenPositions(value: any): number[][] {
    if (!Array.isArray(value)) return [];
    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      return [[Number(value[0]), Number(value[1])]];
    }
    return value.flatMap((item) => this.flattenPositions(item));
  }

  private mapPositions(
    value: any,
    mapper: (position: number[]) => number[],
  ): any {
    if (!Array.isArray(value)) return value;
    if (
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    ) {
      return mapper([Number(value[0]), Number(value[1])]);
    }
    return value.map((item) => this.mapPositions(item, mapper));
  }

  private canonicalize(
    geometry: NormalizedLotGeometry['geometry'],
  ): NormalizedLotGeometry['geometry'] {
    const canonicalPolygon = (polygon: number[][][]) => {
      const rings = polygon.map((ring) => this.rotateRing(ring));
      return [
        rings[0],
        ...rings
          .slice(1)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ];
    };
    if (geometry.type === 'Polygon') {
      return {
        type: 'Polygon',
        coordinates: canonicalPolygon(geometry.coordinates as number[][][]),
      };
    }
    const polygons = (geometry.coordinates as number[][][][])
      .map(canonicalPolygon)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  private rotateRing(ring: number[][]): number[][] {
    const open = ring.slice(0, -1);
    let minIndex = 0;
    for (let index = 1; index < open.length; index++) {
      const current = `${open[index][0].toFixed(8)},${open[index][1].toFixed(8)}`;
      const minimum = `${open[minIndex][0].toFixed(8)},${open[minIndex][1].toFixed(8)}`;
      if (current < minimum) minIndex = index;
    }
    const rotated = [...open.slice(minIndex), ...open.slice(0, minIndex)];
    return [...rotated, [...rotated[0]]];
  }

  private positionsEqual(a?: number[], b?: number[]): boolean {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
  }
}
