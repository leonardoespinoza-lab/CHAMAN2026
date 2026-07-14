import { BadRequestException } from '@nestjs/common';
import {
  SoilTextureClassifier,
  USDA_TO_CHAMAN_TEXTURE,
} from './texture-classifier.service';

describe('SoilTextureClassifier', () => {
  const service = new SoilTextureClassifier();

  test.each([
    ['clay', 20, 20, 60, 'Arcilloso'],
    ['silty clay', 5, 50, 45, 'Arcilloso'],
    ['sandy clay', 55, 5, 40, 'Arcilloso'],
    ['clay loam', 35, 30, 35, 'Franco arcilloso'],
    ['silty clay loam', 10, 55, 35, 'Franco arcilloso'],
    ['sandy clay loam', 55, 15, 30, 'Franco arcilloso'],
    ['loam', 40, 40, 20, 'Franco'],
    ['silt loam', 20, 65, 15, 'Franco limoso'],
    ['silt', 5, 90, 5, 'Limoso'],
    ['sandy loam', 65, 25, 10, 'Franco arenoso'],
    ['loamy sand', 82, 12, 6, 'Arenoso'],
    ['sand', 92, 5, 3, 'Arenoso'],
  ])(
    '%s se clasifica y reduce a Chaman-7',
    (usda, sand, silt, clay, chaman) => {
      const result = service.classify(
        sand as number,
        silt as number,
        clay as number,
      );
      expect(result.usda).toBe(usda);
      expect(result.chaman).toBe(chaman);
      expect(USDA_TO_CHAMAN_TEXTURE[result.usda]).toBe(chaman);
    },
  );

  it('normaliza solamente una desviacion dentro de tolerancia', () => {
    const result = service.validateAndNormalize(40, 40, 19);
    expect(result.normalized).toBe(true);
    expect(result.sand + result.silt + result.clay).toBeCloseTo(100, 3);
  });

  it('rechaza porcentajes y sumas invalidas', () => {
    expect(() => service.validateAndNormalize(-1, 50, 51)).toThrow(
      BadRequestException,
    );
    expect(() => service.validateAndNormalize(40, 40, 10)).toThrow(
      BadRequestException,
    );
  });

  it('pondera 0-30 cm por espesor 5/10/15', () => {
    const result = service.weightedTopsoil([
      { depthFromCm: 0, depthToCm: 5, sand: 60, silt: 30, clay: 10 },
      { depthFromCm: 5, depthToCm: 15, sand: 40, silt: 40, clay: 20 },
      { depthFromCm: 15, depthToCm: 30, sand: 20, silt: 50, clay: 30 },
    ]);
    expect(result.sand).toBeCloseTo((60 * 5 + 40 * 10 + 20 * 15) / 30, 3);
    expect(result.silt).toBeCloseTo((30 * 5 + 40 * 10 + 50 * 15) / 30, 3);
    expect(result.clay).toBeCloseTo((10 * 5 + 20 * 10 + 30 * 15) / 30, 3);
  });
});
