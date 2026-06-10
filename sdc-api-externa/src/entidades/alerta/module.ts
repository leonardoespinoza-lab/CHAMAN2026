import { Module } from '@nestjs/common';
import { AlertasService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { AlertasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [AlertasService, AlertasRepository],
  exports: [AlertasService],
})
export class AlertasModule {}
