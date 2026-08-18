import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NapasController } from './controller';
import { NapasService } from './service';
import { LotesModule } from '../lote/module';

@Module({
  imports: [HttpModule, LotesModule],
  controllers: [NapasController],
  providers: [NapasService],
  exports: [NapasService],
})
export class NapasModule {}
