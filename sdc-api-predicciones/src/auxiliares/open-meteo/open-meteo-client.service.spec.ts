import {
  OpenMeteoClientService,
  openMeteoCacheKey,
  openMeteoRetryAfterMs,
  sanitizeOpenMeteoMessage,
  withOpenMeteoApiKey,
} from './open-meteo-client.service';

describe('OpenMeteoClientService de predicciones', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('no conserva ni expone la API key en cache o mensajes', () => {
    const apiKey = 'unit-test-token-value';
    const request = withOpenMeteoApiKey(
      'https://customer-api.open-meteo.com/v1/forecast?latitude=-33',
      apiKey,
    );

    expect(openMeteoCacheKey(request)).not.toContain(apiKey);
    expect(sanitizeOpenMeteoMessage(request, apiKey)).toContain(
      'apikey=[REDACTED]',
    );
    expect(sanitizeOpenMeteoMessage(request, apiKey)).not.toContain(apiKey);
    expect(
      withOpenMeteoApiKey(
        'https://customer-api.open-meteo.com.attacker.example/v1/forecast',
        apiKey,
      ),
    ).not.toContain('apikey=');
    expect(
      withOpenMeteoApiKey('https://api.open-meteo.com/v1/forecast', apiKey),
    ).not.toContain('apikey=');
  });

  it('permite stale para continuidad pero lo bloquea en decisiones', async () => {
    const now = 4_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const url = new URL(
      'https://api.open-meteo.com/v1/forecast?latitude=-33&longitude=-61',
    );
    const staleData = { daily: { time: ['2026-08-09'] } };

    const client = new OpenMeteoClientService() as any;
    client.cache.set(openMeteoCacheKey(url), {
      expiresAt: now - 1,
      staleUntil: now + 60_000,
      data: staleData,
    });
    client.fetchFresh = jest.fn().mockResolvedValue(null);

    const [visual, decision] = await Promise.all([
      client.getJson(url, 'continuidad visual'),
      client.getJson(url, 'motor de alertas', { allowStale: false }),
    ]);
    expect(visual).toEqual(staleData);
    expect(decision).toBeNull();
    expect(client.fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('respeta Retry-After del proveedor', () => {
    expect(openMeteoRetryAfterMs('2', 100, 0)).toBe(2000);
  });

  it('single-flight evita dos llamadas para el mismo pronostico', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ daily: { time: ['2026-08-10'] } }),
    } as Response);
    const client = new OpenMeteoClientService();
    const url = new URL(
      'https://api.open-meteo.com/v1/forecast?longitude=-60&latitude=-33',
    );

    await Promise.all([
      client.getJson(url, 'agroclima'),
      client.getJson(url, 'agroclima'),
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

  it('sale en forma inmediata durante el bloqueo global del proveedor', async () => {
    const now = 4_000_000;
    jest.useFakeTimers({ now });
    const client = new OpenMeteoClientService() as any;
    client.providerBlockedUntil = now + 60_000;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      client.getJson(
        new URL(
          'https://api.open-meteo.com/v1/forecast?latitude=-38&longitude=-65',
        ),
        'bloqueo global',
        { allowStale: false },
      ),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.slotWaiters).toHaveLength(0);
    expect(client.activeRequests).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rechaza una cola cuyo tiempo estimado supera el deadline total', async () => {
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
        { allowStale: false },
      ),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.slotWaiters).toHaveLength(0);
    expect(client.pending.size).toBe(0);
    expect(client.activeRequests).toBe(1_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('elimina el waiter vencido y conserva consistente activeRequests', async () => {
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
      { allowStale: false },
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

  it('evicta por bytes y entrega fresh grande sin retenerlo en memoria', async () => {
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
        { allowStale: false },
      ),
    ).resolves.toEqual(payload);
    expect(client.cache.size).toBe(0);
    expect(client.cacheBytes).toBe(0);
  });
});
