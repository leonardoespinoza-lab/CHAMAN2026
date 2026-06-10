import { Module } from '@nestjs/common';
import { ReporteNDVIsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ReporteNDVIRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ReporteNDVIsService, ReporteNDVIRepository],
  exports: [ReporteNDVIsService],
})
export class ReporteNDVIsModule {}
