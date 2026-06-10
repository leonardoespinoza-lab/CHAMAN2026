import { forwardRef, Module } from '@nestjs/common';
import { FumigacionsService } from './service';
import { FumigacionsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { FumigacionsRepository } from './repository';
import { AlertasModule } from '../alerta/module';
import { SiembrasModule } from '../siembra/module';

@Module({
  imports: [AxiosModule, AlertasModule, forwardRef(() => SiembrasModule)],
  controllers: [FumigacionsController],
  providers: [FumigacionsService, FumigacionsRepository],
  exports: [FumigacionsService],
})
export class FumigacionsModule {}
