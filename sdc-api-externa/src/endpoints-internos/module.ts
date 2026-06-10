import { Module } from '@nestjs/common';
import { AxiosModule } from '../auxiliares/axios/axios.module';
import { EndpointsService } from './service';
import { EndpointsController } from './controller';
import { ReporteNDVIsModule } from 'src/entidades/reporte-ndvis/module';
import { LotesModule } from 'src/entidades/lote/module';

@Module({
  imports: [AxiosModule, ReporteNDVIsModule, LotesModule],
  controllers: [EndpointsController],
  providers: [EndpointsService],
  exports: [EndpointsService],
})
export class EndpointsInternosModule {}
