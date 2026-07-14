import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'georef_catalog_snapshots', timestamps: true })
export class GeorefCatalogSnapshot {
  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  sourceVersion: string;

  @Prop({
    required: true,
    enum: ['syncing', 'ready', 'active', 'archived', 'failed'],
  })
  status: 'syncing' | 'ready' | 'active' | 'archived' | 'failed';

  @Prop({ type: [Object], default: [] })
  resources: Array<{
    resource: string;
    sourceUrl: string;
    count: number;
    etag?: string;
    lastModified?: string;
    checksum: string;
  }>;

  @Prop({ required: true })
  checksum: string;

  @Prop({ default: 'GeoRef Argentina' })
  source: string;

  @Prop({ default: 'CC BY 4.0' })
  license: string;

  @Prop({ default: 'Servicio Georef - argentina.gob.ar/georef' })
  attribution: string;

  @Prop()
  previousSnapshotId?: string;

  @Prop()
  downloadedAt?: string;

  @Prop()
  activatedAt?: string;

  @Prop()
  error?: string;
}

export type GeorefCatalogSnapshotDocument = GeorefCatalogSnapshot & Document;
export const GeorefCatalogSnapshotSchema = SchemaFactory.createForClass(
  GeorefCatalogSnapshot,
);
GeorefCatalogSnapshotSchema.index(
  { snapshotId: 1 },
  { unique: true, name: 'snapshot_id' },
);
GeorefCatalogSnapshotSchema.index(
  { status: 1, activatedAt: -1 },
  { name: 'snapshot_status_activation' },
);

@Schema({ collection: 'georef_catalog_state', versionKey: false })
export class GeorefCatalogState {
  @Prop({ required: true })
  _id: string;

  @Prop()
  activeSnapshotId?: string;

  @Prop()
  activatedAt?: string;

  @Prop()
  lockOwner?: string;

  @Prop()
  lockExpiresAt?: Date;
}

export type GeorefCatalogStateDocument = GeorefCatalogState & Document;
export const GeorefCatalogStateSchema =
  SchemaFactory.createForClass(GeorefCatalogState);
