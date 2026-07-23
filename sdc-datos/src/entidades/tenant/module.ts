import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantsController } from './controller';
import { Tenant, TenantSchema } from './modelos/schema';
import { TenantsRepository } from './repository';
import { TenantsService } from './service';
import {
  Usuario,
  UsuarioSchema,
} from '../usuario/modelos/schema';
import { Token, TokenSchema } from '../oauth/token.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Usuario.name, schema: UsuarioSchema },
      { name: Token.name, schema: TokenSchema },
    ]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [TenantsService],
})
export class TenantsModule {}
