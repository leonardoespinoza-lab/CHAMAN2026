import { Module } from '@nestjs/common';
import { LicenciaPorEntidadsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LicenciaPorEntidadsRepository } from './repository';
import { LicenciasModule } from '../licencia/module';

@Module({
  imports: [AxiosModule, LicenciasModule],
  providers: [LicenciaPorEntidadsService, LicenciaPorEntidadsRepository],
  exports: [LicenciaPorEntidadsService],
})
export class LicenciaPorEntidadsModule {}
