import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AxiosService } from './axios.service';
import { AUTH_DATOS_TIMEOUT_MS } from '../../env';

@Module({
  imports: [
    HttpModule.register({
      timeout: AUTH_DATOS_TIMEOUT_MS,
      maxRedirects: 2,
    }),
  ],
  providers: [AxiosService],
  exports: [AxiosService],
})
export class AxiosModule {}
