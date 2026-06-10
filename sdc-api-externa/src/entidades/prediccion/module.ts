import { Module } from '@nestjs/common';
import { PrediccionsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { PrediccionsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [PrediccionsService, PrediccionsRepository],
  exports: [PrediccionsService],
})
export class PrediccionsModule {}
