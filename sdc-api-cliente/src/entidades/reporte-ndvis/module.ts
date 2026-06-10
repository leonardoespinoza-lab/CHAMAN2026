import { Module } from '@nestjs/common';
import { ReporteNDVIsService } from './service';
import { ReporteNDVIsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReporteNDVIsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [ReporteNDVIsController],
  providers: [ReporteNDVIsService, ReporteNDVIsRepository],
  exports: [ReporteNDVIsService],
})
export class ReporteNDVIsModule {}
