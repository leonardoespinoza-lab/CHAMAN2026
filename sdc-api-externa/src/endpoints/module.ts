import { Module } from '@nestjs/common';
import { AxiosModule } from '../auxiliares/axios/axios.module';
import { EndpointsService } from './service';
import { EndpointsController } from './controller';
import { EstablecimientosModule } from '../entidades/establecimiento/module';
import { LotesModule } from '../entidades/lote/module';
import { SemillasModule } from '../entidades/semilla/module';
import { SiembrasModule } from '../entidades/siembra/module';
import { DepartamentosModule } from '../entidades/departamento/module';
import { ProductorsModule } from '../entidades/productor/module';
import { ApikeysModule } from '../entidades/apikey/module';
import { PrediccionRiegoModule } from '../entidades/prediccion-riego/module';
import { PrediccionsModule } from '../entidades/prediccion/module';

@Module({
  imports: [
    AxiosModule,
    EstablecimientosModule,
    LotesModule,
    SemillasModule,
    SiembrasModule,
    DepartamentosModule,
    ProductorsModule,
    ApikeysModule,
    PrediccionRiegoModule,
    PrediccionsModule,
  ],
  controllers: [EndpointsController],
  providers: [EndpointsService],
  exports: [EndpointsService],
})
export class EndpointsModule {}
