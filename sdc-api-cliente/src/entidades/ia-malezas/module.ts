import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { IaMalezasController } from './controller';
import { IaMalezasRepository } from './repository';
import { IaMalezasService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [IaMalezasController],
  providers: [IaMalezasService, IaMalezasRepository],
  exports: [IaMalezasService],
})
export class IaMalezasModule {}
