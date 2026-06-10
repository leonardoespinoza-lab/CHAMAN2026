import { Module } from '@nestjs/common';
import { ApikeysService } from './service';
import { ApikeysController } from './controller';
import { ApikeysRepository } from './repository';
import { Apikey, ApikeySchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ApikeysController],
  providers: [ApikeysService, ApikeysRepository],
  exports: [ApikeysService],
  imports: [
    MongooseModule.forFeature([{ name: Apikey.name, schema: ApikeySchema }]),
  ],
})
export class ApikeysModule {}
