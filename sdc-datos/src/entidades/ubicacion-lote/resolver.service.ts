import { Injectable } from '@nestjs/common';
import {
  IInterseccionAdministrativaLote,
  ILugarCercanoLote,
  IReferenciaGeoref,
  IUbicacionAdministrativaLote,
} from 'modelos/src';
import {
  area,
  booleanPointInPolygon,
  distance,
  feature,
  featureCollection,
  intersect,
  lineString,
  point,
  pointToLineDistance,
} from '@turf/turf';
import { GeorefCatalogEntity } from './modelos/georef-catalog.schema';
import { LotLocationConfidenceService } from './confidence.service';
import { NormalizedLotGeometry } from './geometry-normalizer.service';
import { LotLocationRepository } from './repository';
import {
  GEOREF_LOCALITY_MAX_DISTANCE_METERS,
  GEOREF_SETTLEMENT_MAX_DISTANCE_METERS,
} from '../../env';

interface ResolverInput {
  loteId: string;
  snapshotId: string;
  sourceVersion: string;
  resolverVersion: string;
  resolutionKey: string;
  geometry: NormalizedLotGeometry;
  manualDepartment?: { id?: string; name?: string; province?: string };
}

interface IntersectionResult {
  entity: GeorefCatalogEntity;
  areaM2: number;
  percentage: number;
}

@Injectable()
export class LotAdministrativeResolver {
  constructor(
    private readonly repository: LotLocationRepository,
    private readonly confidence: LotLocationConfidenceService,
  ) {}

  async resolve(input: ResolverInput): Promise<{
    location: Partial<IUbicacionAdministrativaLote>;
    intersections: IInterseccionAdministrativaLote[];
  }> {
    const polygon = input.geometry.geometry;
    const [
      provinceCandidates,
      departmentCandidates,
      governmentCandidates,
      censusCandidates,
    ] = await Promise.all([
      this.repository.findIntersecting(input.snapshotId, 'provincias', polygon),
      this.repository.findIntersecting(
        input.snapshotId,
        'departamentos',
        polygon,
      ),
      this.repository.findIntersecting(
        input.snapshotId,
        'gobiernos_locales',
        polygon,
      ),
      this.repository.findIntersecting(
        input.snapshotId,
        'localidades_censales',
        polygon,
      ),
    ]);

    const provinces = this.calculateIntersections(
      provinceCandidates,
      input.geometry,
    );
    const departments = this.calculateIntersections(
      departmentCandidates,
      input.geometry,
    );
    const governments = this.calculateIntersections(
      governmentCandidates,
      input.geometry,
    );
    const censusLocalities = this.calculateIntersections(
      censusCandidates,
      input.geometry,
    );
    const dominantProvince = provinces[0];
    const dominantDepartment = departments[0];
    const dominantGovernment = governments[0];
    const dominantCensus = censusLocalities[0];

    const [locality, settlement] = await Promise.all([
      this.findNearestPlace(
        input,
        'localidades',
        GEOREF_LOCALITY_MAX_DISTANCE_METERS,
        dominantProvince?.entity,
        dominantDepartment?.entity,
        dominantGovernment?.entity,
      ),
      this.findNearestPlace(
        input,
        'asentamientos',
        GEOREF_SETTLEMENT_MAX_DISTANCE_METERS,
        dominantProvince?.entity,
        dominantDepartment?.entity,
        dominantGovernment?.entity,
      ),
    ]);

    const warnings = [...input.geometry.warnings];
    const coverage = this.coverage(provinces);
    if (provinces.length > 1)
      warnings.push('El lote cruza un limite provincial.');
    if (coverage > 0 && coverage < 99.5)
      warnings.push(
        'Parte del lote queda fuera de la cobertura provincial argentina del snapshot activo.',
      );
    if (departments.length > 1)
      warnings.push(
        'El lote cruza mas de una jurisdiccion administrativa de nivel 2.',
      );
    if (governments.length > 1)
      warnings.push('El lote cruza mas de un gobierno local oficial.');
    if (!dominantGovernment)
      warnings.push(
        'GeoRef no informa municipio o gobierno local para este poligono.',
      );
    if (!dominantProvince) {
      return {
        location: {
          estado: 'outside_supported_area',
          confianza: 'baja',
          razonesConfianza: [
            'El poligono no interseca ninguna provincia argentina del snapshot activo.',
          ],
          advertencias: warnings,
          coberturaPorcentaje: 0,
          metodo: 'interseccion-poligono-completo',
          fuente: 'GeoRef Argentina',
        },
        intersections: [],
      };
    }

    const confidence = this.confidence.calculate({
      provinceCoverage: dominantProvince.percentage,
      admin2Coverage: dominantDepartment?.percentage || 0,
      usedPointFallback: false,
      warnings: warnings.filter((warning) => !warning.includes('municipio')),
      hasProvince: !!dominantProvince,
      hasAdmin2: !!dominantDepartment,
    });

    const allIntersections = [
      ...this.mapIntersections('provincias', provinces),
      ...this.mapIntersections('departamentos', departments),
      ...this.mapIntersections('gobiernos_locales', governments),
      ...this.mapIntersections('localidades_censales', censusLocalities),
    ];

    const conflict = this.manualConflict(
      input.manualDepartment,
      dominantDepartment?.entity,
    );
    if (conflict.existe) warnings.push(conflict.detalle);
    const isPartial =
      !dominantDepartment ||
      coverage < 99.5 ||
      provinces.length > 1 ||
      departments.length > 1 ||
      governments.length > 1;

    return {
      location: {
        estado: isPartial ? 'partial' : 'ready',
        pais: {
          id: 'AR',
          nombre: 'Argentina',
          nombreCompleto: 'Republica Argentina',
          fuente: 'GeoRef Argentina',
        },
        provincia: this.toReference(dominantProvince.entity),
        nivelAdministrativo2: dominantDepartment
          ? {
              ...this.toReference(dominantDepartment.entity),
              tipo: this.admin2Type(dominantProvince.entity.name),
            }
          : undefined,
        municipio: this.isMunicipality(dominantGovernment?.entity)
          ? this.toReference(dominantGovernment.entity)
          : null,
        gobiernoLocal: dominantGovernment
          ? this.toReference(dominantGovernment.entity)
          : null,
        localidadReferencia: locality,
        localidadCensal: dominantCensus
          ? this.toReference(dominantCensus.entity)
          : null,
        asentamientoCercano:
          settlement &&
          (settlement.distanciaMetros || 0) <=
            GEOREF_SETTLEMENT_MAX_DISTANCE_METERS
            ? settlement
            : null,
        jurisdiccionesSecundarias: allIntersections.filter(
          (item) => !item.dominante,
        ),
        superficieCalculadaM2: input.geometry.areaM2,
        coberturaPorcentaje: coverage,
        puntoRepresentativo: input.geometry.representativePoint,
        geometriaNormalizada: input.geometry.geometry as any,
        fuente: 'GeoRef Argentina',
        metodo: 'interseccion-poligono-completo-y-distancia-desde-limite',
        confianza: confidence.level,
        razonesConfianza: confidence.reasons,
        advertencias: warnings,
        conflictoManual: conflict,
      },
      intersections: allIntersections,
    };
  }

