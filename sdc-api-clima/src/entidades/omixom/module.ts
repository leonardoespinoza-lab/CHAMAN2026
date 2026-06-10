import { Module } from '@nestjs/common';
import { OmixomService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { OmixomRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [OmixomService, OmixomRepository],
  exports: [OmixomService],
})
export class OmixomModule {}
