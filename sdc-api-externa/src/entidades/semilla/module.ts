import { Module } from '@nestjs/common';
import { SemillasService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SemillasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [SemillasService, SemillasRepository],
  exports: [SemillasService],
})
export class SemillasModule {}
