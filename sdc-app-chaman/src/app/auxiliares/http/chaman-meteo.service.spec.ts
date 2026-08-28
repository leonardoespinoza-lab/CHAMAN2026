import { ChamanMeteoService } from './chaman-meteo.service';

describe('ChamanMeteoService history contract', () => {
  it('forwards grid-point pagination so the dashboard can recover every page', async () => {
    const http = { get: jasmine.createSpy('get').and.resolveTo({ datos: [], total: 0, limit: 500, offset: 500 }) };
    const service = new ChamanMeteoService(http as any);

    await service.gridPoints(500, 500);

    expect(http.get).toHaveBeenCalledOnceWith('/chaman-meteo/grid-points', {
      params: { limit: 500, offset: 500 },
    });
  });

  it('forwards the complete half-open hourly range and pagination', async () => {
    const http = { get: jasmine.createSpy('get').and.resolveTo({ datos: [], total: 0, limit: 500, offset: 500 }) };
    const service = new ChamanMeteoService(http as any);

    await service.hourlyHistory({
      gridPointKey: 'ar-neuquen-kleppe-pilot',
      from: '2026-08-01T03:00:00.000Z',
      toExclusive: '2026-08-23T03:00:00.000Z',
      limit: 500,
      offset: 500,
    });

    expect(http.get).toHaveBeenCalledOnceWith('/chaman-meteo/hourly', {
      params: {
        gridPointKey: 'ar-neuquen-kleppe-pilot',
        from: '2026-08-01T03:00:00.000Z',
        toExclusive: '2026-08-23T03:00:00.000Z',
        limit: 500,
        offset: 500,
      },
    });
  });

  it('keeps the legacy daily method and omits empty optional parameters', async () => {
    const http = { get: jasmine.createSpy('get').and.resolveTo({ datos: [], total: 0, limit: 30, offset: 0 }) };
    const service = new ChamanMeteoService(http as any);

    await service.daily(undefined, 30);

    expect(http.get).toHaveBeenCalledOnceWith('/chaman-meteo/daily', { params: { limit: 30 } });
  });
});
