import { Module } from '@nestjs/common';
import { AlertasService } from './service';
import { AlertasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasRepository],
  exports: [AlertasService],
})
export class AlertasModule {}
