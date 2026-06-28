import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NapasController } from './controller';
import { NapasService } from './service';

@Module({
  imports: [HttpModule],
  controllers: [NapasController],
  providers: [NapasService],
  exports: [NapasService],
})
export class NapasModule {}
