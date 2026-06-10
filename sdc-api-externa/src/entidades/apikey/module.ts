import { Module } from '@nestjs/common';
import { ApiKeysService } from './service';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ApiKeyRepository } from './repository';

@Module({
  imports: [AxiosModule],
  providers: [ApiKeysService, ApiKeyRepository],
  exports: [ApiKeysService],
})
export class ApikeysModule {}
