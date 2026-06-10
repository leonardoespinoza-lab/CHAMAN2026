import { Module } from '@nestjs/common';
import { DistribuidorsService } from './service';
import { DistribuidorsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { DistribuidorsRepository } from './repository';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';
import { LicenciasModule } from '../licencia/module';

@Module({
  imports: [AxiosModule, LicenciaPorEntidadsModule, LicenciasModule],
  controllers: [DistribuidorsController],
  providers: [DistribuidorsService, DistribuidorsRepository],
  exports: [DistribuidorsService],
})
export class DistribuidorsModule {}
