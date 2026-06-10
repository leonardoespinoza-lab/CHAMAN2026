import { Module } from '@nestjs/common';
import { EnfermedadsService } from './service';
import { EnfermedadsController } from './controller';
import { EnfermedadsRepository } from './repository';
import { Enfermedad, EnfermedadSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [EnfermedadsController],
  providers: [EnfermedadsService, EnfermedadsRepository],
  exports: [EnfermedadsService],
  imports: [
    MongooseModule.forFeature([
      { name: Enfermedad.name, schema: EnfermedadSchema },
    ]),
  ],
})
export class EnfermedadsModule {}
