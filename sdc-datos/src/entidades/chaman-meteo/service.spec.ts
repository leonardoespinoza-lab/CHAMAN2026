import { BadRequestException } from '@nestjs/common';
import { ChamanMeteoService } from './service';

describe('ChamanMeteoService', () => {
  const repository = {
    hourlyPage: jest.fn(),
    dailyPage: jest.fn(),
  };
  const service = new ChamanMeteoService(repository as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the persisted-hourly window and calculation version', () => {
    service.hourly(
      'pilot-grid',
      '2026-08-31T03:00:00Z',
      '2026-09-02T03:00:00Z',
      'chaman-meteo-agro-v1',
      '500',
      '0',
    );

    expect(repository.hourlyPage).toHaveBeenCalledWith(
      'pilot-grid',
      new Date('2026-08-31T03:00:00Z'),
      new Date('2026-09-02T03:00:00Z'),
      'chaman-meteo-agro-v1',
      500,
      0,
    );
  });

  it('rejects an inverted hourly window', () => {
    expect(() =>
      service.hourly(
        'pilot-grid',
        '2026-09-02T03:00:00Z',
        '2026-08-31T03:00:00Z',
      ),
    ).toThrow(BadRequestException);
  });

  it('filters daily data by calculation version', () => {
    service.daily('pilot-grid', 'chaman-meteo-agro-v1', '30', '0');

    expect(repository.dailyPage).toHaveBeenCalledWith(
      'pilot-grid',
      'chaman-meteo-agro-v1',
      30,
      0,
    );
  });

  it('rejects an invalid grid-point historical start', () => {
    expect(() =>
      service.upsertGridPoint({
        key: 'pilot-grid',
        latitude: -38.7888,
        longitude: -68.10434,
        enabled: true,
        historicalStart: '2026-02-30',
        provider: 'copernicus-cds',
        dataset: 'reanalysis-era5-land-timeseries',
      }),
    ).toThrow(BadRequestException);
  });
});
