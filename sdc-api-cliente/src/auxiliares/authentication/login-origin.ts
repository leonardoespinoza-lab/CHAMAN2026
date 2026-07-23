import { isIP } from 'node:net';
import { Request } from 'express';

export const LOGIN_ORIGIN_HEADER = 'X-Chaman-Login-Origin';

export function normalizedLoginOrigin(req: Request): string {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const candidates = [
    forwarded,
    String(req?.ip || '').trim(),
    String(req?.socket?.remoteAddress || '').trim(),
  ];

  for (const candidate of candidates) {
    const bounded = candidate.slice(0, 128);
    if (isIP(bounded)) {
      return bounded;
    }
  }

  return 'unknown';
}
