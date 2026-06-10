import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationMiddleware } from './authentication.middleware';
import { AuthenticationRepository } from './authentication.repository';
import { AuthenticationService } from './authentication.service';
import { TokensModule } from 'src/entidades/token/module';
import { LicenciaPorEntidadsModule } from 'src/entidades/licenciaPorEntidad/module';
import { CacheWarmingModule } from '../cache-warming/cache-warming.module';

@Module({
  imports: [
    AxiosModule,
    TokensModule,
    LicenciaPorEntidadsModule,
    CacheWarmingModule,
  ],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationMiddleware,
    AuthenticationService,
    AuthenticationRepository,
  ],
  exports: [AuthenticationMiddleware, AuthenticationService],
})
export class AuthenticationModule {}
