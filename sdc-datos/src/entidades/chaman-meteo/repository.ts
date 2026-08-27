import { Injectable } from '@nestjs/common';
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
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import { Model } from 'mongoose';
import {
  CHAMAN_METEO_COVERAGE_MODEL,
  CHAMAN_METEO_DAILY_MODEL,
  CHAMAN_METEO_GRID_POINT_MODEL,
  CHAMAN_METEO_HOURLY_DERIVED_MODEL,
  CHAMAN_METEO_HOURLY_RAW_MODEL,
  CHAMAN_METEO_IMPORT_JOB_MODEL,
  CHAMAN_METEO_LOCATION_BINDING_MODEL,
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
  ) {}

  async status(): Promise<IChamanMeteoStorageStatus> {
    const statuses: ChamanMeteoJobStatus[] = [
      'PENDING',
      'DOWNLOADING',
      'PARTIAL',
      'AVAILABLE',
      'FAILED',
    ];
    const [
      gridPoints,
      activeBindings,
      hourlyRawRecords,
      hourlyDerivedRecords,
      dailyRecords,
      jobCounts,
      latestJob,
      latestCoverage,
    ] = await Promise.all([
      this.gridPoints.countDocuments({ enabled: true }),
      this.bindings.countDocuments({ active: true }),
      this.hourlyRaw.estimatedDocumentCount(),
      this.hourlyDerived.estimatedDocumentCount(),
      this.daily.estimatedDocumentCount(),
      this.jobs.aggregate<{ _id: ChamanMeteoJobStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.jobs.findOne().sort({ actualizadoEn: -1 }).lean(),
      this.coverage
        .findOne()
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
      gridPoints,
      activeBindings,
      hourlyRawRecords,
      hourlyDerivedRecords,
      dailyRecords,
      jobsByStatus,
      latestJob: latestJob as unknown as IChamanMeteoImportJob | undefined,
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

  jobPage(
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoImportJob>> {
    return this.page(this.jobs, {}, { actualizadoEn: -1 }, limit, offset);
  }

  hourlyPage(
    gridPointKey: string | undefined,
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoHourlyDerived>> {
    return this.page(
      this.hourlyDerived,
      gridPointKey ? { gridPointKey } : {},
      { timestamp: -1 },
      limit,
      offset,
    );
  }

  dailyPage(
    gridPointKey: string | undefined,
    limit: number,
    offset: number,
  ): Promise<IChamanMeteoPage<IChamanMeteoDaily>> {
    return this.page(
      this.daily,
      gridPointKey ? { gridPointKey } : {},
      { date: -1 },
      limit,
      offset,
    );
  }

  async coverageByGridPoint(
    gridPointKey: string,
  ): Promise<IChamanMeteoCoverage | null> {
    return (await this.coverage
      .findOne({ gridPointKey })
      .lean()) as unknown as IChamanMeteoCoverage | null;
  }

  async upsertGridPoint(data: IChamanMeteoGridPoint): Promise<any> {
    return this.gridPoints.findOneAndUpdate(
      { key: data.key },
      { $set: data },
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
  ): Promise<any> {
    return this.coverage.findOneAndUpdate(
      { gridPointKey },
      { $set: { ...data, gridPointKey } },
      { upsert: true, new: true, runValidators: true },
    );
  }

  async recalculateCoverage(gridPointKey: string): Promise<any> {
    const [raw, derived, daily] = await Promise.all([
      this.rangeStats(this.hourlyRaw, gridPointKey, 'timestamp'),
      this.rangeStats(this.hourlyDerived, gridPointKey, 'timestamp'),
      this.rangeStats(this.daily, gridPointKey, 'date'),
    ]);
    return this.upsertCoverage(gridPointKey, {
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
    });
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
  ): Promise<{ from: string; to: string; count: number } | undefined> {
    const [stats] = await model.aggregate([
      { $match: { gridPointKey } },
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
