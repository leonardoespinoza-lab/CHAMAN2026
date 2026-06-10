import { Module, forwardRef } from '@nestjs/common';
import { EstablecimientosService } from './service';
import { EstablecimientosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { EstablecimientosRepository } from './repository';
import { ProductorsModule } from '../productor/module';
import { ClimaModule } from '../clima/module';
import { EstablecimientosClimateSyncService } from './climate-sync.service';

@Module({
  imports: [AxiosModule, ProductorsModule, forwardRef(() => ClimaModule)],
  controllers: [EstablecimientosController],
  providers: [
    EstablecimientosService,
    EstablecimientosRepository,
    EstablecimientosClimateSyncService,
  ],
  exports: [EstablecimientosService],
})
export class EstablecimientosModule {}
