import { Module } from '@nestjs/common';
import { UsuariosService } from './service';
import { UsuariosController } from './controller';
import { UsuariosRepository } from './repository';
import { Usuario, UsuarioSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivacyRequest, PrivacyRequestSchema, PrivacyRequestsController, PrivacyRequestsService, PrivacyInternalGuard } from './privacy-request';

@Module({
  controllers: [UsuariosController, PrivacyRequestsController],
  providers: [UsuariosService, UsuariosRepository, PrivacyRequestsService, PrivacyInternalGuard],
  exports: [UsuariosService],
  imports: [
    MongooseModule.forFeature([{ name: Usuario.name, schema: UsuarioSchema }]),
    MongooseModule.forFeature([{ name: PrivacyRequest.name, schema: PrivacyRequestSchema }]),
  ],
})
export class UsuariosModule {}
