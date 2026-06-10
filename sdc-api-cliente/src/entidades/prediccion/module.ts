import { Module } from '@nestjs/common';
import { PrediccionsService } from './service';
import { PrediccionsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { PrediccionsRepository } from './repository';
import { XlsxModule } from '../../auxiliares/xlsx/xlsx.module';

@Module({
  imports: [AxiosModule, XlsxModule],
  controllers: [PrediccionsController],
  providers: [PrediccionsService, PrediccionsRepository],
  exports: [PrediccionsService],
})
export class PrediccionsModule {}
