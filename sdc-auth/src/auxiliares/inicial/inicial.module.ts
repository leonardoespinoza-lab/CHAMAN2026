import { Module } from '@nestjs/common';
import { ClientsModule } from '../../entidades/client/client.module';
import { InicialService } from './inicial.service';

@Module({
  imports: [ClientsModule],
  providers: [InicialService],
  exports: [InicialService],
})
export class InicialModule {}
