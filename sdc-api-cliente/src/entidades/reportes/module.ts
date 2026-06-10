import { Module } from '@nestjs/common';
import { ReportesService } from './service';
import { ReportesController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReportesRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [ReportesController],
  providers: [ReportesService, ReportesRepository],
  exports: [ReportesService],
})
export class ReportesModule {}
