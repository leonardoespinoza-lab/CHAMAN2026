import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ApiClientRecord,
  ApiSettings,
  apiId,
  apiIsoDate,
  apiObjectId,
  validApiSettings,
} from 'modelos/src';

const bad = () => {
  throw new BadRequestException('Configuración de integración inválida.');
};
const integer = (n: unknown, min: number, max: number) =>
  Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
export function controlEnvironment(): 'testing' | 'production' {
  const env = String(process.env.ENV || '').toLowerCase();
  if (env === 'production') return 'production';
  if (['testing', 'test', 'development', 'dev', 'local'].includes(env))
    return 'testing';
  throw new ServiceUnavailableException(
    'Entorno de integraciones no configurado.',
  );
}
@Injectable()
export class IntegrationControlService {
  constructor(
    @InjectModel('IntegrationClientRecord')
    private readonly clients: Model<any>,
    @InjectModel('IntegrationUsageEvent') private readonly usage: Model<any>,
  ) {}
  async command(input: unknown): Promise<any> {
    const c = input as any;
    if (!c || typeof c !== 'object' || Array.isArray(c)) bad();
    const environment = controlEnvironment();
    if (c.environment !== environment) bad();
    try {
      return await this.execute(c, environment);
    } catch (error) {
      if (error?.getStatus) throw error;
      if (error?.code === 11000)
        throw new ConflictException(
          'La integración, la cuenta operadora o la clave ya están registradas.',
        );
      throw new ServiceUnavailableException(
        'No se pudo acceder al registro de integraciones.',
      );
    }
  }
  private async execute(c: any, environment: string): Promise<any> {
    if (c.action === 'list') {
      const items = await this.clients
        .find({ environment })
        .sort({ id: 1 })
        .limit(1001)
        .lean()
        .exec();
      return { items: items.slice(0, 1000), truncated: items.length > 1000 };
    }
    if (c.action === 'by-key') {
      if (!apiId(c.keyId)) bad();
      return this.clients
        .findOne({ environment, 'keys.id': c.keyId })
        .lean()
        .exec();
    }
    if (c.action === 'usage-start') {
      if (
        !apiId(c.clientId) ||
        typeof c.requestId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(c.requestId) ||
        !apiIsoDate(c.startedAt) ||
        Math.abs(Date.now() - Date.parse(c.startedAt)) > 300000 ||
        !/^(GET|PUT) (servicios|catalogos\/semillas|productores\/:externalId|establecimientos\/:externalId|lotes\/:externalId|siembras\/:externalId(\/fenologia)?)$/.test(
          c.operation,
        )
      )
        bad();
      await this.usage
        .updateOne(
          { environment, requestId: c.requestId },
          {
            $setOnInsert: {
              environment,
              requestId: c.requestId,
              clientId: c.clientId,
              operation: c.operation,
              startedAt: new Date(c.startedAt),
              status: 0,
              durationMs: 0,
            },
          },
          { upsert: true },
        )
        .exec();
      return { recorded: true };
    }
    if (c.action === 'usage-finish') {
      if (
        typeof c.requestId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(c.requestId) ||
        !integer(c.status, 100, 599) ||
        !integer(c.durationMs, 0, 86400000)
      )
        bad();
      const result = await this.usage
        .updateOne(
          { environment, requestId: c.requestId, status: 0 },
          { $set: { status: c.status, durationMs: c.durationMs } },
        )
        .exec();
      return { updated: result.modifiedCount === 1 };
    }
    if (!apiId(c.id)) bad();
    const filter = { environment, id: c.id };
    if (c.action === 'usage') {
      if (
        !apiIsoDate(c.from) ||
        !apiIsoDate(c.to) ||
        Date.parse(c.to) <= Date.parse(c.from) ||
        Date.parse(c.to) - Date.parse(c.from) > 90 * 86400000 ||
        Date.parse(c.from) < Date.now() - 91 * 86400000 ||
        Date.parse(c.to) > Date.now() + 86400000
      )
        bad();
      const rows = await this.usage
        .aggregate([
          {
            $match: {
              environment,
              clientId: c.id,
              startedAt: { $gte: new Date(c.from), $lt: new Date(c.to) },
            },
          },
          {
            $group: {
              _id: {
                day: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$startedAt',
                    timezone: 'UTC',
                  },
                },
                operation: '$operation',
              },
              requests: { $sum: 1 },
              success: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ['$status', 200] },
                        { $lt: ['$status', 400] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$status', 202] }, 1, 0] } },
              rateLimited: {
                $sum: { $cond: [{ $eq: ['$status', 429] }, 1, 0] },
              },
              unfinished: { $sum: { $cond: [{ $eq: ['$status', 0] }, 1, 0] } },
              durationMs: { $sum: '$durationMs' },
            },
          },
          {
            $project: {
              _id: 0,
              day: '$_id.day',
              operation: '$_id.operation',
              requests: 1,
              success: 1,
              errors: 1,
              pending: 1,
              rateLimited: 1,
              unfinished: 1,
              durationMs: 1,
            },
          },
          { $sort: { day: 1, operation: 1 } },
        ])
        .exec();
      const last: any = await this.usage
        .findOne({ environment, clientId: c.id })
        .sort({ startedAt: -1 })
        .select('startedAt')
        .lean()
        .exec();
      return {
        from: c.from,
        to: c.to,
        rows,
        lastRequestAt: last?.startedAt || null,
        retentionDays: 90,
      };
    }
    if (c.action === 'get') {
      const item = await this.clients.findOne(filter).lean().exec();
      if (!item) throw new NotFoundException('Integración no encontrada.');
      return item;
    }
    if (!apiObjectId(c.actorId)) bad();
    const now = new Date().toISOString();
    if (c.action === 'create') {
      if (
        !validApiSettings(c.data, true) ||
        c.data.id !== c.id ||
        c.data.enabled !== false ||
        Date.parse(c.data.expiresAt) <= Date.now()
      )
        bad();
      const item = await this.clients.create({
        ...c.data,
        environment,
        revision: 1,
        keys: [],
        createdAt: now,
        updatedAt: now,
        audit: [{ at: now, actorId: c.actorId, action: 'create', revision: 1 }],
      });
      return item.toObject();
    }
    if (!integer(c.revision, 1, Number.MAX_SAFE_INTEGER - 1)) bad();
    const current: ApiClientRecord = (await this.clients
      .findOne(filter)
      .lean()
      .exec()) as any;
    if (!current) throw new NotFoundException('Integración no encontrada.');
    if (current.revision !== c.revision)
      throw new ConflictException(
        'La configuración cambió. Recargá antes de guardar.',
      );
    let set: Partial<ApiClientRecord> = {};
    if (c.action === 'update') {
      if (
        !validApiSettings(c.data) ||
        (c.data.enabled && Date.parse(c.data.expiresAt) <= Date.now())
      )
        bad();
      set = c.data as ApiSettings;
    } else if (c.action === 'issue-key') {
      if (
        !c.key ||
        Object.keys(c.key).length !== 3 ||
        !apiId(c.key.id) ||
        !/^[a-f0-9]{64}$/.test(c.key.sha256) ||
        !apiIsoDate(c.key.expiresAt) ||
        Date.parse(c.key.expiresAt) <= Date.now() ||
        Date.parse(c.key.expiresAt) > Date.parse(current.expiresAt) ||
        current.keys.length >= 3 ||
        current.keys.some((k) => k.id === c.key.id)
      )
        bad();
      set.keys = [...current.keys, c.key];
    } else if (c.action === 'revoke-key') {
      if (!apiId(c.keyId) || !current.keys.some((k) => k.id === c.keyId)) bad();
      set.keys = current.keys.filter((k) => k.id !== c.keyId);
    } else bad();
    const item = await this.clients
      .findOneAndUpdate(
        { ...filter, revision: c.revision },
        {
          $set: { ...set, updatedAt: now },
          $inc: { revision: 1 },
          $push: {
            audit: {
              $each: [
                {
                  at: now,
                  actorId: c.actorId,
                  action: c.action,
                  revision: c.revision + 1,
                },
              ],
              $slice: -100,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
    if (!item)
      throw new ConflictException(
        'La configuración cambió. Recargá antes de guardar.',
      );
    return item;
  }
}
