import { Module } from '@nestjs/common';
import { ClimaV2Service } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClimaV2Repository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ClimaV2Service, ClimaV2Repository],
  exports: [ClimaV2Service],
})
export class ClimaV2Module {}
