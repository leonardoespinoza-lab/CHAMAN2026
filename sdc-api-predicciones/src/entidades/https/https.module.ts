import { Module } from '@nestjs/common';
import { HttpsService } from './https.service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';

@Module({
  imports: [AxiosModule],
  providers: [HttpsService],
  exports: [HttpsService],
})
export class HttpsModule {}
