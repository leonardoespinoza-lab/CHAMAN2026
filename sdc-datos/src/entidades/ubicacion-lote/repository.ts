import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GeorefCatalogEntity,
  GeorefCatalogEntityDocument,
} from './modelos/georef-catalog.schema';
import {
  GeorefCatalogSnapshot,
  GeorefCatalogSnapshotDocument,
  GeorefCatalogState,
  GeorefCatalogStateDocument,
} from './modelos/georef-snapshot.schema';
import {
  LotAdministrativeIntersection,
  LotAdministrativeIntersectionDocument,
  LotAdministrativeLocation,
  LotAdministrativeLocationDocument,
} from './modelos/lot-location.schema';

@Injectable()
export class LotLocationRepository {
  constructor(
    @InjectModel(GeorefCatalogEntity.name)
    private readonly catalog: Model<GeorefCatalogEntityDocument>,
    @InjectModel(GeorefCatalogSnapshot.name)
    private readonly snapshots: Model<GeorefCatalogSnapshotDocument>,
    @InjectModel(GeorefCatalogState.name)
    private readonly state: Model<GeorefCatalogStateDocument>,
    @InjectModel(LotAdministrativeLocation.name)
    private readonly locations: Model<LotAdministrativeLocationDocument>,
    @InjectModel(LotAdministrativeIntersection.name)
    private readonly intersections: Model<LotAdministrativeIntersectionDocument>,
  ) {}

  async getActiveSnapshot(): Promise<GeorefCatalogSnapshot | null> {
    const state = await this.state.findById('active').lean();
    if (!state?.activeSnapshotId) return null;
    return this.snapshots
      .findOne({ snapshotId: state.activeSnapshotId })
      .lean();
  }

  async acquireSyncLock(owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    try {
      const state = await this.state
        .findOneAndUpdate(
          {
            _id: 'sync-lock',
            $or: [
              { lockExpiresAt: { $lte: now } },
              { lockExpiresAt: { $exists: false } },
              { lockOwner: owner },
            ],
          },
          {
            $set: {
              lockOwner: owner,
              lockExpiresAt: new Date(now.getTime() + ttlMs),
            },
          },
          { upsert: true, new: true },
        )
        .lean();
      return state?.lockOwner === owner;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  async releaseSyncLock(owner: string): Promise<void> {
    await this.state.updateOne(
      { _id: 'sync-lock', lockOwner: owner },
      { $unset: { lockOwner: '', lockExpiresAt: '' } },
    );
  }

  async createSnapshot(
    data: Partial<GeorefCatalogSnapshot>,
  ): Promise<GeorefCatalogSnapshot> {
    return this.snapshots.create(data);
  }

  async updateSnapshot(
    snapshotId: string,
    data: Partial<GeorefCatalogSnapshot>,
  ): Promise<void> {
    await this.snapshots.updateOne({ snapshotId }, { $set: data });
  }

  async activateSnapshot(snapshotId: string): Promise<void> {
    const previous = await this.getActiveSnapshot();
    const now = new Date().toISOString();
    await this.state.findByIdAndUpdate(
      'active',
      { $set: { activeSnapshotId: snapshotId, activatedAt: now } },
      { upsert: true },
    );
    await this.updateSnapshot(snapshotId, {
      status: 'active',
      activatedAt: now,
    });
    if (previous?.snapshotId && previous.snapshotId !== snapshotId) {
      await this.updateSnapshot(previous.snapshotId, { status: 'archived' });
    }
  }

  async insertCatalogEntities(
    entities: Partial<GeorefCatalogEntity>[],
  ): Promise<void> {
    const chunkSize = 400;
    for (let offset = 0; offset < entities.length; offset += chunkSize) {
      const chunk = entities.slice(offset, offset + chunkSize);
      await this.catalog.bulkWrite(
        chunk.map((entity) => ({ insertOne: { document: entity } })),
        { ordered: false },
      );
    }
  }

  async deleteSnapshotEntities(snapshotId: string): Promise<void> {
    await this.catalog.deleteMany({ snapshotId });
  }

  async countSnapshotResource(
    snapshotId: string,
    resource: string,
  ): Promise<number> {
    return this.catalog.countDocuments({ snapshotId, resource });
  }

  async findIntersecting(
    snapshotId: string,
    resource: string,
    geometry: Record<string, unknown>,
  ): Promise<GeorefCatalogEntity[]> {
    return this.catalog
      .find({
        snapshotId,
        resource,
        geometry: { $geoIntersects: { $geometry: geometry } },
      })
      .lean();
  }

  async findNearby(
    snapshotId: string,
    resource: string,
    point: { type: 'Point'; coordinates: [number, number] },
    maxDistanceMeters: number,
    limit = 60,
  ): Promise<Array<GeorefCatalogEntity & { distanceMeters: number }>> {
    return this.catalog.aggregate([
      {
        $geoNear: {
          near: point,
          key: 'geometry',
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance: maxDistanceMeters,
          query: { snapshotId, resource },
        },
      },
      { $limit: limit },
    ]);
  }

  async getCurrentLocation(
    loteId: string,
  ): Promise<LotAdministrativeLocation | null> {
    return this.locations.findOne({ loteId, isCurrent: true }).lean();
  }

  async getByResolutionKey(
    resolutionKey: string,
  ): Promise<LotAdministrativeLocation | null> {
    return this.locations.findOne({ resolutionKey }).lean();
  }

  async prepareLocation(
    data: Partial<LotAdministrativeLocation>,
  ): Promise<LotAdministrativeLocation> {
    await this.locations.updateMany(
      { loteId: data.loteId, isCurrent: true },
      { $set: { isCurrent: false } },
    );
    return this.locations.findOneAndUpdate(
      { resolutionKey: data.resolutionKey },
      {
        $set: {
          ...data,
          isCurrent: true,
          fechaActualizacion: new Date().toISOString(),
        },
        $setOnInsert: { intentos: 0 },
      },
      { upsert: true, new: true },
    );
  }

  async makeCurrent(loteId: string, resolutionKey: string): Promise<void> {
    await this.locations.updateMany(
      { loteId, isCurrent: true },
      { $set: { isCurrent: false } },
    );
    await this.locations.updateOne(
      { resolutionKey },
      {
        $set: { isCurrent: true, fechaActualizacion: new Date().toISOString() },
      },
    );
  }

  async saveLocation(
    resolutionKey: string,
    data: Partial<LotAdministrativeLocation>,
  ): Promise<void> {
    await this.locations.updateOne(
      { resolutionKey },
      {
        $set: { ...data, fechaActualizacion: new Date().toISOString() },
        $inc: { intentos: 1 },
      },
    );
  }

  async replaceIntersections(
    resolutionKey: string,
    loteId: string,
    values: Partial<LotAdministrativeIntersection>[],
  ): Promise<void> {
    await this.intersections.deleteMany({ resolutionKey });
    if (!values.length) return;
    await this.intersections.insertMany(
      values.map((value) => ({ ...value, resolutionKey, loteId })),
      { ordered: false },
    );
  }

  async getIntersections(
    resolutionKey: string,
  ): Promise<LotAdministrativeIntersection[]> {
    return this.intersections
      .find({ resolutionKey })
      .sort({ recurso: 1, porcentajeLote: -1 })
      .lean();
  }
}
