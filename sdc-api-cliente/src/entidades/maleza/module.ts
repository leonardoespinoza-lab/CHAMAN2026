import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { MalezasController } from './controller';
import { MalezasRepository } from './repository';
import { MalezasService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [MalezasController],
  providers: [MalezasService, MalezasRepository],
  exports: [MalezasService],
})
export class MalezasModule {}
