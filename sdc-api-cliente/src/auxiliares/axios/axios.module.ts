import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { INTERNAL_HTTP_TIMEOUT_MS } from '../../env';
import { AxiosService } from './axios.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: INTERNAL_HTTP_TIMEOUT_MS,
    }),
  ],
  providers: [AxiosService],
  exports: [AxiosService],
})
export class AxiosModule {}