  private calculateIntersections(
    candidates: GeorefCatalogEntity[],
    lot: NormalizedLotGeometry,
  ): IntersectionResult[] {
    const lotFeature = feature(lot.geometry as any);
    const result: IntersectionResult[] = [];
    for (const entity of candidates) {
      try {
        const overlap = intersect(
          featureCollection([lotFeature, feature(entity.geometry as any)]),
        );
        if (!overlap) continue;
        const areaM2 = area(overlap);
        if (!Number.isFinite(areaM2) || areaM2 <= 0) continue;
        result.push({
          entity,
          areaM2,
          percentage: Math.min(100, (areaM2 / lot.areaM2) * 100),
        });
      } catch {
        continue;
      }
    }
    return result.sort((a, b) => b.areaM2 - a.areaM2);
  }

  private async findNearestPlace(
    input: ResolverInput,
    resource: 'localidades' | 'asentamientos',
    maxDistance: number,
    province?: GeorefCatalogEntity,
    department?: GeorefCatalogEntity,
    government?: GeorefCatalogEntity,
  ): Promise<ILugarCercanoLote | null> {
    const candidates = await this.repository.findNearby(
      input.snapshotId,
      resource,
      input.geometry.representativePoint,
      maxDistance + this.maxDistanceFromRepresentativePoint(input.geometry),
      resource === 'asentamientos' ? 100 : 70,
    );
    const ranked = candidates
      .map((entity) => ({
        entity,
        boundaryDistance: this.distanceFromBoundary(
          input.geometry.geometry,
          entity.geometry as any,
        ),
        adminMatch: entity.department?.id === department?.entityId ? 1 : 0,
        governmentMatch:
          entity.localGovernment?.id === government?.entityId ? 1 : 0,
        provinceMatch: entity.province?.id === province?.entityId ? 1 : 0,
      }))
      .filter((item) => item.boundaryDistance <= maxDistance)
      .sort((a, b) => {
        const delta = a.boundaryDistance - b.boundaryDistance;
        if (Math.abs(delta) > 50) return delta;
        return (
          b.adminMatch - a.adminMatch ||
          b.governmentMatch - a.governmentMatch ||
          b.provinceMatch - a.provinceMatch ||
          delta
        );
      });
    const selected = ranked[0];
    if (!selected) return null;
    return {
      ...this.toReference(selected.entity),
      distanciaMetros: Math.round(selected.boundaryDistance),
      dentroDelLote: selected.boundaryDistance === 0,
    };
  }

