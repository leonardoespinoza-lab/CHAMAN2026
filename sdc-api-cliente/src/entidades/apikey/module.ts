import { Module } from '@nestjs/common';
import { ApikeysService } from './service';
import { ApikeysController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ApikeysRepository } from './repository';

@Module({
  imports: [AxiosModule],
  controllers: [ApikeysController],
  providers: [ApikeysService, ApikeysRepository],
  exports: [ApikeysService],
})
export class ApikeysModule {}
