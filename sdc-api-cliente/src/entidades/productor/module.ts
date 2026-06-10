import { Module } from '@nestjs/common';
import { ProductorsService } from './service';
import { ProductorsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ProductorsRepository } from './repository';
import { DistribuidorsModule } from '../distribuidor/module';
import { LicenciasModule } from '../licencia/module';
import { LicenciaPorEntidadsModule } from '../licenciaPorEntidad/module';

@Module({
  imports: [
    AxiosModule,
    DistribuidorsModule,
    LicenciasModule,
    LicenciaPorEntidadsModule,
  ],
  controllers: [ProductorsController],
  providers: [ProductorsService, ProductorsRepository],
  exports: [ProductorsService],
})
export class ProductorsModule {}
