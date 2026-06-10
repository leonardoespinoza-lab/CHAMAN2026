import { Module } from '@nestjs/common';
import { FertilizantesService } from './service';
import { FertilizantesController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FertilizantesRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [FertilizantesController],
  providers: [FertilizantesService, FertilizantesRepository],
  exports: [FertilizantesService],
})
export class FertilizantesModule {}
