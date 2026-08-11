import {
  OpenMeteoClientService,
  openMeteoApiKeyForUrl,
  openMeteoCacheKey,
  openMeteoRetryAfterMs,
  sanitizeOpenMeteoMessage,
  withOpenMeteoApiKey,
} from './open-meteo-client.service';

describe('OpenMeteoClientService de cliente', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('separa el secreto de las claves de cache y los logs', () => {
    const apiKey = 'unit-test-token-value';
    const archiveApiKey = 'unit-test-archive-token-value';
    const request = withOpenMeteoApiKey(
      'https://customer-archive-api.open-meteo.com/v1/archive?latitude=-33',
      apiKey,
    );

    expect(openMeteoCacheKey(request)).not.toContain(apiKey);
    expect(sanitizeOpenMeteoMessage(request, apiKey)).toContain(
      'apikey=[REDACTED]',
    );
    expect(sanitizeOpenMeteoMessage(request, apiKey)).not.toContain(apiKey);
    expect(
      sanitizeOpenMeteoMessage(`fallo ${archiveApiKey}`, apiKey, archiveApiKey),
    ).not.toContain(archiveApiKey);
    expect(
      withOpenMeteoApiKey(
        'https://archive-api.open-meteo.com/v1/archive?latitude=-33',
        '',
      ),
    ).not.toContain('apikey=');
    expect(
      openMeteoApiKeyForUrl(
        'https://archive-api.open-meteo.com/v1/archive',
        apiKey,
        '',
      ),
    ).toBe('');
    expect(
      openMeteoApiKeyForUrl(
        'https://customer-archive-api.open-meteo.com/v1/archive',
        apiKey,
        archiveApiKey,
      ),
    ).toBe(archiveApiKey);
    expect(
      openMeteoApiKeyForUrl(
        'https://customer-api.open-meteo.com/v1/forecast',
        apiKey,
        archiveApiKey,
      ),
    ).toBe(apiKey);
    expect(
      withOpenMeteoApiKey(
        'https://customer-archive-api.open-meteo.com.attacker.example/v1/archive',
        archiveApiKey,
      ),
    ).not.toContain('apikey=');
    expect(
      openMeteoApiKeyForUrl(
        'https://archive-api.open-meteo.com/v1/archive',
        apiKey,
        archiveApiKey,
      ),
    ).toBe('');
  });

  it('interpreta Retry-After y deduplica el fallback directo', async () => {
    expect(openMeteoRetryAfterMs('2', 100, 0)).toBe(2000);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hourly: { time: ['2026-08-10T00:00'] } }),
    } as Response);
    const client = new OpenMeteoClientService();
    const url = new URL(
      'https://archive-api.open-meteo.com/v1/archive?latitude=-33&longitude=-60',
    );

    await Promise.all([
      client.getJson(url, 'historico'),
      client.getJson(url, 'historico'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('acota el backoff global, cancela el body 429 y libera pending', async () => {
    const now = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '86400' }),
      body: { cancel },
    } as unknown as Response);
    const client = new OpenMeteoClientService();

    await expect(
      client.getJson(
        new URL(
          'https://archive-api.open-meteo.com/v1/archive?latitude=-35&longitude=-62',
        ),
        'retry extremo',
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((client as any).providerBlockedUntil).toBe(now + 60_000);
    expect((client as any).pending.size).toBe(0);
  });

  it('limita cache y rechaza nuevas solicitudes cuando las colas se saturan', async () => {
    const now = 3_000_000;
    const client = new OpenMeteoClientService() as any;
    for (let index = 0; index <= 500; index++) {
      client.cache.set(`key-${index}`, {
        expiresAt: now + 60_000,
        staleUntil: now + 120_000,
        data: { index },
      });
    }
    client.pruneCache(now);
    expect(client.cache.size).toBe(500);
    expect(client.cache.has('key-0')).toBe(false);

    client.maxPendingRequests = 1;
    client.pending.set('occupied', Promise.resolve(null));
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      client.getJson(
        new URL(
          'https://archive-api.open-meteo.com/v1/archive?latitude=-36&longitude=-63',
        ),
        'pending completo',
      ),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    client.pending.clear();
    client.maxQueueWaiters = 0;
    client.activeRequests = 1_000;
    await expect(
      client.getJson(
        new URL(
          'https://archive-api.open-meteo.com/v1/archive?latitude=-37&longitude=-64',
        ),
        'waiters completos',
      ),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa stale sin esperar cuando el proveedor tiene bloqueo global', async () => {
    const now = 4_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    const url = new URL(
      'https://archive-api.open-meteo.com/v1/archive?latitude=-38&longitude=-65',
    );
    const key = openMeteoCacheKey(url);
    client.cache.set(key, {
      expiresAt: now - 1,
      staleUntil: now + 60_000,
      data: { source: 'stale-seguro' },
    });
    client.providerBlockedUntil = now + 60_000;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(client.getJson(url, 'bloqueo global')).resolves.toEqual({
      source: 'stale-seguro',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.slotWaiters).toHaveLength(0);
    expect(client.activeRequests).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rechaza la cola si la espera estimada excede el deadline total', async () => {
    const now = 5_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    client.requestDeadlineMs = 1_000;
    client.activeRequests = 1_000;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      client.getJson(
        new URL(
          'https://archive-api.open-meteo.com/v1/archive?latitude=-39&longitude=-66',
        ),
        'cola fuera de deadline',
      ),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.slotWaiters).toHaveLength(0);
    expect(client.pending.size).toBe(0);
    expect(client.activeRequests).toBe(1_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('elimina un waiter vencido sin filtrar slots ni pending', async () => {
    const now = 6_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    client.requestDeadlineMs = 100;
    client.activeRequests = 1_000;
    jest.spyOn(client, 'estimatedQueueWaitMs').mockReturnValue(0);
    const fetchMock = jest.spyOn(global, 'fetch');

    const result = client.getJson(
      new URL(
        'https://archive-api.open-meteo.com/v1/archive?latitude=-40&longitude=-67',
      ),
      'waiter con deadline',
    );
    await Promise.resolve();
    expect(client.slotWaiters).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.slotWaiters).toHaveLength(0);
    expect(client.pending.size).toBe(0);
    expect(client.activeRequests).toBe(1_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('evicta por bytes y no cachea una serie fresca sobredimensionada', async () => {
    const client = new OpenMeteoClientService() as any;
    client.maxCacheBytes = 100;
    client.cache.set('oldest', {
      expiresAt: 7_060_000,
      staleUntil: 7_120_000,
      data: { value: 'a' },
      sizeBytes: 60,
    });
    client.cache.set('newest', {
      expiresAt: 7_060_000,
      staleUntil: 7_120_000,
      data: { value: 'b' },
      sizeBytes: 60,
    });
    client.pruneCache(7_000_000);
    expect(client.cache.has('oldest')).toBe(false);
    expect(client.cache.has('newest')).toBe(true);
    expect(client.cacheBytes).toBe(60);

    client.cache.clear();
    client.cacheBytes = 0;
    client.maxCacheEntryBytes = 16;
    const payload = { hourly: { time: ['respuesta-demasiado-grande'] } };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);

    await expect(
      client.getJson(
        new URL(
          'https://archive-api.open-meteo.com/v1/archive?latitude=-41&longitude=-68',
        ),
        'respuesta grande',
      ),
    ).resolves.toEqual(payload);
    expect(client.cache.size).toBe(0);
    expect(client.cacheBytes).toBe(0);
  });
});
