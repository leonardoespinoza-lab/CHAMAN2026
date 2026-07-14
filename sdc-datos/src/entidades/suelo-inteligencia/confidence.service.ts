import { Injectable } from '@nestjs/common';
import { TConfianzaInteligenciaSuelo, TTexturaSuelo } from 'modelos/src';
import { NormalizedLotGeometry } from '../ubicacion-lote/geometry-normalizer.service';
import { SOILGRIDS_RESOLUTION_METERS } from './config/soilgrids.config';
import {
  IntaSoilProviderResult,
  SoilGridsProviderResult,
} from './providers/provider.types';

export const SOIL_CONFIDENCE_VERSION = 'soil-confidence-v2';

@Injectable()
export class SoilIntelligenceConfidenceService {
  calculate(input: {
    geometry: NormalizedLotGeometry;
    inta: IntaSoilProviderResult;
    soilgrids: SoilGridsProviderResult;
    intaTexture?: TTexturaSuelo;
    soilgridsTexture?: TTexturaSuelo;
    heterogeneous: boolean;
  }): {
    score: number;
    level: TConfianzaInteligenciaSuelo;
    factors: string[];
  } {
    const factors: string[] = [];
    const hasInta = input.inta.units.length > 0;
    const hasSoilGrids = input.soilgrids.profile.length > 0;
    let score =
      hasInta && hasSoilGrids ? 0.55 : hasInta ? 0.45 : hasSoilGrids ? 0.35 : 0;

    const coverage = Math.max(
      input.inta.coveragePercentage || 0,
      input.soilgrids.coveragePercentage || 0,
    );
    score += Math.min(0.2, (coverage / 100) * 0.2);
    factors.push(`Cobertura válida: ${coverage.toFixed(1)}%.`);

    const hasRegionalInta = input.inta.units.some(
      (unit) => unit.source === 'inta_local',
    );
    if (hasRegionalInta) {
      score += 0.1;
      factors.push('Existe cartografía INTA regional de mayor detalle.');
    } else if (hasInta) {
      score += 0.05;
      factors.push('La cartografía INTA disponible es nacional.');
    }

    if (
      input.geometry.areaM2 <
      SOILGRIDS_RESOLUTION_METERS * SOILGRIDS_RESOLUTION_METERS
    ) {
      score -= 0.15;
      factors.push('El lote es menor que una celda SoilGrids de 250 m.');
    }
    if (input.heterogeneous) {
      score -= 0.1;
      factors.push('El polígono contiene unidades edáficas heterogéneas.');
    }
    if (input.inta.failedLayers.length) {
      score -= 0.08;
      factors.push(
        'Una o más capas INTA estuvieron temporalmente indisponibles.',
      );
    }
    const maximumTextureClosureDeviation = input.soilgrids.profile.reduce(
      (maximum, layer) =>
        Number.isFinite(layer.textureCompositionOriginalSum)
          ? Math.max(
              maximum,
              Math.abs(layer.textureCompositionOriginalSum! - 100),
            )
          : maximum,
      0,
    );
    if (maximumTextureClosureDeviation > 5) {
      score -= 0.1;
      factors.push(
        `Cierre composicional SoilGrids máximo: ${maximumTextureClosureDeviation.toFixed(1)} puntos.`,
      );
    }
    if (input.intaTexture && input.soilgridsTexture) {
      if (input.intaTexture === input.soilgridsTexture) {
        score += 0.1;
        factors.push('INTA y SoilGrids coinciden en la clase Chaman.');
      } else {
        score -= 0.1;
        factors.push('INTA y SoilGrids difieren en la clase Chaman.');
      }
    }

    score = Number(Math.max(0, Math.min(1, score)).toFixed(3));
    const level: TConfianzaInteligenciaSuelo =
      score >= 0.8
        ? 'high'
        : score >= 0.55
          ? 'medium'
          : score > 0
            ? 'low'
            : 'unavailable';
    return { score, level, factors };
  }
}
