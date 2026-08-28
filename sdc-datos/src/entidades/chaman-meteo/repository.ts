import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ChamanMeteoJobStatus,
  IChamanMeteoCoverage,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoHourlyRaw,
  IChamanMeteoImportJob,
  IChamanMeteoPage,
  IChamanMeteoResolvedLocationBinding,
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import { Model, PipelineStage } from 'mongoose';
import {
  CHAMAN_METEO_COVERAGE_MODEL,
  CHAMAN_METEO_DAILY_MODEL,
  CHAMAN_METEO_GRID_POINT_MODEL,
  CHAMAN_METEO_HOURLY_DERIVED_MODEL,
  CHAMAN_METEO_HOURLY_RAW_MODEL,
  CHAMAN_METEO_IMPORT_JOB_MODEL,
  CHAMAN_METEO_LOCATION_BINDING_MODEL,
  CHAMAN_METEO_VERSIONED_COVERAGE_MODEL,
  CHAMAN_METEO_VERSIONED_HOURLY_RAW_MODEL,
} from './modelos/schema';

@Injectable()
export class ChamanMeteoRepository {
  constructor(
    @InjectModel(CHAMAN_METEO_GRID_POINT_MODEL)
    private readonly gridPoints: Model<any>,
    @InjectModel(CHAMAN_METEO_LOCATION_BINDING_MODEL)
    private readonly bindings: Model<any>,
    @InjectModel(CHAMAN_METEO_HOURLY_RAW_MODEL)
    private readonly hourlyRaw: Model<any>,
    @InjectModel(CHAMAN_METEO_HOURLY_DERIVED_MODEL)
    private readonly hourlyDerived: Model<any>,
    @InjectModel(CHAMAN_METEO_DAILY_MODEL)
    private readonly daily: Model<any>,
    @InjectModel(CHAMAN_METEO_COVERAGE_MODEL)
    private readonly coverage: Model<any>,
    @InjectModel(CHAMAN_METEO_IMPORT_JOB_MODEL)
    private readonly jobs: Model<any>,
    @InjectModel(CHAMAN_METEO_VERSIONED_COVERAGE_MODEL)
    private readonly versionedCoverage: Model<any>,
    @InjectModel(CHAMAN_METEO_VERSIONED_HOURLY_RAW_MODEL)
    private readonly versionedHourlyRaw: Model<any>,
  ) {}

