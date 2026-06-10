import { Module } from '@nestjs/common';
import { QuimicasService } from './service';
import { QuimicasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { QuimicasRepository } from './repository';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';
import { LicenciasModule } from '../licencia/module';

@Module({
  imports: [AxiosModule, LicenciaPorEntidadsModule, LicenciasModule],
  controllers: [QuimicasController],
  providers: [QuimicasService, QuimicasRepository],
  exports: [QuimicasService],
})
export class QuimicasModule {}
