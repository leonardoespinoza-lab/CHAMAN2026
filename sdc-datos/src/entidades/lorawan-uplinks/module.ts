import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DispositivosModule } from '../dispositivos/module';
import { ReportesModule } from '../reportes/module';
import { LorawanUplinksController } from './controller';
import {
  LorawanUplink,
  LorawanUplinkSchema,
} from './modelos/schema';
import { LorawanUplinksRepository } from './repository';
import { LorawanUplinksService } from './service';

@Module({
  controllers: [LorawanUplinksController],
  providers: [LorawanUplinksService, LorawanUplinksRepository],
  exports: [LorawanUplinksService],
  imports: [
    DispositivosModule,
    ReportesModule,
    MongooseModule.forFeature([
      { name: LorawanUplink.name, schema: LorawanUplinkSchema },
    ]),
  ],
})
export class LorawanUplinksModule {}
