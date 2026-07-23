jest.mock('../../env', () => ({
  ENV: 'test',
}));

import { CacheWarmingQueueService } from './cache-warming-queue.service';

describe('CacheWarmingQueueService login', () => {
  const permisos = [{ nivel: 'Productor' }] as any;

  const build = () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new CacheWarmingQueueService(queue as any);
    return { queue, service };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no encola cache warming al renovar el token', async () => {
    const { queue, service } = build();

    await service.warmTilesForUserLogin(
      'usuario-1',
      permisos,
      'refresh-token',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('deduplica logins del mismo usuario dentro de la ventana', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { queue, service } = build();

    await service.warmTilesForUserLogin('usuario-1', permisos, 'user-login');
    await service.warmTilesForUserLogin('usuario-1', permisos, 'user-login');

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].jobId).toBe(
      'cache-warm-login-usuario-1-3',
    );
  });

  it('permite una nueva precarga al comenzar otra ventana', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { queue, service } = build();

    await service.warmTilesForUserLogin('usuario-1', permisos, 'user-login');
    now.mockReturnValue(1_300_001);
    await service.warmTilesForUserLogin('usuario-1', permisos, 'user-login');

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][2].jobId).not.toBe(
      queue.add.mock.calls[1][2].jobId,
    );
  });

  it('libera la deduplicacion cuando la cola rechaza el trabajo', async () => {
    const { queue, service } = build();
    queue.add
      .mockRejectedValueOnce(new Error('redis no disponible'))
      .mockResolvedValueOnce({ id: 'job-2' });

    await expect(
      service.warmTilesForUserLogin(
        'usuario-1',
        permisos,
        'user-login',
      ),
    ).rejects.toThrow('redis no disponible');
    await expect(
      service.warmTilesForUserLogin(
        'usuario-1',
        permisos,
        'user-login',
      ),
    ).resolves.toBeUndefined();

    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});
