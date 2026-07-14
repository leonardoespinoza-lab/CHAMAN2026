import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'georef_catalog_entities', timestamps: true })
export class GeorefCatalogEntity {
  @Prop({ required: true, index: true })
  snapshotId: string;

  @Prop({ required: true, index: true })
  resource: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  fullName?: string;

  @Prop()
  category?: string;

  @Prop()
  source?: string;

  @Prop({ type: Object })
  province?: { id?: string; name?: string };

  @Prop({ type: Object })
  department?: { id?: string; name?: string };

  @Prop({ type: Object })
  localGovernment?: { id?: string; name?: string };

  @Prop({ type: Object })
  censusLocality?: { id?: string; name?: string };

  @Prop({ type: Object, required: true })
  geometry: Record<string, unknown>;

  @Prop({ type: Object })
  centroid?: { type: 'Point'; coordinates: [number, number] };

  @Prop({ type: Object })
  originalAttributes?: Record<string, unknown>;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop()
  sourceUpdatedAt?: string;

  @Prop({ required: true })
  contentHash: string;

  @Prop()
  sourceGeometryHash?: string;

  @Prop({ type: Object })
  geometryRepair?: {
    repaired: boolean;
    removedRings?: number;
    removedPolygons?: number;
    promotedRings?: number;
  };

  @Prop({ default: 'CC BY 4.0' })
  license: string;

  @Prop({ default: 'Servicio Georef - argentina.gob.ar/georef' })
  attribution: string;
}

export type GeorefCatalogEntityDocument = GeorefCatalogEntity & Document;
export const GeorefCatalogEntitySchema =
  SchemaFactory.createForClass(GeorefCatalogEntity);

GeorefCatalogEntitySchema.index(
  { snapshotId: 1, resource: 1, entityId: 1 },
  { unique: true, name: 'snapshot_resource_entity' },
);
GeorefCatalogEntitySchema.index(
  { geometry: '2dsphere' },
  { name: 'catalog_geometry_2dsphere' },
);
GeorefCatalogEntitySchema.index(
  { snapshotId: 1, resource: 1, 'province.id': 1 },
  { name: 'snapshot_resource_province' },
);
