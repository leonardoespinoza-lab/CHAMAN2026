import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FieldClimateIntegracionController } from './controller';
import { FieldClimateIntegracionRepository } from './repository';
import { FieldClimateIntegracionService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [FieldClimateIntegracionController],
  providers: [FieldClimateIntegracionService, FieldClimateIntegracionRepository],
})
export class FieldClimateIntegracionModule {}
