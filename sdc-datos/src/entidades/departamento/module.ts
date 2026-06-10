import { Module } from '@nestjs/common';
import { DepartamentosService } from './service';
import { DepartamentosController } from './controller';
import { DepartamentosRepository } from './repository';
import { Departamento, DepartamentoSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [DepartamentosController],
  providers: [DepartamentosService, DepartamentosRepository],
  exports: [DepartamentosService],
  imports: [
    MongooseModule.forFeature([
      { name: Departamento.name, schema: DepartamentoSchema },
    ]),
  ],
})
export class DepartamentosModule {}
