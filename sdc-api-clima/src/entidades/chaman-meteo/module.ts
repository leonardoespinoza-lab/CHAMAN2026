import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ChamanMeteoController } from './controller';
import { ChamanMeteoInternalGuard } from './guard';
import { ChamanMeteoRepository } from './repository';
import { ChamanMeteoService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [ChamanMeteoController],
  providers: [
    ChamanMeteoInternalGuard,
    ChamanMeteoRepository,
    ChamanMeteoService,
  ],
  exports: [ChamanMeteoService],
})
export class ChamanMeteoModule {}
