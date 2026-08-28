import { ChamanMeteoComponent } from './chaman-meteo.component';

describe('Chaman-Meteo dashboard integrity', () => {
  it('uses the status-level diagnostic for licence guidance', () => {
    const component = new ChamanMeteoComponent({} as any, {} as any);
    component.status = {
      lastError: 'ERA5-Land licence not accepted',
    } as any;

    expect(component.licenseRequired()).toBeTrue();
  });

  it('shows invalid configuration without calling protected data endpoints', async () => {
    const service = {
      status: jasmine.createSpy().and.resolveTo({
        state: 'ERROR',
        configurationValid: false,
        lastError: 'CHAMAN_METEO_SOURCE_VERSION inválida',
      }),
      gridPoints: jasmine.createSpy(),
      jobs: jasmine.createSpy(),
      hourlyHistory: jasmine.createSpy(),
      dailyHistory: jasmine.createSpy(),
    };
    const component = new ChamanMeteoComponent(service as any, {} as any);

    await component.refresh();

    expect(component.status?.configurationValid).toBeFalse();
    expect(component.status?.lastError).toContain('SOURCE_VERSION');
    expect(service.gridPoints).not.toHaveBeenCalled();
    expect(service.jobs).not.toHaveBeenCalled();
    expect(service.hourlyHistory).not.toHaveBeenCalled();
    expect(service.dailyHistory).not.toHaveBeenCalled();
    expect(component.error).toBe('');
  });

  it('keeps loading data from a v1 status that omits configurationValid', async () => {
    const service = {
      status: jasmine.createSpy().and.resolveTo({ state: 'AVAILABLE' }),
      gridPoints: jasmine.createSpy().and.resolveTo({ datos: [], total: 0 }),
      jobs: jasmine.createSpy().and.resolveTo({ datos: [], total: 0 }),
      hourlyHistory: jasmine.createSpy(),
      dailyHistory: jasmine.createSpy(),
    };
    const component = new ChamanMeteoComponent(service as any, {} as any);

    await component.refresh();

    expect(service.gridPoints).toHaveBeenCalledOnceWith(500, 0);
    expect(service.jobs).toHaveBeenCalled();
    expect(component.gridPoints).toEqual([]);
    expect(component.error).toBe('');
  });

  it('paginates until every grid point has been recovered', async () => {
    const pages = [
      { datos: [{ key: 'point-a' }, { key: 'point-b' }], total: 3 },
      { datos: [{ key: 'point-c' }], total: 3 },
    ];
    const service = {
      gridPoints: jasmine.createSpy().and.callFake(() => Promise.resolve(pages.shift())),
    };
    const component = new ChamanMeteoComponent(service as any, {} as any);
    (component as any).pageSize = 2;

    const points = await (component as any).fetchAllGridPoints();

    expect(service.gridPoints.calls.allArgs()).toEqual([[2, 0], [2, 2]]);
    expect(points.map((point: any) => point.key)).toEqual(['point-a', 'point-b', 'point-c']);
  });

  [
    {
      label: 'Argentina',
      timezone: 'America/Argentina/Buenos_Aires',
      period: '7d',
      latestHourly: '2026-08-20T02:00:00.000Z',
      expected: {
        from: '2026-08-13T03:00:00.000Z',
        toExclusive: '2026-08-20T03:00:00.000Z',
        dailyFrom: '2026-08-13',
        dailyToExclusive: '2026-08-20',
      },
    },
    {
      label: 'Chile',
      timezone: 'America/Santiago',
      period: '30d',
      latestHourly: '2026-09-06T03:30:00.000Z',
      expected: {
        from: '2026-08-07T04:00:00.000Z',
        toExclusive: '2026-09-06T04:00:00.000Z',
        dailyFrom: '2026-08-07',
        dailyToExclusive: '2026-09-06',
      },
    },
  ].forEach(({ label, timezone, period, latestHourly, expected }) => {
    it(`derives the ${label} civil date from the latest UTC hour when daily data is absent`, async () => {
      const service = {
        hourlyHistory: jasmine.createSpy().and.resolveTo({ datos: [{ timestamp: latestHourly }], total: 1 }),
        dailyHistory: jasmine.createSpy().and.resolveTo({ datos: [], total: 0 }),
      };
      const component = new ChamanMeteoComponent(service as any, {} as any);
      component.period = period as any;

      const range = await (component as any).resolveRange('point-a', timezone);

      expect(range).toEqual(expected);
    });
  });

  it('labels import and CDS access without claiming that the credential was validated', () => {
    const component = new ChamanMeteoComponent({} as any, {} as any);
    component.status = { importEnabled: true, credentialConfigured: true } as any;

    expect(component.importEnabledLabel()).toBe('Habilitada');
    expect(component.credentialStatusLabel()).toBe('Reportado, no validado');

    component.status = {} as any;
    expect(component.importEnabledLabel()).toBe('Sin información');
    expect(component.credentialStatusLabel()).toBe('Sin información');
  });

  it('blocks CSV when the loaded result is truncated or belongs to another point', () => {
    const component = new ChamanMeteoComponent({} as any, {} as any);
    component.selectedGridPoint = 'point-b';
    component.loadedGridPoint = 'point-a';
    component.activeRange = {
      from: '2026-08-01T03:00:00.000Z',
      toExclusive: '2026-08-02T03:00:00.000Z',
      dailyFrom: '2026-08-01',
      dailyToExclusive: '2026-08-02',
    } as any;
    component.daily = [{ date: '2026-08-01' } as any];

    expect(component.canExportCsv).toBeFalse();
    component.loadedGridPoint = 'point-b';
    expect(component.canExportCsv).toBeTrue();
    component.historyTruncated = true;
    expect(component.canExportCsv).toBeFalse();
    expect(component.exportUnavailableReason).toContain('parcial');
  });

  it('removes the old snapshot synchronously when another point starts loading', async () => {
    const service = {
      hourlyHistory: jasmine
        .createSpy()
        .and.callFake((query: any) =>
          Promise.resolve(
            query.limit === 1
              ? { datos: [{ timestamp: '2026-08-20T02:00:00.000Z' }], total: 1 }
              : { datos: [], total: 0 }
          )
        ),
      dailyHistory: jasmine
        .createSpy()
        .and.callFake((query: any) =>
          Promise.resolve(query.limit === 1 ? { datos: [{ date: '2026-08-19' }], total: 1 } : { datos: [], total: 0 })
        ),
    };
    const component = new ChamanMeteoComponent(service as any, {} as any);
    component.gridPoints = [
      { key: 'point-a', timezone: 'UTC' } as any,
      { key: 'point-b', timezone: 'America/Argentina/Buenos_Aires' } as any,
    ];
    component.loadedGridPoint = 'point-a';
    component.selectedGridPoint = 'point-b';
    component.hourly = [{ gridPointKey: 'point-a' } as any];
    component.daily = [{ gridPointKey: 'point-a' } as any];

    const loading = component.changeGridPoint();
    expect(component.loadedGridPoint).toBe('');
    expect(component.hourly).toEqual([]);
    expect(component.daily).toEqual([]);
    expect(component.canExportCsv).toBeFalse();
    await loading;

    expect(component.loadedGridPoint).toBe('point-b');
    expect(component.loadedTimezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('uses keyset pagination and blocks a snapshot mutated between pages', async () => {
    const pages = [
      {
        datos: [
          { timestamp: '2026-08-03T02:00:00.000Z' },
          { timestamp: '2026-08-03T01:00:00.000Z' },
        ],
        total: 3,
      },
      {
        datos: [{ timestamp: '2026-08-03T00:00:00.000Z' }],
        total: 2,
      },
    ];
    const service = {
      hourlyHistory: jasmine
        .createSpy()
        .and.callFake(() => Promise.resolve(pages.shift())),
    };
    const component = new ChamanMeteoComponent(service as any, {} as any);
    (component as any).pageSize = 2;

    const result = await (component as any).fetchAllHourly({
      gridPointKey: 'point-a',
      from: '2026-08-03T00:00:00.000Z',
      toExclusive: '2026-08-03T03:00:00.000Z',
    });

    expect(service.hourlyHistory.calls.argsFor(0)[0]).toEqual(
      jasmine.objectContaining({
        toExclusive: '2026-08-03T03:00:00.000Z',
        offset: 0,
      })
    );
    expect(service.hourlyHistory.calls.argsFor(1)[0]).toEqual(
      jasmine.objectContaining({
        toExclusive: '2026-08-03T01:00:00.000Z',
        offset: 0,
      })
    );
    expect(result).toEqual(
      jasmine.objectContaining({
        total: 3,
        inconsistent: true,
        truncated: true,
      })
    );

    component.activeRange = {} as any;
    component.selectedGridPoint = 'point-a';
    component.loadedGridPoint = 'point-a';
    component.hourly = result.rows;
    component.view = 'hourly';
    component.historyTruncated = result.truncated;
    component.historyInconsistent = result.inconsistent;
    expect(component.canExportCsv).toBeFalse();
    expect(component.exportUnavailableReason).toContain('Reintentá');
  });

  it('renders daily points at grid-local midnight and caps hourly chart rows', () => {
    const component = new ChamanMeteoComponent({} as any, {} as any);
    component.loadedTimezone = 'America/Argentina/Buenos_Aires';
    component.daily = [
      {
        gridPointKey: 'point-a',
        date: '2026-08-20',
        values: { temperatureMeanC: 12 },
      } as any,
    ];
    component.hourly = Array.from(
      { length: 800 },
      (_, index) =>
        ({
          gridPointKey: 'point-a',
          timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
          values: { temperatureC: index },
        }) as any
    );

    (component as any).buildCharts();

    const dailySeries = component.dailyAtmosphereOptions?.series?.[1] as any;
    const hourlySeries = component.hourlyAtmosphereOptions?.series?.[0] as any;
    expect(component.dailyAtmosphereOptions?.time?.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(dailySeries.data[0][0]).toBe(Date.parse('2026-08-20T03:00:00.000Z'));
    expect(component.hourlyChartRowsShown).toBe(744);
    expect(component.hourlyChartsLimited).toBeTrue();
    expect(hourlySeries.data.length).toBe(744);
  });
});
