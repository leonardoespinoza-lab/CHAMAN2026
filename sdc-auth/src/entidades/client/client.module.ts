import { Module } from '@nestjs/common';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { ClientsRepository } from './client.repository';
import { ClientsService } from './client.service';

@Module({
  imports: [AxiosModule],
  providers: [ClientsService, ClientsRepository],
  exports: [ClientsService],
})
export class ClientsModule {}
