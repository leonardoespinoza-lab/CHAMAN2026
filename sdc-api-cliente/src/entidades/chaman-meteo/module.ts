import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ChamanMeteoController } from './controller';
import { ChamanMeteoRepository } from './repository';
import { ChamanMeteoService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [ChamanMeteoController],
  providers: [ChamanMeteoRepository, ChamanMeteoService],
})
export class ChamanMeteoModule {}
