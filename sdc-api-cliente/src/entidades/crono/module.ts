import { Module } from '@nestjs/common';
import { CronosService } from './service';
import { CronosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { CronosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [CronosController],
  providers: [CronosService, CronosRepository],
  exports: [CronosService],
})
export class CronosModule {}
