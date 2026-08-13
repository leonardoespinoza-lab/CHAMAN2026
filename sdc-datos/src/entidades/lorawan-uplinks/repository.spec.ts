import { LorawanUplinksRepository } from './repository';

describe('LorawanUplinksRepository inventory', () => {
  it('returns one most recent uplink per normalized DevEUI', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      {
        devEUI: '24E124454E358347',
        gatewayID: 'arturo',
        timestamp: '2026-08-12T18:00:00.000Z',
      },
      {
        devEUI: '24E124433F027440',
        gatewayID: 'kleppe',
        timestamp: '2026-07-11T19:30:00.000Z',
      },
    ]);
    const repository = new LorawanUplinksRepository({ aggregate } as any);

    const rows = await repository.latestByDevice(1000);

    expect(rows).toHaveLength(2);
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          devEUI: { $exists: true, $nin: [null, ''] },
        },
      },
      { $sort: { timestamp: -1, fechaCreacion: -1 } },
      {
        $group: {
          _id: { $toUpper: '$devEUI' },
          uplink: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$uplink' } },
      { $sort: { timestamp: -1, fechaCreacion: -1 } },
      { $limit: 1000 },
    ]);
  });

  it('caps the inventory without allowing an empty or unbounded query', async () => {
    const aggregate = jest.fn().mockResolvedValue([]);
    const repository = new LorawanUplinksRepository({ aggregate } as any);

    await repository.latestByDevice(100_000);
    expect(aggregate.mock.calls[0][0].at(-1)).toEqual({ $limit: 5000 });

    await repository.latestByDevice(0);
    expect(aggregate.mock.calls[1][0].at(-1)).toEqual({ $limit: 1000 });
  });
});
