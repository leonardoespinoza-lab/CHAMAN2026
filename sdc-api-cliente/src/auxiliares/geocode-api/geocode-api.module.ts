import { Module } from '@nestjs/common';
import { GeocodesService } from './geocode-api.service';
import { GeocodesController } from './geocode-api.controller';
import { AxiosModule } from '../axios/axios.module';
import { NodeGeocoderModule } from './node-geocoder/node-geocoder.module';

@Module({
  imports: [AxiosModule, NodeGeocoderModule],
  controllers: [GeocodesController],
  providers: [GeocodesService],
  exports: [GeocodesService],
})
export class GeoCodeApiModule {}
