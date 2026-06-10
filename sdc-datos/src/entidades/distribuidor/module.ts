import { Module } from '@nestjs/common';
import { DistribuidorsService } from './service';
import { DistribuidorsController } from './controller';
import { DistribuidorsRepository } from './repository';
import { Distribuidor, DistribuidorSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [DistribuidorsController],
  providers: [DistribuidorsService, DistribuidorsRepository],
  exports: [DistribuidorsService],
  imports: [
    MongooseModule.forFeature([
      { name: Distribuidor.name, schema: DistribuidorSchema },
    ]),
  ],
})
export class DistribuidorsModule {}
