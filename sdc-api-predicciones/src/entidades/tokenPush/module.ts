import { Module } from '@nestjs/common';
import { TokenPushsService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { TokenPushsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [TokenPushsService, TokenPushsRepository],
  exports: [TokenPushsService],
})
export class TokenPushsModule {}
