import { Module } from '@nestjs/common';
import { AxiosModule } from '../axios/axios.module';
import { AuthenticationRepository } from './authentication.repository';
import { AuthenticationService } from './authentication.service';

@Module({
  imports: [AxiosModule],
  providers: [AuthenticationService, AuthenticationRepository],
  exports: [AuthenticationService],
})
export class AuthenticationModule {}
