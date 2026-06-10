import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { PrediccionRiegoService } from './service';
import { PrediccionRiegoRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [PrediccionRiegoService, PrediccionRiegoRepository],
  exports: [PrediccionRiegoService],
})
export class PrediccionRiegoModule {}
