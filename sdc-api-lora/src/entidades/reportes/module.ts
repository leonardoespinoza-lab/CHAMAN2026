import { Module } from '@nestjs/common';
import { ReportesService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReportesRepository } from './repository';
import { ReportesController } from './controller';
import { DispositivosModule } from '../dispositivos/module';

@Module({
  imports: [AxiosModule, DispositivosModule],
  providers: [ReportesService, ReportesRepository],
  controllers: [ReportesController],
  exports: [ReportesService],
})
export class ReportesModule {}
