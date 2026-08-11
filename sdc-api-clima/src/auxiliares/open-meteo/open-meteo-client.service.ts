import { Injectable, Logger } from '@nestjs/common';
import {
  OPEN_METEO_API_KEY,
  OPEN_METEO_ARCHIVE_API_KEY,
  OPEN_METEO_MAX_CONCURRENCY,
  OPEN_METEO_MAX_RETRIES,
  OPEN_METEO_MIN_INTERVAL_MS,
  OPEN_METEO_TIMEOUT_MS,
} from '../../env';

type CacheEntry = {
  expiresAt: number;
  staleUntil: number;
  data: unknown;
  sizeBytes: number;
};

class OpenMeteoQueueSaturatedError extends Error {}
class OpenMeteoDeadlineExceededError extends Error {}
class OpenMeteoProviderBlockedError extends Error {}

type OpenMeteoSlotWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
};

export function openMeteoCacheKey(value: URL | string): string {
  const url = new URL(value.toString());
  url.searchParams.delete('apikey');
  url.searchParams.sort();
  return url.toString();
}

export function withOpenMeteoApiKey(
  value: URL | string,
  apiKey: string,
): string {
  const url = new URL(value.toString());
  url.searchParams.delete('apikey');
  const credentialHosts = new Set([
    'customer-api.open-meteo.com',
    'customer-archive-api.open-meteo.com',
  ]);
  if (apiKey && credentialHosts.has(url.hostname.toLowerCase())) {
    url.searchParams.set('apikey', apiKey);
  }
  return url.toString();
}

export function openMeteoApiKeyForUrl(
  value: URL | string,
  forecastApiKey: string,
  archiveApiKey: string,
): string {
  const url = new URL(value.toString());
  switch (url.hostname.toLowerCase()) {
    case 'customer-api.open-meteo.com':
      return forecastApiKey;
    case 'customer-archive-api.open-meteo.com':
      return archiveApiKey;
    default:
      return '';
  }
}

export function sanitizeOpenMeteoMessage(
  value: unknown,
  ...apiKeys: string[]
): string {
  let message = value instanceof Error ? value.message : String(value ?? '');
  message = message.replace(/([?&]apikey=)[^&\s]+/gi, '$1[REDACTED]');
  for (const apiKey of apiKeys) {
    if (apiKey) message = message.split(apiKey).join('[REDACTED]');
  }
  return message;
}

export function openMeteoRetryAfterMs(
  retryAfter: string | null | undefined,
  fallbackMs: number,
  now = Date.now(),
): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, date - now);
    }
  }
  return Math.max(0, fallbackMs);
}

/**
 * Cliente compartido por proceso para todas las salidas a Open-Meteo.
 * Deduplica requests iguales, limita concurrencia y espacia inicios para que
 * los cron y las actualizaciones manuales no generen rafagas independientes.
 */
@Injectable()
export class OpenMeteoClientService {
  private readonly logger = new Logger(OpenMeteoClientService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  private readonly pending = new Map<string, Promise<unknown | null>>();
  private readonly cacheMs = 10 * 60 * 1000;
  private readonly staleMs = 24 * 60 * 60 * 1000;
  private readonly retryBaseMs = 1500;
  private readonly maxCacheEntries = 500;
  private readonly maxCacheBytes = 32 * 1024 * 1024;
  private readonly maxCacheEntryBytes = 8 * 1024 * 1024;
  private readonly maxPendingRequests = 100;
  private readonly maxQueueWaiters = 32;
  private readonly maxProviderBackoffMs = 60_000;
  private readonly maxInlineRetryMs = 10_000;
  private readonly requestDeadlineMs = Math.max(
    5_000,
    Math.min(20_000, OPEN_METEO_TIMEOUT_MS + 4_000),
  );
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private providerBlockedUntil = 0;

  private activeRequests = 0;
  private readonly slotWaiters: OpenMeteoSlotWaiter[] = [];
  private nextStartAt = 0;

  async getJson<T = any>(url: URL, context: string): Promise<T | null> {
    const safeUrl = openMeteoCacheKey(url);
    const cached = this.cache.get(safeUrl);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      this.touchCache(safeUrl, cached);
      return cached.data as T;
    }

    if (this.providerBlockedUntil > now) {
      return this.stale<T>(safeUrl, cached, context, 'proveedor en espera');
    }

    const inFlight = this.pending.get(safeUrl);
    if (inFlight) {
      return (await inFlight) as T | null;
    }

    if (this.circuitOpenUntil > now) {
      return this.stale<T>(safeUrl, cached, context, 'circuito abierto');
    }
    if (this.pending.size >= this.maxPendingRequests) {
      this.logger.warn(
        `Open-Meteo ${this.sanitize(context)}: cola completa; no se agrega otra solicitud.`,
      );
      return this.stale<T>(safeUrl, cached, context, 'cola completa');
    }

    const deadlineAt = now + this.requestDeadlineMs;
    const request = this.fetchFresh<T>(safeUrl, context, deadlineAt)
      .then(
        (data) =>
          data ??
          this.stale<T>(safeUrl, cached, context, 'fuente no disponible'),
      )
      .finally(() => this.pending.delete(safeUrl));
    this.pending.set(safeUrl, request as Promise<unknown | null>);
    return request;
  }

