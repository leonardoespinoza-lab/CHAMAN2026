import { Module } from '@nestjs/common';
import { ReportesService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReportesRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ReportesService, ReportesRepository],
  exports: [ReportesService],
})
export class ReportesModule {}
