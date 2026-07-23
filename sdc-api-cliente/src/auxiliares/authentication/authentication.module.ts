import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationMiddleware } from './authentication.middleware';
import { AuthenticationRepository } from './authentication.repository';
import { AuthenticationService } from './authentication.service';
import { TokensModule } from 'src/entidades/token/module';
import { LicenciaPorEntidadsModule } from 'src/entidades/licenciaPorEntidad/module';
import { CacheWarmingModule } from '../cache-warming/cache-warming.module';
import { AdvisorScopeModule } from '../authorization/advisor-scope.module';

@Module({
  imports: [
    AxiosModule,
    TokensModule,
    LicenciaPorEntidadsModule,
    CacheWarmingModule,
    AdvisorScopeModule,
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
