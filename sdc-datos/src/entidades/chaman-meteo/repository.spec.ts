import { ChamanMeteoRepository } from './repository';

describe('ChamanMeteoRepository', () => {
  it('resuelve binding y punto activos sin busqueda por cercania', async () => {
    const binding = {
      locationType: 'lote',
      locationId: '64b000000000000000000010',
      gridPointKey: 'pilot-grid',
      active: true,
    };
    const gridPoint = { key: 'pilot-grid', enabled: true };
    const bindings = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(binding),
      }),
    };
    const gridPoints = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(gridPoint),
      }),
    };
    const repository = new ChamanMeteoRepository(
      gridPoints as any,
      bindings as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      repository.resolvedLocationBinding('lote', '64b000000000000000000010'),
    ).resolves.toEqual({ binding, gridPoint });
    expect(bindings.findOne).toHaveBeenCalledWith({
      locationType: 'lote',
      locationId: '64b000000000000000000010',
      active: true,
    });
    expect(gridPoints.findOne).toHaveBeenCalledWith({
      key: 'pilot-grid',
      enabled: true,
    });
  });

  it('filters the job page and its total by calculation version', async () => {
    const lean = jest.fn().mockResolvedValue([{ jobKey: 'v2-job' }]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const countDocuments = jest.fn().mockResolvedValue(1);
    const jobs = { find, countDocuments };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      jobs as any,
      {} as any,
      {} as any,
    );

    await expect(
      repository.jobPage(
        25,
        5,
        'chaman-meteo-agro-v2',
        'era5-land-timeseries-19var-v2',
      ),
    ).resolves.toEqual({
      datos: [{ jobKey: 'v2-job' }],
      total: 1,
      limit: 25,
      offset: 5,
    });
    const filter = {
      calculationVersion: 'chaman-meteo-agro-v2',
      sourceVersion: 'era5-land-timeseries-19var-v2',
    };
    expect(find).toHaveBeenCalledWith(filter);
    expect(countDocuments).toHaveBeenCalledWith(filter);
    expect(sort).toHaveBeenCalledWith({ actualizadoEn: -1 });
  });

  it('keeps unversioned job pages on the legacy rollback view', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const countDocuments = jest.fn().mockResolvedValue(0);
    const jobs = { find, countDocuments };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      jobs as any,
      {} as any,
      {} as any,
    );

    await repository.jobPage(25, 0);

    const legacyFilter = {
      $or: [
        { calculationVersion: 'chaman-meteo-agro-v1' },
        { calculationVersion: { $exists: false } },
      ],
    };
    expect(find).toHaveBeenCalledWith(legacyFilter);
    expect(countDocuments).toHaveBeenCalledWith(legacyFilter);
  });

  it('uses a half-open date filter without changing pagination or response', async () => {
    const lean = jest.fn().mockResolvedValue([{ date: '2026-08-31' }]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const countDocuments = jest.fn().mockResolvedValue(1);
    const daily = { find, countDocuments };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      daily as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      repository.dailyPage(
        'pilot-grid',
        'chaman-meteo-agro-v1',
        30,
        10,
        '2026-08-01',
        '2026-09-01',
      ),
    ).resolves.toEqual({
      datos: [{ date: '2026-08-31' }],
      total: 1,
      limit: 30,
      offset: 10,
    });

    const expectedFilter = {
      gridPointKey: 'pilot-grid',
      calculationVersion: 'chaman-meteo-agro-v1',
      date: { $gte: '2026-08-01', $lt: '2026-09-01' },
    };
    expect(find).toHaveBeenCalledWith(expectedFilter);
    expect(countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(sort).toHaveBeenCalledWith({ date: -1 });
    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(30);
  });

  it('recalculates derived and daily coverage only for the requested version', async () => {
    const raw = {
      aggregate: jest
        .fn()
        .mockResolvedValue([
          { from: new Date('2026-08-01T00:00:00Z'), to: new Date(), count: 48 },
        ]),
    };
    const derived = {
      aggregate: jest
        .fn()
        .mockResolvedValue([
          { from: new Date('2026-08-01T00:00:00Z'), to: new Date(), count: 24 },
        ]),
    };
    const daily = {
      aggregate: jest
        .fn()
        .mockResolvedValue([
          { from: '2026-08-01', to: '2026-08-01', count: 1 },
        ]),
    };
    const legacyCoverage = {
      findOneAndUpdate: jest.fn(),
    };
    const versionedCoverage = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      {} as any,
      derived as any,
      daily as any,
      legacyCoverage as any,
      {} as any,
      versionedCoverage as any,
      raw as any,
    );

    await repository.recalculateCoverage(
      'pilot-grid',
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );

    expect(raw.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        gridPointKey: 'pilot-grid',
        sourceVersion: 'era5-land-timeseries-19var-v2',
      },
    });

    expect(derived.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        gridPointKey: 'pilot-grid',
        calculationVersion: 'chaman-meteo-agro-v2',
      },
    });
    expect(daily.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        gridPointKey: 'pilot-grid',
        calculationVersion: 'chaman-meteo-agro-v2',
      },
    });
    expect(versionedCoverage.findOneAndUpdate).toHaveBeenCalledWith(
      {
        gridPointKey: 'pilot-grid',
        calculationVersion: 'chaman-meteo-agro-v2',
        sourceVersion: 'era5-land-timeseries-19var-v2',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          calculationVersion: 'chaman-meteo-agro-v2',
          sourceVersion: 'era5-land-timeseries-19var-v2',
          hourlyDerivedCount: 24,
          dailyCount: 1,
        }),
      }),
      expect.any(Object),
    );
    expect(legacyCoverage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('clears the active-version label for a legacy mixed coverage snapshot', async () => {
    const model = { aggregate: jest.fn().mockResolvedValue([]) };
    const coverage = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      model as any,
      model as any,
      model as any,
      coverage as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await repository.recalculateCoverage('pilot-grid');

    expect(coverage.findOneAndUpdate).toHaveBeenCalledWith(
      { gridPointKey: 'pilot-grid' },
      expect.objectContaining({ $unset: { calculationVersion: 1 } }),
      expect.any(Object),
    );
  });

  it('filters status, jobs, RAW and coverage by the exact version pair', async () => {
    const latestJobLean = jest.fn().mockResolvedValue(null);
    const latestCoverageLean = jest.fn().mockResolvedValue(null);
    const jobs = {
      aggregate: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: latestJobLean }),
      }),
    };
    const legacyCoverage = {
      findOne: jest.fn(),
    };
    const versionedCoverage = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: latestCoverageLean }),
      }),
    };
    const versionedRaw = {
      countDocuments: jest.fn().mockResolvedValue(100),
    };
    const repository = new ChamanMeteoRepository(
      { countDocuments: jest.fn().mockResolvedValue(1) } as any,
      { countDocuments: jest.fn().mockResolvedValue(2) } as any,
      { estimatedDocumentCount: jest.fn().mockResolvedValue(100) } as any,
      { countDocuments: jest.fn().mockResolvedValue(50) } as any,
      { countDocuments: jest.fn().mockResolvedValue(3) } as any,
      legacyCoverage as any,
      jobs as any,
      versionedCoverage as any,
      versionedRaw as any,
    );

    const status = await repository.status(
      'chaman-meteo-agro-v2',
      'era5-land-timeseries-19var-v2',
    );

    expect(status).toMatchObject({
      calculationVersion: 'chaman-meteo-agro-v2',
      sourceVersion: 'era5-land-timeseries-19var-v2',
      hourlyRawRecords: 100,
      hourlyDerivedRecords: 50,
      dailyRecords: 3,
    });
    expect(jobs.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        calculationVersion: 'chaman-meteo-agro-v2',
        sourceVersion: 'era5-land-timeseries-19var-v2',
      },
    });
    expect(jobs.findOne).toHaveBeenCalledWith({
      calculationVersion: 'chaman-meteo-agro-v2',
      sourceVersion: 'era5-land-timeseries-19var-v2',
    });
    expect(jobs.findOne).toHaveBeenCalledWith({
      calculationVersion: 'chaman-meteo-agro-v2',
      sourceVersion: 'era5-land-timeseries-19var-v2',
      status: { $in: ['PARTIAL', 'FAILED'] },
    });
    expect(versionedCoverage.findOne).toHaveBeenCalledWith({
      calculationVersion: 'chaman-meteo-agro-v2',
      sourceVersion: 'era5-land-timeseries-19var-v2',
    });
    expect(versionedRaw.countDocuments).toHaveBeenCalledWith({
      sourceVersion: 'era5-land-timeseries-19var-v2',
    });
    expect(legacyCoverage.findOne).not.toHaveBeenCalled();
  });

  it('keeps an unversioned status request isolated to v1 and legacy jobs', async () => {
    const chain = () => ({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const jobs = {
      aggregate: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(chain),
    };
    const legacyRaw = { estimatedDocumentCount: jest.fn().mockResolvedValue(10) };
    const derived = { countDocuments: jest.fn().mockResolvedValue(8) };
    const daily = { countDocuments: jest.fn().mockResolvedValue(2) };
    const legacyCoverage = { findOne: jest.fn().mockImplementation(chain) };
    const versionedRaw = { countDocuments: jest.fn() };
    const versionedCoverage = { findOne: jest.fn() };
    const repository = new ChamanMeteoRepository(
      { countDocuments: jest.fn().mockResolvedValue(1) } as any,
      { countDocuments: jest.fn().mockResolvedValue(1) } as any,
      legacyRaw as any,
      derived as any,
      daily as any,
      legacyCoverage as any,
      jobs as any,
      versionedCoverage as any,
      versionedRaw as any,
    );

    await expect(repository.status()).resolves.toMatchObject({
      hourlyRawRecords: 10,
      hourlyDerivedRecords: 8,
      dailyRecords: 2,
    });

    const legacyJobFilter = {
      $or: [
        { calculationVersion: 'chaman-meteo-agro-v1' },
        { calculationVersion: { $exists: false } },
      ],
    };
    expect(jobs.aggregate.mock.calls[0][0][0]).toEqual({
      $match: legacyJobFilter,
    });
    expect(derived.countDocuments).toHaveBeenCalledWith({
      calculationVersion: 'chaman-meteo-agro-v1',
    });
    expect(daily.countDocuments).toHaveBeenCalledWith({
      calculationVersion: 'chaman-meteo-agro-v1',
    });
    expect(jobs.findOne).toHaveBeenCalledWith(legacyJobFilter);
    expect(legacyCoverage.findOne).toHaveBeenCalledWith({});
    expect(versionedRaw.countDocuments).not.toHaveBeenCalled();
    expect(versionedCoverage.findOne).not.toHaveBeenCalled();
  });

  it('routes v2 RAW writes to the versioned collection without touching v1', async () => {
    const legacyRaw = { bulkWrite: jest.fn() };
    const versionedRaw = { bulkWrite: jest.fn().mockResolvedValue({}) };
    const repository = new ChamanMeteoRepository(
      {} as any,
      {} as any,
      legacyRaw as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      versionedRaw as any,
    );
    const record = {
      gridPointKey: 'pilot-grid',
      timestamp: '2026-08-20T00:00:00.000Z',
      provider: 'copernicus-cds' as const,
      dataset: 'reanalysis-era5-land-timeseries' as const,
      sourceVersion: 'era5-land-timeseries-19var-v2',
      values: {},
      qualityFlags: [],
      importedAt: '2026-08-28T00:00:00.000Z',
    };

    await repository.upsertVersionedHourlyRaw([record]);

    expect(versionedRaw.bulkWrite).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: {
              gridPointKey: 'pilot-grid',
              sourceVersion: 'era5-land-timeseries-19var-v2',
              timestamp: new Date('2026-08-20T00:00:00.000Z'),
            },
          }),
        }),
      ],
      { ordered: false },
    );
    expect(legacyRaw.bulkWrite).not.toHaveBeenCalled();
  });

  it('rejects physical identity drift for an existing grid key', async () => {
    const gridPoints = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          key: 'pilot-grid',
          latitude: -38.7888,
          longitude: -68.10434,
          countryCode: 'AR',
          timezone: 'America/Argentina/Buenos_Aires',
          provider: 'copernicus-cds',
          dataset: 'reanalysis-era5-land-timeseries',
        }),
      }),
      findOneAndUpdate: jest.fn(),
    };
    const repository = new ChamanMeteoRepository(
      gridPoints as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      repository.upsertGridPoint({
        key: 'pilot-grid',
        latitude: -38.7,
        longitude: -68.10434,
        countryCode: 'AR',
        timezone: 'America/Santiago',
        enabled: true,
        provider: 'copernicus-cds',
        dataset: 'reanalysis-era5-land-timeseries',
        historicalStart: '2020-01-01',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'grid_point_identity_drift',
        immutableFields: expect.arrayContaining(['latitude', 'timezone']),
      }),
    });
    expect(gridPoints.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('enriches only missing country and timezone on a legacy grid point', async () => {
    const gridPoints = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          key: 'legacy-grid',
          latitude: -38.7888,
          longitude: -68.10434,
          provider: 'copernicus-cds',
          dataset: 'reanalysis-era5-land-timeseries',
        }),
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ key: 'legacy-grid' }),
    };
    const repository = new ChamanMeteoRepository(
      gridPoints as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await repository.upsertGridPoint({
      key: 'legacy-grid',
      latitude: -38.7888,
      longitude: -68.10434,
      countryCode: 'AR',
      timezone: 'America/Argentina/Buenos_Aires',
      enabled: true,
      provider: 'copernicus-cds',
      dataset: 'reanalysis-era5-land-timeseries',
      historicalStart: '2020-01-01',
    });

    expect(gridPoints.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'legacy-grid' },
      {
        $set: expect.objectContaining({
          countryCode: 'AR',
          timezone: 'America/Argentina/Buenos_Aires',
        }),
      },
      { upsert: true, new: true, runValidators: true },
    );
  });
});
