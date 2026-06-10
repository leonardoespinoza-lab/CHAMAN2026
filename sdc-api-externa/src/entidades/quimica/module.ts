import { Module } from '@nestjs/common';
import { QuimicasService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { QuimicasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [QuimicasService, QuimicasRepository],
  exports: [QuimicasService],
})
export class QuimicasModule {}
