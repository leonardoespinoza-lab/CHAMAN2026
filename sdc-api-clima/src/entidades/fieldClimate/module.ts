import { Module } from '@nestjs/common';
import { FieldClimateService } from './service';
import { FieldClimateController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FieldClimateRepository } from './repository';
import { EstacionsModule } from '../estacion/module';

@Module({
  imports: [AxiosModule, EstacionsModule],
  controllers: [FieldClimateController],
  providers: [FieldClimateService, FieldClimateRepository],
  exports: [FieldClimateService],
})
export class FieldClimateModule {}
