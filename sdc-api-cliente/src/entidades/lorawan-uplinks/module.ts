import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { LorawanUplinksController } from './controller';
import { LorawanUplinksRepository } from './repository';
import { LorawanUplinksService } from './service';
import { DispositivosModule } from '../dispositivos/module';

@Module({
  imports: [AxiosModule, DispositivosModule],
  controllers: [LorawanUplinksController],
  providers: [LorawanUplinksService, LorawanUplinksRepository],
  exports: [LorawanUplinksService],
})
export class LorawanUplinksModule {}
