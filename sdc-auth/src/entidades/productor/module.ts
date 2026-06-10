import { Module } from '@nestjs/common';
import { ProductorsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ProductorsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ProductorsService, ProductorsRepository],
  exports: [ProductorsService],
})
export class ProductorsModule {}
