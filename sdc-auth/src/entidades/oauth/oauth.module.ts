import { Module } from '@nestjs/common';
import { OauthService } from './oauth.service';
import { OauthController } from './oauth.controller';
import { OauthModel } from './oauth.model';
import { ClientsModule } from '../client/client.module';
import { TokenModule } from '../token/token.module';
import { ProductorsModule } from '../productor/module';
import { UsuariosModule } from '../usuario/module';

@Module({
  imports: [UsuariosModule, ClientsModule, TokenModule, ProductorsModule],
  controllers: [OauthController],
  providers: [OauthService, OauthModel],
})
export class OauthModule {}
