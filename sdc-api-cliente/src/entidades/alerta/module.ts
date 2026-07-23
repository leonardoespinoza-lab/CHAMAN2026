import { Module } from '@nestjs/common';
import { AlertasService } from './service';
import { AlertasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasRepository } from './repository';
import { SiembrasRepository } from '../siembra/repository';

@Module({
  imports: [AxiosModule],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasRepository, SiembrasRepository],
  exports: [AlertasService],
})
export class AlertasModule {}
