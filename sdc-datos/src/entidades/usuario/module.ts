import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { UsuariosController } from './controller';
import { UsuariosRepository } from './repository';
import { Usuario, UsuarioSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
  imports: [
    MongooseModule.forFeature([{ name: Usuario.name, schema: UsuarioSchema }]),
  ],
})
export class UsuariosModule {}
