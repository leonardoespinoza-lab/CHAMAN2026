import { ILote } from 'modelos/src';
import { NdviQueueService } from './ndvi-queue.service';

describe('NdviQueueService', () => {
  const lote = {
    _id: 'lote-1',
    ubicacion: {
      geojson: {
        coordinates: [
          [
            [-68.1, -38.9],
            [-68.0, -38.9],
            [-68.0, -38.8],
            [-68.1, -38.9],
          ],
        ],
      },
    },
  } as unknown as ILote;

  const createSubject = () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      lpush: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
    };
    const service = new NdviQueueService();
    (service as any).enabled = true;
    (service as any).redis = redis;
    return { service, redis };
  };

  it('transporta una reserva identificable y los controles de backfill exacto', async () => {
    const { service, redis } = createSubject();

    await expect(
      service.enqueueLote(lote, '2026-07-05T10:00:00.000Z', 'sentinel-2-l2a', {
        forceRender: true,
        exactSceneDate: true,
        knownScenes: [
          {
            date: '2026-07-05T10:00:00.000Z',
            collection: 'sentinel-2-l2a',
          },
        ],
      }),
    ).resolves.toBe(true);

    const [dedupeKey, dedupeToken] = redis.set.mock.calls[0];
    const task = JSON.parse(redis.lpush.mock.calls[0][1]);

    expect(dedupeKey).toBe('ndvi-task:lote-1:2026-07-05:exact-v3');
    expect(dedupeToken).toEqual(expect.any(String));
    expect(task).toMatchObject({
      lote_id: 'lote-1',
      scene_datetime: '2026-07-05T10:00:00.000Z',
      scene_collection: 'sentinel-2-l2a',
      force_render: true,
      exact_scene_date: true,
      dedupe_key: dedupeKey,
      dedupe_token: dedupeToken,
      known_scenes: [
        {
          date: '2026-07-05T10:00:00.000Z',
          collection: 'sentinel-2-l2a',
        },
      ],
    });
  });

  it('libera su propia reserva si Redis falla antes de encolar', async () => {
    const { service, redis } = createSubject();
    redis.lpush.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(service.enqueueLote(lote)).rejects.toThrow(
      'queue unavailable',
    );

    const [dedupeKey, dedupeToken] = redis.set.mock.calls[0];
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1])"),
      1,
      dedupeKey,
      dedupeToken,
    );
  });

  it('no encola cuando otra tarea conserva la reserva', async () => {
    const { service, redis } = createSubject();
    redis.set.mockResolvedValueOnce(null);

    await expect(service.enqueueLote(lote)).resolves.toBe(false);
    expect(redis.lpush).not.toHaveBeenCalled();
  });
});
