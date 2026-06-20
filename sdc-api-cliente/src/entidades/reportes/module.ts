import { Module } from '@nestjs/common';
import { ReportesService } from './service';
import { ReportesController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReportesRepository } from './repository';
import { DispositivosModule } from '../dispositivos/module';

@Module({
  imports: [AxiosModule, DispositivosModule],
  controllers: [ReportesController],
  providers: [ReportesService, ReportesRepository],
  exports: [ReportesService],
})
export class ReportesModule {}
