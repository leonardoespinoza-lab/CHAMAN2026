import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { TokenRepository } from './token.repository';
import { TokenService } from './token.service';

@Module({
  imports: [AxiosModule],
  providers: [TokenService, TokenRepository],
  exports: [TokenService],
})
export class TokenModule {}
