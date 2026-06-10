import { Module } from '@nestjs/common';
import { NodeGeocodeService } from './node-geocoder.service';
import { AxiosModule } from 'src/auxiliares/axios/axios.module';

@Module({
  imports: [AxiosModule],
  providers: [NodeGeocodeService],
  exports: [NodeGeocodeService],
})
export class NodeGeocoderModule {}
