import { Module } from '@nestjs/common';
import { PrincipioActivosService } from './service';
import { PrincipioActivosController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { PrincipioActivosRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [PrincipioActivosController],
  providers: [PrincipioActivosService, PrincipioActivosRepository],
  exports: [PrincipioActivosService],
})
export class PrincipioActivosModule {}
