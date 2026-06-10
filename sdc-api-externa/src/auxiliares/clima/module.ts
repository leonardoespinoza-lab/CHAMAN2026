import { Module } from '@nestjs/common';
import { ClimaService } from './service';
import { AxiosModule } from '../axios/axios.module';
import { ClimaRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ClimaService, ClimaRepository],
  exports: [ClimaService],
})
export class ClimaModule {}
