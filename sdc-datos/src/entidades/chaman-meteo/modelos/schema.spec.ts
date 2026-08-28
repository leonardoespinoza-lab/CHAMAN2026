import mongoose from 'mongoose';

import {
  ChamanMeteoDailySchema,
  ChamanMeteoHourlyDerivedSchema,
  ChamanMeteoImportJobSchema,
  ChamanMeteoGridPointSchema,
  ChamanMeteoVersionedCoverageSchema,
  ChamanMeteoVersionedHourlyRawSchema,
} from './schema';

describe('ChamanMeteo historical indexes', () => {
  it('indexes version-only status counts without changing coverage', () => {
    expect(ChamanMeteoHourlyDerivedSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { calculationVersion: 1 },
          expect.objectContaining({
            name: 'weather_hourly_derived_calculation_version',
          }),
        ],
      ]),
    );
    expect(ChamanMeteoDailySchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { calculationVersion: 1 },
          expect.objectContaining({ name: 'weather_daily_calculation_version' }),
        ],
      ]),
    );
  });

  it('keeps v2 RAW and coverage in additive versioned collections', () => {
    expect(ChamanMeteoVersionedHourlyRawSchema.get('collection')).toBe(
      'weather_hourly_raw_versions',
    );
    expect(ChamanMeteoVersionedHourlyRawSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { gridPointKey: 1, sourceVersion: 1, timestamp: 1 },
          expect.objectContaining({
            unique: true,
            name: 'uniq_weather_hourly_raw_version',
          }),
        ],
        [
          { sourceVersion: 1 },
          expect.objectContaining({ name: 'weather_hourly_raw_source_version' }),
        ],
      ]),
    );
    expect(ChamanMeteoVersionedCoverageSchema.get('collection')).toBe(
      'weather_grid_coverage_versions',
    );
    expect(ChamanMeteoVersionedCoverageSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { gridPointKey: 1, calculationVersion: 1, sourceVersion: 1 },
          expect.objectContaining({
            unique: true,
            name: 'uniq_weather_grid_coverage_version',
          }),
        ],
      ]),
    );
    expect(ChamanMeteoImportJobSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          {
            calculationVersion: 1,
            sourceVersion: 1,
            status: 1,
            actualizadoEn: -1,
          },
          expect.objectContaining({
            name: 'weather_job_calculation_source_status_updated',
          }),
        ],
        [
          {
            calculationVersion: 1,
            sourceVersion: 1,
            actualizadoEn: -1,
          },
          expect.objectContaining({
            name: 'weather_job_calculation_source_updated',
          }),
        ],
      ]),
    );
  });
});

describe('ChamanMeteoGridPointSchema', () => {
  const modelName = 'ChamanMeteoGridPointValidationSpec';
  const Model =
    mongoose.models[modelName] ||
    mongoose.model(modelName, ChamanMeteoGridPointSchema.clone());
  const valid = {
    key: 'CL_-33.45_-70.66',
    latitude: -33.45,
    longitude: -70.66,
    countryCode: 'CL',
    timezone: 'America/Santiago',
    provider: 'copernicus-cds',
    dataset: 'reanalysis-era5-land-timeseries',
    historicalStart: '2020-01-01',
  };

  it('accepts a valid IANA timezone used by Chile DST', () => {
    expect(new Model(valid).validateSync()).toBeUndefined();
  });

  it.each([
    [{ ...valid, timezone: undefined }, 'timezone'],
    [{ ...valid, timezone: 'America/NoExiste' }, 'timezone'],
    [{ ...valid, countryCode: undefined }, 'countryCode'],
    [{ ...valid, countryCode: 'XX' }, 'countryCode'],
  ])('rejects an invalid pilot grid identity', (document, field) => {
    expect(new Model(document).validateSync()?.errors).toHaveProperty(field);
  });
});

describe('ChamanMeteoDailySchema', () => {
  it('conserva la disponibilidad por metrica al convertir el documento', () => {
    const modelName = 'ChamanMeteoDailySchemaPersistenceSpec';
    const Model =
      mongoose.models[modelName] ||
      mongoose.model(modelName, ChamanMeteoDailySchema.clone());

    const document = new Model({
      gridPointKey: 'AR_-38.79_-68.10',
      date: '2026-08-28',
      timezone: 'America/Argentina/Salta',
      calculationVersion: 'chaman-meteo-agro-v2',
      hoursAvailable: 24,
      hoursExpected: 24,
      values: { temperatureMeanC: 12.5 },
      availableHoursByMetric: {
        temperature: 24,
        soilTemperature: [24, 23, 22, 21],
      },
      qualityFlags: [],
      calculatedAt: new Date('2026-08-29T00:00:00.000Z'),
    });

    expect(document.toObject().availableHoursByMetric).toEqual({
      temperature: 24,
      soilTemperature: [24, 23, 22, 21],
    });
  });
});

describe('ChamanMeteoImportJobSchema', () => {
  it('persists the repair versions and actual halo retrieval range', () => {
    const modelName = 'ChamanMeteoImportJobV2SchemaSpec';
    const Model =
      mongoose.models[modelName] ||
      mongoose.model(modelName, ChamanMeteoImportJobSchema.clone());
    const document = new Model({
      jobKey: 'repair-v2',
      type: 'REPAIR',
      gridPointKey: 'pilot-grid',
      sourceVersion: 'era5-land-timeseries-19var-v2',
      calculationVersion: 'chaman-meteo-agro-v2',
      rangeStart: '2026-08-20',
      rangeEnd: '2026-08-20',
      retrievalStart: '2026-08-19',
      retrievalEnd: '2026-08-21',
      status: 'AVAILABLE',
      progressPct: 100,
      attempts: 1,
    }).toObject();

    expect(document).toMatchObject({
      sourceVersion: 'era5-land-timeseries-19var-v2',
      calculationVersion: 'chaman-meteo-agro-v2',
      retrievalStart: '2026-08-19',
      retrievalEnd: '2026-08-21',
    });
  });
});
