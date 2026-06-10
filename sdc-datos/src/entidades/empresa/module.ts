import { Module } from '@nestjs/common';
import { EmpresasService } from './service';
import { EmpresasController } from './controller';
import { EmpresasRepository } from './repository';
import { Empresa, EmpresaSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [EmpresasController],
  providers: [EmpresasService, EmpresasRepository],
  exports: [EmpresasService],
  imports: [
    MongooseModule.forFeature([{ name: Empresa.name, schema: EmpresaSchema }]),
  ],
})
export class EmpresasModule {}
