import { Module } from '@nestjs/common';
import { SiembrasService } from './service';
import { SiembrasController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { SiembrasRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [SiembrasController],
  providers: [SiembrasService, SiembrasRepository],
  exports: [SiembrasService],
})
export class SiembrasModule {}
