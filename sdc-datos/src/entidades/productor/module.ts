import { Module } from '@nestjs/common';
import { ProductorsService } from './service';
import { ProductorsController } from './controller';
import { ProductorsRepository } from './repository';
import { Productor, ProductorSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ProductorsController],
  providers: [ProductorsService, ProductorsRepository],
  exports: [ProductorsService],
  imports: [
    MongooseModule.forFeature([
      { name: Productor.name, schema: ProductorSchema },
    ]),
  ],
})
export class ProductorsModule {}
