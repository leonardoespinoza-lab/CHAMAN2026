import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { ChirpstackDeviceSyncService } from './service';

@Module({
  imports: [AxiosModule],
  providers: [ChirpstackDeviceSyncService],
})
export class ChirpstackDeviceSyncModule {}