  private async fetchFresh<T>(
    safeUrl: string,
    context: string,
    deadlineAt: number,
  ): Promise<T | null> {
    const safeContext = this.sanitize(context);
    const apiKey = openMeteoApiKeyForUrl(
      safeUrl,
      OPEN_METEO_API_KEY,
      OPEN_METEO_ARCHIVE_API_KEY,
    );
    for (let attempt = 0; attempt <= OPEN_METEO_MAX_RETRIES; attempt++) {
      let response: Response | undefined;
      let retryWaitMs: number | undefined;
      let retryWaitExceeded = false;
      try {
        if (attempt > 0) await this.waitForInlineRetry(deadlineAt);
        const release = await this.acquireSlot(deadlineAt);
        try {
          const remainingMs = deadlineAt - Date.now();
          if (remainingMs <= 0) {
            throw new OpenMeteoDeadlineExceededError(
              'deadline Open-Meteo agotado',
            );
          }
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            Math.max(1, Math.min(OPEN_METEO_TIMEOUT_MS, remainingMs)),
          );
          try {
            response = await fetch(withOpenMeteoApiKey(safeUrl, apiKey), {
              signal: controller.signal,
            });
            if (response.ok) {
              const data = (await response.json()) as T;
              if (!data || typeof data !== 'object' || (data as any).error) {
                throw new Error('respuesta JSON invalida');
              }
              const now = Date.now();
              const sizeBytes = this.serializedSizeBytes(data);
              if (sizeBytes <= this.maxCacheEntryBytes) {
                this.deleteCacheEntry(safeUrl);
                this.cache.set(safeUrl, {
                  expiresAt: now + this.cacheMs,
                  staleUntil: now + this.cacheMs + this.staleMs,
                  data,
                  sizeBytes,
                });
                this.cacheBytes += sizeBytes;
                this.pruneCache(now);
              } else {
                this.logger.warn(
                  `Open-Meteo ${safeContext}: respuesta fresca demasiado grande para cache; se entrega sin persistir en memoria.`,
                );
              }
              this.consecutiveFailures = 0;
              this.circuitOpenUntil = 0;
              return data;
            }
            if (this.isRetryableStatus(response.status)) {
              const requestedWaitMs = this.retryDelay(response, attempt);
              retryWaitMs = Math.min(requestedWaitMs, this.maxInlineRetryMs);
              retryWaitExceeded = requestedWaitMs > this.maxInlineRetryMs;
              this.blockProvider(
                Math.min(requestedWaitMs, this.maxProviderBackoffMs),
              );
            }
            await this.cancelResponseBody(response);
          } finally {
            clearTimeout(timeout);
          }
        } finally {
          release();
        }

        if (
          this.isRetryableStatus(response.status) &&
          attempt < OPEN_METEO_MAX_RETRIES &&
          !retryWaitExceeded
        ) {
          this.logger.warn(
            `Open-Meteo ${safeContext} respondio ${response.status}; reintento en ${retryWaitMs ?? 0} ms.`,
          );
          continue;
        }

        if (retryWaitExceeded) {
          this.logger.warn(
            `Open-Meteo ${safeContext} solicito una espera excesiva; se conserva el bloqueo global y se usa cache si existe.`,
          );
        }

        this.logger.error(
          `Open-Meteo ${safeContext} respondio ${response.status}.`,
        );
        this.registerFailure();
        return null;
      } catch (error) {
        if (
          error instanceof OpenMeteoQueueSaturatedError ||
          error instanceof OpenMeteoDeadlineExceededError ||
          error instanceof OpenMeteoProviderBlockedError
        ) {
          this.logger.warn(
            `Open-Meteo ${safeContext}: espera descartada por cola, bloqueo o deadline; se usa cache si existe.`,
          );
          return null;
        }
        const waitMs = Math.min(
          this.withJitter(this.retryBaseMs * 2 ** attempt),
          this.maxInlineRetryMs,
        );
        this.blockProvider(waitMs);
        if (attempt < OPEN_METEO_MAX_RETRIES) {
          this.logger.warn(
            `Error Open-Meteo ${safeContext}; reintento en ${waitMs} ms: ${this.sanitize(error)}`,
          );
          continue;
        }

        this.logger.error(
          `Error al obtener Open-Meteo ${safeContext}: ${this.sanitize(error)}`,
        );
        this.registerFailure();
        return null;
      }
    }
    return null;
  }

  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private retryDelay(response: Response, attempt: number): number {
    return openMeteoRetryAfterMs(
      response.headers.get('retry-after'),
      this.withJitter(this.retryBaseMs * 2 ** attempt),
    );
  }

  private async acquireSlot(deadlineAt: number): Promise<() => void> {
    const now = Date.now();
    if (this.providerBlockedUntil > now) {
      throw new OpenMeteoProviderBlockedError(
        'proveedor Open-Meteo temporalmente bloqueado',
      );
    }

    let ownsSlot = false;
    if (this.activeRequests < OPEN_METEO_MAX_CONCURRENCY) {
      this.activeRequests += 1;
      ownsSlot = true;
    } else {
      if (this.slotWaiters.length >= this.maxQueueWaiters) {
        throw new OpenMeteoQueueSaturatedError('cola Open-Meteo completa');
      }
      const remainingMs = deadlineAt - now;
      if (remainingMs <= 0 || this.estimatedQueueWaitMs(now) >= remainingMs) {
        throw new OpenMeteoDeadlineExceededError(
          'la espera estimada excede el deadline Open-Meteo',
        );
      }
      await new Promise<void>((resolve, reject) => {
        const waiter: OpenMeteoSlotWaiter = {
          resolve,
          reject,
          settled: false,
          timer: undefined as unknown as ReturnType<typeof setTimeout>,
        };
        waiter.timer = setTimeout(() => {
          if (waiter.settled) return;
          waiter.settled = true;
          const index = this.slotWaiters.indexOf(waiter);
          if (index >= 0) this.slotWaiters.splice(index, 1);
          reject(
            new OpenMeteoDeadlineExceededError(
              'deadline agotado mientras esperaba un slot Open-Meteo',
            ),
          );
        }, remainingMs);
        this.slotWaiters.push(waiter);
      });
      ownsSlot = true;
    }

    try {
      await this.waitForPacedStart(deadlineAt);
    } catch (error) {
      if (ownsSlot) this.releaseSlot();
      throw error;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseSlot();
    };
  }

  private releaseSlot(): void {
    while (this.slotWaiters.length > 0) {
      const next = this.slotWaiters.shift()!;
      if (next.settled) continue;
      next.settled = true;
      clearTimeout(next.timer);
      next.resolve();
      return;
    }
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  private estimatedQueueWaitMs(now = Date.now()): number {
    const queuePosition = this.slotWaiters.length + 1;
    const wavesAhead = Math.ceil(
      queuePosition / Math.max(1, OPEN_METEO_MAX_CONCURRENCY),
    );
    const serviceMs = Math.min(OPEN_METEO_TIMEOUT_MS, this.requestDeadlineMs);
    return (
      Math.max(0, this.nextStartAt - now) +
      wavesAhead * serviceMs +
      queuePosition * OPEN_METEO_MIN_INTERVAL_MS
    );
  }

  private async waitForPacedStart(deadlineAt: number): Promise<void> {
    const now = Date.now();
    if (this.providerBlockedUntil > now) {
      throw new OpenMeteoProviderBlockedError(
        'proveedor Open-Meteo temporalmente bloqueado',
      );
    }
    const startAt = Math.max(now, this.nextStartAt);
    if (startAt >= deadlineAt) {
      throw new OpenMeteoDeadlineExceededError(
        'el pacing excede el deadline Open-Meteo',
      );
    }
    this.nextStartAt = startAt + OPEN_METEO_MIN_INTERVAL_MS;
    const waitMs = startAt - now;
    if (waitMs > 0) await this.wait(waitMs);
    if (Date.now() >= deadlineAt) {
      throw new OpenMeteoDeadlineExceededError(
        'deadline agotado antes de iniciar Open-Meteo',
      );
    }
    if (this.providerBlockedUntil > Date.now()) {
      throw new OpenMeteoProviderBlockedError(
        'proveedor Open-Meteo bloqueado durante el pacing',
      );
    }
  }

  private async waitForInlineRetry(deadlineAt: number): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.providerBlockedUntil - now);
    if (!waitMs) return;
    if (now + waitMs >= deadlineAt) {
      throw new OpenMeteoDeadlineExceededError(
        'el backoff excede el deadline Open-Meteo',
      );
    }
    await this.wait(waitMs);
    if (Date.now() >= deadlineAt) {
      throw new OpenMeteoDeadlineExceededError(
        'deadline agotado durante el backoff Open-Meteo',
      );
    }
  }

  private registerFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 5) {
      this.circuitOpenUntil = Date.now() + 60_000;
      this.logger.warn('Circuito Open-Meteo abierto por 60 segundos.');
    }
  }

  private blockProvider(ms: number): void {
    const boundedMs = Math.max(0, Math.min(ms, this.maxProviderBackoffMs));
    this.providerBlockedUntil = Math.max(
      this.providerBlockedUntil,
      Date.now() + boundedMs,
    );
  }

  private stale<T>(
    key: string,
    cached: CacheEntry | undefined,
    context: string,
    reason: string,
  ): T | null {
    if (!cached || cached.staleUntil <= Date.now()) return null;
    this.touchCache(key, cached);
    this.logger.warn(
      `Open-Meteo ${this.sanitize(context)}: usando cache de emergencia (${reason}).`,
    );
    return cached.data as T;
  }

  private pruneCache(now: number): void {
    this.cacheBytes = 0;
    for (const [key, value] of this.cache) {
      if (value.staleUntil <= now) {
        this.cache.delete(key);
        continue;
      }
      const sizeBytes =
        Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0
          ? value.sizeBytes
          : this.serializedSizeBytes(value.data);
      value.sizeBytes = sizeBytes;
      this.cacheBytes += sizeBytes;
    }
    while (
      this.cache.size > this.maxCacheEntries ||
      this.cacheBytes > this.maxCacheBytes
    ) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.deleteCacheEntry(oldest);
    }
  }

  private touchCache(key: string, value: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, value);
  }

  private deleteCacheEntry(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.cache.delete(key);
    this.cacheBytes = Math.max(
      0,
      this.cacheBytes -
        (Number.isFinite(entry.sizeBytes)
          ? entry.sizeBytes
          : this.serializedSizeBytes(entry.data)),
    );
  }

  private serializedSizeBytes(data: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return this.maxCacheEntryBytes + 1;
    }
  }

  private async cancelResponseBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // El status y los headers ya fueron leidos. La cancelacion es best-effort.
    }
  }

  private sanitize(value: unknown): string {
    return sanitizeOpenMeteoMessage(
      value,
      OPEN_METEO_API_KEY,
      OPEN_METEO_ARCHIVE_API_KEY,
    );
  }

  private withJitter(ms: number): number {
    return Math.round(ms * (0.8 + Math.random() * 0.4));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
