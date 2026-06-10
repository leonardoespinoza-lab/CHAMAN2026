import { Module } from '@nestjs/common';
import { TokensService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { TokensRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [TokensService, TokensRepository],
  exports: [TokensService],
})
export class TokensModule {}
