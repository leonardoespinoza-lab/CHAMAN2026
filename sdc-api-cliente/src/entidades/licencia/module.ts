import { Module } from '@nestjs/common';
import { LicenciasService } from './service';
import { LicenciasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LicenciasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [LicenciasController],
  providers: [LicenciasService, LicenciasRepository],
  exports: [LicenciasService],
})
export class LicenciasModule {}
