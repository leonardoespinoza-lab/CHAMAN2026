import { SoilIntelligenceConfidenceService } from './confidence.service';

describe('SoilIntelligenceConfidenceService', () => {
  const service = new SoilIntelligenceConfidenceService();
  const geometry = {
    areaM2: 200_000,
    geometryHash: 'hash',
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-60, -34],
          [-59.99, -34],
          [-59.99, -33.99],
          [-60, -33.99],
          [-60, -34],
        ],
      ],
    },
    representativePoint: {
      type: 'Point' as const,
      coordinates: [-59.995, -33.995] as [number, number],
    },
    warnings: [],
    swappedCoordinates: false,
  };

  it('explica la coincidencia y la cobertura', () => {
    const result = service.calculate({
      geometry,
      inta: {
        units: [{ source: 'inta_local', areaPercentage: 100 }],
        coveragePercentage: 100,
        directTexture: 'Franco',
        confidence: 'high',
        sourceVersions: {},
        warnings: [],
        failedLayers: [],
      },
      soilgrids: {
        profile: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            source: 'soilgrids',
            confidence: 'medium',
          },
        ],
        coveragePercentage: 100,
        resolutionMeters: 250,
        confidence: 'medium',
        sourceVersion: 'v2',
        warnings: [],
      },
      intaTexture: 'Franco',
      soilgridsTexture: 'Franco',
      heterogeneous: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.level).toBe('high');
    expect(result.factors.join(' ')).toMatch(/coinciden/i);
  });

  it('reduce confianza para lote pequeño, heterogeneidad y discrepancia', () => {
    const result = service.calculate({
      geometry: { ...geometry, areaM2: 10_000 },
      inta: {
        units: [{ source: 'inta_national', areaPercentage: 55 }],
        coveragePercentage: 55,
        directTexture: 'Franco',
        confidence: 'low',
        sourceVersions: {},
        warnings: [],
        failedLayers: ['regional'],
      },
      soilgrids: {
        profile: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
        coveragePercentage: 80,
        resolutionMeters: 250,
        confidence: 'low',
        sourceVersion: 'v2',
        warnings: [],
      },
      intaTexture: 'Franco',
      soilgridsTexture: 'Arcilloso',
      heterogeneous: true,
    });
    expect(result.level).toBe('low');
    expect(result.factors.join(' ')).toMatch(/menor que una celda/i);
  });
});
