import { Module } from '@nestjs/common';
import { PrediccionRiegoService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { PrediccionRiegoRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [PrediccionRiegoService, PrediccionRiegoRepository],
  exports: [PrediccionRiegoService],
})
export class PrediccionRiegoModule {}
