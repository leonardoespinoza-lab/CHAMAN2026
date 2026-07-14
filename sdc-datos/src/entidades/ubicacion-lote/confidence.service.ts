import { Injectable } from '@nestjs/common';
import { TConfianzaUbicacionLote } from 'modelos/src';

@Injectable()
export class LotLocationConfidenceService {
  calculate(input: {
    provinceCoverage: number;
    admin2Coverage: number;
    usedPointFallback: boolean;
    warnings: string[];
    hasProvince: boolean;
    hasAdmin2: boolean;
  }): { level: TConfianzaUbicacionLote; reasons: string[] } {
    const reasons: string[] = [];
    if (!input.hasProvince || !input.hasAdmin2) {
      reasons.push(
        'No se pudo determinar provincia y segundo nivel administrativo con cobertura suficiente.',
      );
      return { level: 'baja', reasons };
    }
    if (input.usedPointFallback) {
      reasons.push(
        'Se uso un punto representativo porque la capa poligonal no estuvo disponible.',
      );
      return { level: 'baja', reasons };
    }
    if (
      input.provinceCoverage >= 98 &&
      input.admin2Coverage >= 98 &&
      input.warnings.length === 0
    ) {
      reasons.push(
        'El poligono completo coincide en al menos 98% con provincia y jurisdiccion administrativa.',
      );
      return { level: 'alta', reasons };
    }
    if (input.provinceCoverage >= 90 && input.admin2Coverage >= 80) {
      reasons.push(
        'La mayor parte del poligono esta cubierta por las jurisdicciones oficiales seleccionadas.',
      );
      if (input.warnings.length)
        reasons.push('Existen advertencias que requieren revision visual.');
      return { level: 'media', reasons };
    }
    reasons.push(
      'La cobertura administrativa dominante es insuficiente o el lote cruza limites relevantes.',
    );
    return { level: 'baja', reasons };
  }
}
