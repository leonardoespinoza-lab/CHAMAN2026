import { API_CLIMA } from '../../env';
import { ChamanMeteoRepository } from './repository';

describe('ChamanMeteoRepository', () => {
  const axios = { GET: jest.fn() };
  const repository = new ChamanMeteoRepository(axios as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['hourly', '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 48],
    ['daily', '2026-08-01', '2026-09-01', 30],
  ] as const)(
    'forwards %s range to climate API',
    (grain, from, toExclusive, limit) => {
      repository[grain]('pilot-grid', limit, 7, from, toExclusive);

      expect(axios.GET).toHaveBeenCalledWith(
        `${API_CLIMA}/chaman-meteo/${grain}`,
        expect.objectContaining({
          params: {
            gridPointKey: 'pilot-grid',
            from,
            toExclusive,
            limit,
            offset: 7,
          },
        }),
      );
    },
  );
});
