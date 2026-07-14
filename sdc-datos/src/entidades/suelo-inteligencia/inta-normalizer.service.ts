import { Injectable } from '@nestjs/common';
import { TClaseDrenajeSuelo, TTexturaSuelo } from 'modelos/src';

const AMBIGUOUS_TEXTURE_TERMS = [
  'textura pesada',
  'textura media',
  'textura liviana',
  'suelo fino',
  'suelo grueso',
  'no determinada',
  'no determinado',
];

@Injectable()
export class IntaSoilTextNormalizer {
  normalizeTexture(value?: unknown): TTexturaSuelo | null {
    const text = this.normalize(value);
    if (!text || AMBIGUOUS_TEXTURE_TERMS.some((term) => text.includes(term))) {
      return null;
    }
    if (
      /(franco\s+arcill(?:oso|osa)?\s+limos|franco\s+arcillo\s+limos)/.test(
        text,
      ) ||
      /(franco\s+arcill(?:oso|osa)?\s+aren|franco\s+arcillo\s+aren)/.test(
        text,
      ) ||
      /arcill(?:oso|osa)?\s+franc/.test(text) ||
      /franco\s+arcill/.test(text)
    ) {
      return 'Franco arcilloso';
    }
    if (/arcillo\s*limos|arcillo\s*aren|arcill/.test(text)) {
      return 'Arcilloso';
    }
    if (/franco\s+limos|limoso\s+franc/.test(text)) {
      return 'Franco limoso';
    }
    if (/franco\s+aren|arena\s+franca|areno\s+franc/.test(text)) {
      return 'Franco arenoso';
    }
    if (/\b(limo|limos|limoso|limosa)\b/.test(text)) return 'Limoso';
    if (/\b(arena|arenas|arenoso|arenosa)\b/.test(text)) return 'Arenoso';
    if (/\b(franco|franca)\b/.test(text)) return 'Franco';
    return null;
  }

  normalizeDrainage(value?: unknown): TClaseDrenajeSuelo {
    const text = this.normalize(value);
    if (!text || text === '-') return 'unknown';
    if (/muy\s+pobre|muy\s+mal\s+dren/.test(text)) return 'very_poor';
    if (/pobre|mal\s+dren/.test(text)) return 'poor';
    if (/imperfect/.test(text)) return 'imperfect';
    if (/moderadamente\s+bien/.test(text)) return 'moderately_well';
    if (/algo\s+exces|moderadamente\s+exces/.test(text)) {
      return 'somewhat_excessive';
    }
    if (/exces/.test(text)) return 'excessive';
    if (/bien\s+dren/.test(text)) return 'well';
    return 'unknown';
  }

  normalize(value?: unknown): string {
    return `${value ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[_/,-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