  private maxDistanceFromRepresentativePoint(
    geometry: NormalizedLotGeometry,
  ): number {
    const origin = point(geometry.representativePoint.coordinates);
    const polygons =
      geometry.geometry.type === 'Polygon'
        ? [geometry.geometry.coordinates]
        : geometry.geometry.coordinates;
    let maximum = 0;
    for (const polygon of polygons as number[][][][]) {
      for (const ring of polygon as unknown as number[][][]) {
        for (const position of ring) {
          maximum = Math.max(
            maximum,
            distance(origin, point(position), { units: 'kilometers' }) * 1000,
          );
        }
      }
    }
    return maximum;
  }

  private distanceFromBoundary(
    polygon: NormalizedLotGeometry['geometry'],
    placeGeometry: { type: string; coordinates: any },
  ): number {
    const coordinates =
      placeGeometry.type === 'Point'
        ? placeGeometry.coordinates
        : placeGeometry.coordinates?.[0];
    const place = point(coordinates);
    if (booleanPointInPolygon(place, feature(polygon as any))) return 0;
    const polygons =
      polygon.type === 'Polygon' ? [polygon.coordinates] : polygon.coordinates;
    let minimum = Number.POSITIVE_INFINITY;
    for (const item of polygons as number[][][][]) {
      for (const ring of item as unknown as number[][][]) {
        const distanceKm = pointToLineDistance(place, lineString(ring as any), {
          units: 'kilometers',
        });
        minimum = Math.min(minimum, distanceKm * 1000);
      }
    }
    return minimum;
  }

  private mapIntersections(
    resource: string,
    values: IntersectionResult[],
  ): IInterseccionAdministrativaLote[] {
    return values.map((value, index) => ({
      ...this.toReference(value.entity),
      recurso: resource,
      superficieInterseccionM2: Math.round(value.areaM2),
      porcentajeLote: Number(value.percentage.toFixed(4)),
      dominante: index === 0,
    }));
  }

  private toReference(
    entity?: GeorefCatalogEntity,
  ): IReferenciaGeoref | undefined {
    if (!entity) return undefined;
    return {
      id: entity.entityId,
      nombre: entity.name,
      nombreCompleto: entity.fullName,
      categoria: entity.category,
      fuente: entity.source,
      provinciaId: entity.province?.id,
      departamentoId: entity.department?.id,
      gobiernoLocalId: entity.localGovernment?.id,
    };
  }

  private admin2Type(
    provinceName?: string,
  ): 'Partido' | 'Comuna' | 'Departamento' {
    const normalized = this.normalize(provinceName);
    if (normalized.includes('buenos aires') && !normalized.includes('ciudad'))
      return 'Partido';
    if (normalized.includes('ciudad autonoma')) return 'Comuna';
    return 'Departamento';
  }

  private isMunicipality(entity?: GeorefCatalogEntity): boolean {
    return !!entity && this.normalize(entity.category).includes('municip');
  }

  private coverage(values: IntersectionResult[]): number {
    return Number(
      Math.min(
        100,
        values.reduce((sum, item) => sum + item.percentage, 0),
      ).toFixed(4),
    );
  }

  private manualConflict(
    manual: ResolverInput['manualDepartment'],
    official?: GeorefCatalogEntity,
  ) {
    if (!manual?.id && !manual?.name) return { existe: false };
    const sameName =
      manual.name &&
      official?.name &&
      this.normalize(manual.name) === this.normalize(official.name);
    if (sameName) {
      return {
        existe: false,
        departamentoManualId: manual.id,
        departamentoManual: manual.name,
        provinciaManual: manual.province,
      };
    }
    return {
      existe: true,
      departamentoManualId: manual.id,
      departamentoManual: manual.name,
      provinciaManual: manual.province,
      detalle: `La ubicacion manual (${manual.name || manual.id}) no coincide con GeoRef (${official?.name || 'sin resultado'}). No fue sobrescrita.`,
    };
  }

  private normalize(value?: string): string {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
