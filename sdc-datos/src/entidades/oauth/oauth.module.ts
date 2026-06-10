import { Module } from '@nestjs/common';
import { OauthService } from './oauth.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Token, TokenSchema } from './token.model';
import { Client, ClientSchema } from './client.model';
import { OauthController } from './oauth.controller';
import { UsuariosModule } from '../usuario/module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Token.name, schema: TokenSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
    UsuariosModule,
  ],
  providers: [OauthService],
  controllers: [OauthController],
})
export class OauthModule {}
