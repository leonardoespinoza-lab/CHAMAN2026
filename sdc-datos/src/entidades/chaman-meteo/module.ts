import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChamanMeteoController } from './controller';
import { ChamanMeteoStorageGuard } from './guard';
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
  ChamanMeteoCoverageSchema,
  ChamanMeteoDailySchema,
  ChamanMeteoGridPointSchema,
  ChamanMeteoHourlyDerivedSchema,
  ChamanMeteoHourlyRawSchema,
  ChamanMeteoImportJobSchema,
  ChamanMeteoLocationBindingSchema,
  ChamanMeteoVersionedCoverageSchema,
  ChamanMeteoVersionedHourlyRawSchema,
} from './modelos/schema';
import { ChamanMeteoRepository } from './repository';
import { ChamanMeteoService } from './service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CHAMAN_METEO_GRID_POINT_MODEL,
        schema: ChamanMeteoGridPointSchema,
      },
      {
        name: CHAMAN_METEO_LOCATION_BINDING_MODEL,
        schema: ChamanMeteoLocationBindingSchema,
      },
      {
        name: CHAMAN_METEO_HOURLY_RAW_MODEL,
        schema: ChamanMeteoHourlyRawSchema,
      },
      {
        name: CHAMAN_METEO_VERSIONED_HOURLY_RAW_MODEL,
        schema: ChamanMeteoVersionedHourlyRawSchema,
      },
      {
        name: CHAMAN_METEO_HOURLY_DERIVED_MODEL,
        schema: ChamanMeteoHourlyDerivedSchema,
      },
      { name: CHAMAN_METEO_DAILY_MODEL, schema: ChamanMeteoDailySchema },
      { name: CHAMAN_METEO_COVERAGE_MODEL, schema: ChamanMeteoCoverageSchema },
      {
        name: CHAMAN_METEO_VERSIONED_COVERAGE_MODEL,
        schema: ChamanMeteoVersionedCoverageSchema,
      },
      {
        name: CHAMAN_METEO_IMPORT_JOB_MODEL,
        schema: ChamanMeteoImportJobSchema,
      },
    ]),
  ],
  controllers: [ChamanMeteoController],
  providers: [
    ChamanMeteoStorageGuard,
    ChamanMeteoRepository,
    ChamanMeteoService,
  ],
  exports: [ChamanMeteoService],
})
export class ChamanMeteoModule {}
