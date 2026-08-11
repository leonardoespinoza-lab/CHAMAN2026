import { INestApplication, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

type CorsCallback = (err: Error | null, allow?: boolean) => void;

const PROD_ENVS = new Set(['production', 'prod']);

function isProduction(env?: string): boolean {
  return PROD_ENVS.has((env || '').toLowerCase());
}

function parseCsv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowedOrigins(env?: string): true | string[] {
  const configured = parseCsv(process.env.CORS_ORIGINS);
  if (configured.length) {
    return configured;
  }

  if (!isProduction(env)) {
    return true;
  }

  return [
    'https://app.chamanagro.ar',
    'https://chaman2026-production.up.railway.app',
    'https://chamanagro.ar',
    'https://www.chamanagro.ar',
  ];
}

function configureCors(app: INestApplication, logger: Logger, env?: string) {
  const origins = allowedOrigins(env);

  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'x-api-key',
      'appversion',
      'ngrok-skip-browser-warning',
      'X-Permiso',
    ],
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (origins === true || !origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }

      logger.warn(`CORS origin bloqueado: ${origin}`);
      callback(null, false);
    },
  });
}

function configureSecurityHeaders(app: INestApplication, env?: string) {
  const expressApp = app.getHttpAdapter().getInstance?.();
  if (expressApp?.disable) {
    expressApp.disable('x-powered-by');
  }

  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    if (isProduction(env)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  });
}

function configureBasicRateLimit(app: INestApplication, env?: string) {
  const defaultLimit = isProduction(env) ? 600 : 0;
  const maxRequests = Number(process.env.RATE_LIMIT_MAX || defaultLimit);
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  if (!maxRequests || maxRequests < 1) {
    return;
  }

  const buckets = new Map<string, { count: number; resetAt: number }>();

  app.use((req: any, res: any, next: () => void) => {
    if (req.path === '/health' || req.url === '/health') {
      next();
      return;
    }

    // Las llamadas privadas del pipeline comparten una misma IP dentro de
    // Railway. Aplicarles el bucket publico provoca 429 en cascada aunque el
    // emisor presente el secreto interno correcto.
    if (
      internalTokenMatches(
        req.headers?.['x-chaman-internal-token'],
        process.env.AGROMETEO_INTERNAL_TOKEN,
      )
    ) {
      next();
      return;
    }

    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    const ip = forwarded.split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.statusCode = 429;
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
      res.end('Too many requests');
      return;
    }

    next();
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, windowMs).unref?.();
}

export function internalTokenMatches(
  received: unknown,
  configured: string | undefined,
): boolean {
  if (!configured || typeof received !== 'string') return false;
  const expectedBuffer = Buffer.from(configured);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function shouldExposeSwagger(env?: string): boolean {
  if (process.env.SWAGGER_ENABLED !== undefined) {
    return process.env.SWAGGER_ENABLED === 'true';
  }

  return !isProduction(env);
}

export function applySecurityHardening(
  app: INestApplication,
  logger: Logger,
  env?: string,
) {
  configureSecurityHeaders(app, env);
  configureCors(app, logger, env);
  configureBasicRateLimit(app, env);
}
