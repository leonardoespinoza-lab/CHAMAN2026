import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { AuthenticationMiddleware } from './middleware';
import { ApikeysModule } from '../../entidades/apikey/module';

@Module({
  imports: [AxiosModule, ApikeysModule],
  providers: [AuthenticationMiddleware],
  exports: [AuthenticationMiddleware],
})
export class AuthenticationModule {}
