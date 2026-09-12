import { IntegrationRuntime } from './runtime';

describe('Distributed integration controls', () => {
  let runtime: IntegrationRuntime;
  let redis: any;
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    redis = {
      set: jest.fn(async (key, owner) => {
        if (values.has(key)) return null;
        values.set(key, owner);
        return 'OK';
      }),
      get: jest.fn(async (key) => values.get(key)),
      eval: jest.fn(async (script, _count, key, owner) => {
        if (script.includes('INCR')) return 1;
        if (values.get(key) !== owner) return 0;
        if (script.includes("'DEL'")) values.delete(key);
        return 1;
      }),
      disconnect: jest.fn(),
    };
    runtime = new IntegrationRuntime();
    (runtime as any).redis = redis;
  });
  afterEach(() => {
    runtime.onModuleDestroy();
    jest.useRealTimers();
  });
  test('limits per-client traffic and fails closed on Redis outage', async () => {
    await runtime.rateLimit('a', 60);
    expect(redis.eval.mock.calls[0][2]).toBe('integrations:v1:rate:a');
    redis.eval.mockResolvedValueOnce(61);
    await expect(runtime.rateLimit('a', 60)).rejects.toMatchObject({
      status: 429,
    });
    redis.eval.mockRejectedValueOnce(new Error('connection secret'));
    await expect(runtime.rateLimit('b', 60)).rejects.toThrow(
      'capacidad temporalmente',
    );
  });
  test('excludes a concurrent writer without deleting its lease', async () => {
    values.set('integrations:v1:write:a', 'other-owner');
    const task = jest.fn();
    await expect(runtime.exclusive('a', task)).rejects.toMatchObject({
      status: 409,
    });
    expect(task).not.toHaveBeenCalled();
    expect(values.get('integrations:v1:write:a')).toBe('other-owner');
  });
  test('releases its own lease on success and on task failure', async () => {
    await expect(
      runtime.exclusive('a', async (held) => {
        await held();
        return 'ok';
      }),
    ).resolves.toBe('ok');
    expect(values.size).toBe(0);
    await expect(
      runtime.exclusive('b', async () => {
        throw new Error('business');
      }),
    ).rejects.toThrow('business');
    expect(values.size).toBe(0);
  });
  test('renews long operations and detects ownership loss before another write', async () => {
    jest.useFakeTimers();
    await runtime.exclusive('a', async (held) => {
      await jest.advanceTimersByTimeAsync(61000);
      expect(
        redis.eval.mock.calls.filter((call) => call[0].includes("'PEXPIRE'"))
          .length,
      ).toBe(2);
      await held();
    });
    await expect(
      runtime.exclusive('a', async (held) => {
        values.set('integrations:v1:write:a', 'replacement');
        await held();
      }),
    ).rejects.toThrow('reserva de escritura');
    expect(values.get('integrations:v1:write:a')).toBe('replacement');
    expect(jest.getTimerCount()).toBe(0);
  });
});
