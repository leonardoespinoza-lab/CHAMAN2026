import { Module } from '@nestjs/common';
import { ClimaService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [],
  providers: [ClimaService, ClimaRepository],
  exports: [ClimaService],
})
export class ClimaModule {}
