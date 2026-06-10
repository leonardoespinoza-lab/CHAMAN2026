import { Module } from '@nestjs/common';
import { OpenWeatherService } from './service';
import { FieldClimateController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { OpenWeatherRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [FieldClimateController],
  providers: [OpenWeatherService, OpenWeatherRepository],
  exports: [OpenWeatherService],
})
export class OpenWeatherModule {}
