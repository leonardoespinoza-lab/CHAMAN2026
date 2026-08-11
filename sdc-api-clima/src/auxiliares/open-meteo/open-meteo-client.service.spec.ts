import {
  OpenMeteoClientService,
  openMeteoApiKeyForUrl,
  openMeteoCacheKey,
  openMeteoRetryAfterMs,
  sanitizeOpenMeteoMessage,
  withOpenMeteoApiKey,
} from './open-meteo-client.service';

describe('OpenMeteoClientService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('mantiene la clave fuera de cache y logs', () => {
    const apiKey = 'unit-test-token-value';
    const archiveApiKey = 'unit-test-archive-token-value';
    const request = withOpenMeteoApiKey(
      'https://customer-api.open-meteo.com/v1/forecast?latitude=-33',
      apiKey,
    );

    expect(request).toContain(`apikey=${apiKey}`);
    expect(openMeteoCacheKey(request)).not.toContain(apiKey);
    expect(sanitizeOpenMeteoMessage(`fallo ${request}`, apiKey)).toContain(
      'apikey=[REDACTED]',
    );
    expect(sanitizeOpenMeteoMessage(`fallo ${request}`, apiKey)).not.toContain(
      apiKey,
    );
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
        'https://customer-api.open-meteo.com.evil.example/v1/forecast',
        apiKey,
      ),
    ).not.toContain('apikey=');
    expect(
      openMeteoApiKeyForUrl(
        'https://customer-archive-api.open-meteo.com.evil.example/v1/archive',
        apiKey,
        archiveApiKey,
      ),
    ).toBe('');
  });

  it('interpreta Retry-After en segundos y fecha HTTP', () => {
    expect(openMeteoRetryAfterMs('3', 100, 0)).toBe(3000);
    expect(
      openMeteoRetryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 100, 1000),
    ).toBe(4000);
  });

  it('deduplica solicitudes simultaneas equivalentes', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ daily: { time: ['2026-08-10'] } }),
    } as Response);
    const client = new OpenMeteoClientService();
    const url = new URL(
      'https://api.open-meteo.com/v1/forecast?longitude=-60&latitude=-33',
    );

    const [first, second] = await Promise.all([
      client.getJson(url, 'test'),
      client.getJson(url, 'test'),
    ]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hace como maximo un reintento y respeta Retry-After', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '2' }),
        body: { cancel },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ daily: { time: ['2026-08-10'] } }),
      } as Response);
    const client = new OpenMeteoClientService();
    const wait = jest
      .spyOn(client as any, 'wait')
      .mockImplementation(async (ms: number) => {
        now += ms;
      });

    await expect(
      client.getJson(
        new URL(
          'https://api.open-meteo.com/v1/forecast?latitude=-34&longitude=-61',
        ),
        'retry test',
      ),
    ).resolves.toEqual({ daily: { time: ['2026-08-10'] } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('acota Retry-After extremo y no deja pendiente el request', async () => {
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
          'https://api.open-meteo.com/v1/forecast?latitude=-35&longitude=-62',
        ),
        'retry extremo',
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((client as any).providerBlockedUntil).toBe(now + 60_000);
    expect((client as any).pending.size).toBe(0);
  });

  it('aplica topes efectivos a cache, pending y waiters', async () => {
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
    expect(client.cache.has('key-500')).toBe(true);

    client.maxPendingRequests = 1;
    client.pending.set('occupied', Promise.resolve(null));
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      client.getJson(
        new URL(
          'https://api.open-meteo.com/v1/forecast?latitude=-36&longitude=-63',
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
          'https://api.open-meteo.com/v1/forecast?latitude=-37&longitude=-64',
        ),
        'waiters completos',
      ),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa stale inmediatamente cuando el proveedor tiene bloqueo global', async () => {
    const now = 4_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    const url = new URL(
      'https://api.open-meteo.com/v1/forecast?latitude=-38&longitude=-65',
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

  it('descarta una cola cuyo tiempo estimado excede el deadline', async () => {
    const now = 5_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    client.requestDeadlineMs = 1_000;
    client.activeRequests = 1_000;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      client.getJson(
        new URL(
          'https://api.open-meteo.com/v1/forecast?latitude=-39&longitude=-66',
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

  it('vence y elimina un waiter sin perder ni inventar slots activos', async () => {
    const now = 6_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    client.requestDeadlineMs = 100;
    client.activeRequests = 1_000;
    jest.spyOn(client, 'estimatedQueueWaitMs').mockReturnValue(0);
    const fetchMock = jest.spyOn(global, 'fetch');

    const result = client.getJson(
      new URL(
        'https://api.open-meteo.com/v1/forecast?latitude=-40&longitude=-67',
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

  it('limita el cache por bytes y evita persistir una respuesta sobredimensionada', async () => {
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
    const payload = { daily: { time: ['respuesta-demasiado-grande'] } };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);

    await expect(
      client.getJson(
        new URL(
          'https://api.open-meteo.com/v1/forecast?latitude=-41&longitude=-68',
        ),
        'respuesta grande',
      ),
    ).resolves.toEqual(payload);
    expect(client.cache.size).toBe(0);
    expect(client.cacheBytes).toBe(0);
  });
});
