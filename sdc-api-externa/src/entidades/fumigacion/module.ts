import { Module } from '@nestjs/common';
import { FumigacionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FumigacionsRepository } from './repository';
import { AlertasModule } from '../alerta/module';

@Module({
  imports: [AxiosModule, AlertasModule],
  providers: [FumigacionsService, FumigacionsRepository],
  exports: [FumigacionsService],
})
export class FumigacionsModule {}
