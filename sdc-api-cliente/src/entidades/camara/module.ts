import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { CamarasController } from './controller';
import { CamarasRepository } from './repository';
import { CamarasService } from './service';

@Module({
  imports: [AxiosModule],
  controllers: [CamarasController],
  providers: [CamarasService, CamarasRepository],
  exports: [CamarasService],
})
export class CamarasModule {}
