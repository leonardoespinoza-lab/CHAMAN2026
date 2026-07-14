import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IInteligenciaSueloLote, TEstadoInteligenciaSuelo } from 'modelos/src';
import { Model } from 'mongoose';
import { LotSoilAssessment, LotSoilAssessmentDocument } from './modelos/schema';

@Injectable()
export class SoilIntelligenceRepository {
  constructor(
    @InjectModel(LotSoilAssessment.name)
    private readonly assessments: Model<LotSoilAssessmentDocument>,
  ) {}

  async getByLot(loteId: string): Promise<IInteligenciaSueloLote | null> {
    return (await this.assessments.findOne({ loteId }).lean()) as any;
  }

  async prepare(
    data: Partial<IInteligenciaSueloLote> &
      Pick<IInteligenciaSueloLote, 'loteId' | 'status'>,
  ): Promise<IInteligenciaSueloLote> {
    return (await this.assessments.findOneAndUpdate(
      { loteId: data.loteId },
      {
        $set: data,
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )) as any;
  }

  async complete(
    loteId: string,
    resolutionKey: string,
    data: Partial<IInteligenciaSueloLote>,
  ): Promise<IInteligenciaSueloLote | null> {
    return (await this.assessments.findOneAndUpdate(
      { loteId, resolutionKey },
      { $set: data },
      { new: true },
    )) as any;
  }

  async claimPending(limit = 1): Promise<IInteligenciaSueloLote[]> {
    const rows: IInteligenciaSueloLote[] = [];
    const staleProcessing = new Date(Date.now() - 30 * 60_000).toISOString();
    const retryAfter = new Date(Date.now() - 30 * 60_000);
    for (let index = 0; index < Math.max(0, limit); index++) {
      const claimed = await this.assessments
        .findOneAndUpdate(
          {
            attempts: { $lt: 4 },
            $or: [
              { status: 'pending' },
              {
                status: { $in: ['partial', 'failed'] },
                updatedAt: { $lt: retryAfter },
              },
              {
                status: 'processing',
                processingStartedAt: { $lt: staleProcessing },
              },
            ],
          },
          {
            $set: {
              status: 'processing',
              processingStartedAt: new Date().toISOString(),
            },
          },
          { new: true, sort: { requestedAt: 1 } },
        )
        .lean();
      if (!claimed) break;
      rows.push(claimed as any);
    }
    return rows;
  }

  async countByStatus(): Promise<Record<TEstadoInteligenciaSuelo, number>> {
    const rows = await this.assessments.aggregate<{
      _id: TEstadoInteligenciaSuelo;
      count: number;
    }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count])) as any;
  }
}
