import { BadRequestException, Injectable } from '@nestjs/common';
import { TClaseTexturalUsda, TTexturaSuelo } from 'modelos/src';

export const TEXTURE_MAPPING_VERSION = 'chaman-7-v1';
// SoilGrids entrega capas separadas e enteros escalados; al remuestrear por WCS
// puede acumular hasta 3 puntos de diferencia sin invalidar la composición.
export const TEXTURE_SUM_TOLERANCE = 3;

export const USDA_TO_CHAMAN_TEXTURE: Record<TClaseTexturalUsda, TTexturaSuelo> =
  {
    clay: 'Arcilloso',
    'silty clay': 'Arcilloso',
    'sandy clay': 'Arcilloso',
    'clay loam': 'Franco arcilloso',
    'silty clay loam': 'Franco arcilloso',
    'sandy clay loam': 'Franco arcilloso',
    loam: 'Franco',
    'silt loam': 'Franco limoso',
    silt: 'Limoso',
    'sandy loam': 'Franco arenoso',
    'loamy sand': 'Arenoso',
    sand: 'Arenoso',
  };

export interface ValidatedTextureFractions {
  sand: number;
  silt: number;
  clay: number;
  normalized: boolean;
}

@Injectable()
export class SoilTextureClassifier {
  validateAndNormalize(
    sandInput: number,
    siltInput: number,
    clayInput: number,
  ): ValidatedTextureFractions {
    const values = [sandInput, siltInput, clayInput].map(Number);
    if (values.some((value) => !Number.isFinite(value))) {
      throw new BadRequestException(
        'Arena, limo y arcilla deben ser valores numéricos.',
      );
    }
    if (values.some((value) => value < 0 || value > 100)) {
      throw new BadRequestException(
        'Arena, limo y arcilla deben estar entre 0 y 100%.',
      );
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > TEXTURE_SUM_TOLERANCE) {
      throw new BadRequestException(
        `La suma de arena, limo y arcilla (${total.toFixed(2)}%) está fuera de tolerancia.`,
      );
    }
    if (total <= 0) {
      throw new BadRequestException('La composición textural está vacía.');
    }
    const normalized = Math.abs(total - 100) > 0.001;
    const factor = 100 / total;
    return {
      sand: Number((values[0] * factor).toFixed(4)),
      silt: Number((values[1] * factor).toFixed(4)),
      clay: Number((values[2] * factor).toFixed(4)),
      normalized,
    };
  }

  classify(
    sandInput: number,
    siltInput: number,
    clayInput: number,
  ): {
    usda: TClaseTexturalUsda;
    chaman: TTexturaSuelo;
    fractions: ValidatedTextureFractions;
  } {
    const fractions = this.validateAndNormalize(
      sandInput,
      siltInput,
      clayInput,
    );
    const usda = this.classifyUsda(fractions);
    return { usda, chaman: USDA_TO_CHAMAN_TEXTURE[usda], fractions };
  }

  weightedTopsoil(
    layers: Array<{
      depthFromCm: number;
      depthToCm: number;
      sand: number;
      silt: number;
      clay: number;
    }>,
    targetFromCm = 0,
    targetToCm = 30,
  ): ValidatedTextureFractions {
    let representedCm = 0;
    const totals = { sand: 0, silt: 0, clay: 0 };
    for (const layer of layers) {
      const overlap = Math.max(
        0,
        Math.min(layer.depthToCm, targetToCm) -
          Math.max(layer.depthFromCm, targetFromCm),
      );
      if (!overlap) continue;
      const valid = this.validateAndNormalize(
        layer.sand,
        layer.silt,
        layer.clay,
      );
      totals.sand += valid.sand * overlap;
      totals.silt += valid.silt * overlap;
      totals.clay += valid.clay * overlap;
      representedCm += overlap;
    }
    if (representedCm <= 0) {
      throw new BadRequestException(
        'El perfil no contiene datos para el intervalo solicitado.',
      );
    }
    return this.validateAndNormalize(
      totals.sand / representedCm,
      totals.silt / representedCm,
      totals.clay / representedCm,
    );
  }

  private classifyUsda({
    sand,
    silt,
    clay,
  }: ValidatedTextureFractions): TClaseTexturalUsda {
    if (silt + 1.5 * clay < 15) return 'sand';
    if (silt + 2 * clay < 30) return 'loamy sand';
    if (
      (clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) ||
      (clay < 7 && silt < 50 && silt + 2 * clay >= 30)
    ) {
      return 'sandy loam';
    }
    if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) {
      return 'loam';
    }
    if (
      (silt >= 50 && clay >= 12 && clay < 27) ||
      (silt >= 50 && silt < 80 && clay < 12)
    ) {
      return 'silt loam';
    }
    if (silt >= 80 && clay < 12) return 'silt';
    if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) {
      return 'sandy clay loam';
    }
    if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) {
      return 'clay loam';
    }
    if (clay >= 27 && clay < 40 && sand <= 20) {
      return 'silty clay loam';
    }
    if (clay >= 35 && sand > 45) return 'sandy clay';
    if (clay >= 40 && silt >= 40) return 'silty clay';
    return 'clay';
  }
}
