import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Departamento,
  DepartamentoSchema,
} from '../departamento/modelos/schema';
import { Lote, LoteSchema } from '../lote/modelos/schema';
import {
  Establecimiento,
  EstablecimientoSchema,
} from '../establecimiento/modelos/schema';
import { Provincia, ProvinciaSchema } from '../provincia/modelos/schema';
import { LotLocationConfidenceService } from './confidence.service';
import { LotLocationController } from './controller';
import { GeorefCatalogSyncService } from './georef-sync.service';
import { LotGeometryNormalizer } from './geometry-normalizer.service';
import { LotLocationInternalGuard } from './internal-token.guard';
import { LotLocationJobsService } from './jobs.service';
import {
  GeorefCatalogEntity,
  GeorefCatalogEntitySchema,
} from './modelos/georef-catalog.schema';
import {
  GeorefCatalogSnapshot,
  GeorefCatalogSnapshotSchema,
  GeorefCatalogState,
  GeorefCatalogStateSchema,
} from './modelos/georef-snapshot.schema';
import {
  LotAdministrativeIntersection,
  LotAdministrativeIntersectionSchema,
  LotAdministrativeLocation,
  LotAdministrativeLocationSchema,
} from './modelos/lot-location.schema';
import { LotAdministrativeResolver } from './resolver.service';
import { LotLocationRepository } from './repository';
import { LotLocationService } from './service';
import { EstablishmentLocationService } from './establishment-location.service';
import {
  EstablishmentAdministrativeLocation,
  EstablishmentAdministrativeLocationSchema,
} from './modelos/establishment-location.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lote.name, schema: LoteSchema },
      { name: Establecimiento.name, schema: EstablecimientoSchema },
      { name: Departamento.name, schema: DepartamentoSchema },
      { name: Provincia.name, schema: ProvinciaSchema },
      { name: GeorefCatalogEntity.name, schema: GeorefCatalogEntitySchema },
      { name: GeorefCatalogSnapshot.name, schema: GeorefCatalogSnapshotSchema },
      { name: GeorefCatalogState.name, schema: GeorefCatalogStateSchema },
      {
        name: LotAdministrativeLocation.name,
        schema: LotAdministrativeLocationSchema,
      },
      {
        name: LotAdministrativeIntersection.name,
        schema: LotAdministrativeIntersectionSchema,
      },
      {
        name: EstablishmentAdministrativeLocation.name,
        schema: EstablishmentAdministrativeLocationSchema,
      },
    ]),
  ],
  controllers: [LotLocationController],
  providers: [
    LotLocationRepository,
    LotGeometryNormalizer,
    LotLocationConfidenceService,
    LotAdministrativeResolver,
    GeorefCatalogSyncService,
    LotLocationService,
    EstablishmentLocationService,
    LotLocationInternalGuard,
    LotLocationJobsService,
  ],
  exports: [
    LotLocationService,
    EstablishmentLocationService,
    LotLocationRepository,
    LotGeometryNormalizer,
    LotLocationInternalGuard,
  ],
})
export class LotLocationModule {}
