import { Module } from '@nestjs/common';
import { TokenPushsService } from './service';
import { TokenPushsController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { TokenPushsRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [TokenPushsController],
  providers: [TokenPushsService, TokenPushsRepository],
  exports: [TokenPushsService],
})
export class TokenPushsModule {}