  async status(
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<IChamanMeteoStorageStatus> {
    const statuses: ChamanMeteoJobStatus[] = [
      'PENDING',
      'DOWNLOADING',
      'PARTIAL',
      'AVAILABLE',
      'FAILED',
    ];
    const versionFilter = this.jobVersionFilter(
      calculationVersion,
      sourceVersion,
    );
    const calculationFilter = {
      calculationVersion: calculationVersion || 'chaman-meteo-agro-v1',
    };
    const jobPipeline: PipelineStage[] = [{ $match: versionFilter }];
    jobPipeline.push({ $group: { _id: '$status', count: { $sum: 1 } } });
    const [
      gridPoints,
      activeBindings,
      hourlyRawRecords,
      hourlyDerivedRecords,
      dailyRecords,
      jobCounts,
      latestJob,
      latestProblemJob,
      latestCoverage,
    ] = await Promise.all([
      this.gridPoints.countDocuments({ enabled: true }),
      this.bindings.countDocuments({ active: true }),
      sourceVersion
        ? this.versionedHourlyRaw.countDocuments({ sourceVersion })
        : this.hourlyRaw.estimatedDocumentCount(),
      this.hourlyDerived.countDocuments(calculationFilter),
      this.daily.countDocuments(calculationFilter),
      this.jobs.aggregate<{ _id: ChamanMeteoJobStatus; count: number }>(
        jobPipeline,
      ),
      this.jobs.findOne(versionFilter).sort({ actualizadoEn: -1 }).lean(),
      this.jobs
        .findOne({
          ...versionFilter,
          status: { $in: ['PARTIAL', 'FAILED'] },
        })
        .sort({ actualizadoEn: -1 })
        .lean(),
      (calculationVersion && sourceVersion
        ? this.versionedCoverage
        : this.coverage)
        .findOne(
          calculationVersion && sourceVersion ? versionFilter : {},
        )
        .sort({ lastSuccessfulImportAt: -1, actualizadoEn: -1 })
        .lean(),
    ]);
    const jobsByStatus = Object.fromEntries(
      statuses.map((status) => [status, 0]),
    ) as Record<ChamanMeteoJobStatus, number>;
    jobCounts.forEach((item) => {
      if (item._id in jobsByStatus) jobsByStatus[item._id] = item.count;
    });
    return {
      calculationVersion,
      sourceVersion,
      gridPoints,
      activeBindings,
      hourlyRawRecords,
      hourlyDerivedRecords,
      dailyRecords,
      jobsByStatus,
      latestJob: latestJob as unknown as IChamanMeteoImportJob | undefined,
      latestProblemJob: latestProblemJob as unknown as
        | IChamanMeteoImportJob
        | undefined,
      latestCoverage: latestCoverage as unknown as
        | IChamanMeteoCoverage
        | undefined,
    };
  }

  gridPointPage(
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoGridPoint>> {
    return this.page(this.gridPoints, {}, { key: 1 }, limit, offset);
  }

  async resolvedLocationBinding(
    locationType: 'establecimiento' | 'lote',
    locationId: string,
  ): Promise<IChamanMeteoResolvedLocationBinding | null> {
    const binding = (await this.bindings
      .findOne({ locationType, locationId, active: true })
      .lean()) as any;
    if (!binding?.gridPointKey) return null;
    const gridPoint = (await this.gridPoints
      .findOne({ key: binding.gridPointKey, enabled: true })
      .lean()) as any;
    if (!gridPoint) return null;
    return {
      binding:
        binding as unknown as IChamanMeteoResolvedLocationBinding['binding'],
      gridPoint:
        gridPoint as unknown as IChamanMeteoResolvedLocationBinding['gridPoint'],
    };
  }

  jobPage(
    limit: number,
    offset: number,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    const filter = this.jobVersionFilter(calculationVersion, sourceVersion);
    return this.page(this.jobs, filter, { actualizadoEn: -1 }, limit, offset);
  }

  async jobByKey(jobKey: string): Promise<IChamanMeteoImportJob | null> {
    return (await this.jobs
      .findOne({ jobKey })
      .lean()) as unknown as IChamanMeteoImportJob | null;
  }

  hourlyPage(
    gridPointKey: string | undefined,
    from: Date | undefined,
    toExclusive: Date | undefined,
    calculationVersion: string | undefined,
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    const filter: Record<string, any> = {};
    if (gridPointKey) filter.gridPointKey = gridPointKey;
    if (calculationVersion) filter.calculationVersion = calculationVersion;
    if (from || toExclusive) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = from;
      if (toExclusive) filter.timestamp.$lt = toExclusive;
    }
    return this.page(
      this.hourlyDerived,
      filter,
      { timestamp: -1 },
      limit,
      offset,
    );
  }

  dailyPage(
    gridPointKey: string | undefined,
    calculationVersion: string | undefined,
    limit: number,
    offset: number,
    from?: string,
    toExclusive?: string,
  ): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    const filter: Record<string, any> = {};
    if (gridPointKey) filter.gridPointKey = gridPointKey;
    if (calculationVersion) filter.calculationVersion = calculationVersion;
    if (from || toExclusive) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (toExclusive) filter.date.$lt = toExclusive;
    }
    return this.page(this.daily, filter, { date: -1 }, limit, offset);
  }

  async coverageByGridPoint(
    gridPointKey: string,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<IChamanMeteoCoverage | null> {
    const versioned = Boolean(calculationVersion && sourceVersion);
    const filter = versioned
      ? { gridPointKey, calculationVersion, sourceVersion }
      : { gridPointKey };
    return (await (versioned ? this.versionedCoverage : this.coverage)
      .findOne(filter)
      .lean()) as unknown as IChamanMeteoCoverage | null;
  }

  async upsertGridPoint(data: IChamanMeteoGridPoint): Promise<any> {
    const existing = await this.gridPoints.findOne({ key: data.key }).lean();
    const immutableFields = [
      'latitude',
      'longitude',
      'countryCode',
      'timezone',
      'provider',
      'dataset',
    ] as const;
    const legacyEnrichableFields = ['countryCode', 'timezone'] as const;
    const missingLegacyIdentity = (field: (typeof immutableFields)[number]) =>
      legacyEnrichableFields.includes(field as any) &&
      (existing?.[field] === undefined ||
        existing?.[field] === null ||
        existing?.[field] === '');
    const drift = existing
      ? immutableFields.filter(
          (field) =>
            !missingLegacyIdentity(field) && existing[field] !== data[field],
        )
      : [];
    if (drift.length) {
      throw new ConflictException({
        error: 'grid_point_identity_drift',
        gridPointKey: data.key,
        immutableFields: drift,
      });
    }
    const mutable = Object.fromEntries(
      [
        ['enabled', data.enabled],
        ['historicalStart', data.historicalStart],
        ['latestAvailable', data.latestAvailable],
        ['firstDataAt', data.firstDataAt],
        ['lastDataAt', data.lastDataAt],
      ].filter(([, value]) => value !== undefined),
    );
    const legacyIdentityEnrichment = existing
      ? Object.fromEntries(
          legacyEnrichableFields
            .filter((field) => missingLegacyIdentity(field))
            .map((field) => [field, data[field]]),
        )
      : {};
    const update = existing
      ? { $set: { ...legacyIdentityEnrichment, ...mutable } }
      : {
          $setOnInsert: {
            key: data.key,
            latitude: data.latitude,
            longitude: data.longitude,
            countryCode: data.countryCode,
            timezone: data.timezone,
            provider: data.provider,
            dataset: data.dataset,
          },
          $set: mutable,
        };
    return this.gridPoints.findOneAndUpdate(
      { key: data.key },
      update,
      { upsert: true, new: true, runValidators: true },
    );
  }

  upsertHourlyRaw(data: IChamanMeteoHourlyRaw[]): Promise<any> {
    return this.bulkUpsert(this.hourlyRaw, data, (item) => ({
      gridPointKey: item.gridPointKey,
      timestamp: new Date(item.timestamp),
    }));
  }

  upsertHourlyDerived(data: IChamanMeteoHourlyDerived[]): Promise<any> {
    return this.bulkUpsert(this.hourlyDerived, data, (item) => ({
      gridPointKey: item.gridPointKey,
      timestamp: new Date(item.timestamp),
      calculationVersion: item.calculationVersion,
    }));
  }

  upsertDaily(data: IChamanMeteoDaily[]): Promise<any> {
    return this.bulkUpsert(this.daily, data, (item) => ({
      gridPointKey: item.gridPointKey,
      date: item.date,
      calculationVersion: item.calculationVersion,
    }));
  }

  async upsertJob(data: IChamanMeteoImportJob): Promise<any> {
    return this.jobs.findOneAndUpdate(
      { jobKey: data.jobKey },
      { $set: data },
      { upsert: true, new: true, runValidators: true },
    );
  }

  async upsertCoverage(
    gridPointKey: string,
    data: Partial<IChamanMeteoCoverage>,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<any> {
    const versioned = Boolean(calculationVersion && sourceVersion);
    const filter = versioned
      ? { gridPointKey, calculationVersion, sourceVersion }
      : { gridPointKey };
    const snapshot = versioned
      ? { ...data, gridPointKey, calculationVersion, sourceVersion }
      : { ...data, gridPointKey };
    return (versioned ? this.versionedCoverage : this.coverage).findOneAndUpdate(
      filter,
      { $set: snapshot },
      { upsert: true, new: true, runValidators: true },
    );
  }

  upsertVersionedHourlyRaw(data: IChamanMeteoHourlyRaw[]): Promise<any> {
    return this.bulkUpsert(this.versionedHourlyRaw, data, (item) => ({
      gridPointKey: item.gridPointKey,
      sourceVersion: item.sourceVersion,
      timestamp: new Date(item.timestamp),
    }));
  }

  async recalculateCoverage(
    gridPointKey: string,
    calculationVersion?: string,
    sourceVersion?: string,
  ): Promise<any> {
    const [raw, derived, daily] = await Promise.all([
      this.rangeStats(
        sourceVersion ? this.versionedHourlyRaw : this.hourlyRaw,
        gridPointKey,
        'timestamp',
        sourceVersion ? { sourceVersion } : undefined,
      ),
      this.rangeStats(
        this.hourlyDerived,
        gridPointKey,
        'timestamp',
        calculationVersion ? { calculationVersion } : undefined,
      ),
      this.rangeStats(
        this.daily,
        gridPointKey,
        'date',
        calculationVersion ? { calculationVersion } : undefined,
      ),
    ]);
    const snapshot = {
      ...(calculationVersion ? { calculationVersion } : {}),
      ...(sourceVersion ? { sourceVersion } : {}),
      hourlyRawFrom: raw?.from,
      hourlyRawTo: raw?.to,
      hourlyDerivedFrom: derived?.from,
      hourlyDerivedTo: derived?.to,
      dailyFrom: daily?.from,
      dailyTo: daily?.to,
      hourlyRawCount: raw?.count || 0,
      hourlyDerivedCount: derived?.count || 0,
      dailyCount: daily?.count || 0,
      lastSuccessfulImportAt: new Date().toISOString(),
    };
    if (calculationVersion && sourceVersion) {
      return this.upsertCoverage(
        gridPointKey,
        snapshot,
        calculationVersion,
        sourceVersion,
      );
    }
    // Backward-compatible legacy recalculation represents all versions. Clear
    // a previous active-version label so mixed counts can never masquerade as v2.
    return this.coverage.findOneAndUpdate(
      { gridPointKey },
      {
        $set: { ...snapshot, gridPointKey },
        $unset: { calculationVersion: 1 },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }

  private async page<T>(
    model: Model<any>,
    filter: Record<string, any>,
    sort: Record<string, 1 | -1>,
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<T>> {
    const [datos, total] = await Promise.all([
      model.find(filter).sort(sort).skip(offset).limit(limit).lean(),
      model.countDocuments(filter),
    ]);
    return { datos: datos as T[], total, limit, offset };
  }

  private jobVersionFilter(
    calculationVersion?: string,
    sourceVersion?: string,
  ): Record<string, any> {
    if (calculationVersion) {
      return {
        calculationVersion,
        ...(sourceVersion ? { sourceVersion } : {}),
      };
    }
    // A v1 API calls status/jobs without version parameters. Keep that
    // rollback view isolated from v2 jobs while accepting original unversioned
    // foundation jobs and any explicitly labelled v1 record.
    return {
      $or: [
        { calculationVersion: 'chaman-meteo-agro-v1' },
        { calculationVersion: { $exists: false } },
      ],
    };
  }

  private bulkUpsert<T>(
    model: Model<any>,
    data: T[],
    filter: (item: T) => Record<string, any>,
  ): Promise<any> {
    if (!data.length) {
      return Promise.resolve({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
      });
    }
    return model.bulkWrite(
      data.map((item) => ({
        updateOne: {
          filter: filter(item),
          update: { $set: item },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  private async rangeStats(
    model: Model<any>,
    gridPointKey: string,
    field: 'timestamp' | 'date',
    extraFilter?: Record<string, any>,
  ): Promise<{ from: string; to: string; count: number } | undefined> {
    const filter: Record<string, any> = { gridPointKey, ...extraFilter };
    const [stats] = await model.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          from: { $min: `$${field}` },
          to: { $max: `$${field}` },
          count: { $sum: 1 },
        },
      },
    ]);
    return stats;
  }
}
