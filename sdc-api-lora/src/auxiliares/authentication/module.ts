import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { AuthenticationMiddleware } from './middleware';

@Module({
  imports: [AxiosModule],
  providers: [AuthenticationMiddleware],
  exports: [AuthenticationMiddleware],
})
export class AuthenticationModule {}
