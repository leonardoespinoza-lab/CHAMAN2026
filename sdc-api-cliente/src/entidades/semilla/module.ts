import { Module } from '@nestjs/common';
import { SemillasService } from './service';
import { SemillasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SemillasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [SemillasController],
  providers: [SemillasService, SemillasRepository],
  exports: [SemillasService],
})
export class SemillasModule {}
