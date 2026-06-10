import { Module } from '@nestjs/common';
import { TokenPushsService } from './service';
import { TokenPushController } from './controller';
import { TokenPushsRepository } from './repository';
import { TokenPush, TokenPushSchema } from './modelos/schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [TokenPushController],
  providers: [TokenPushsService, TokenPushsRepository],
  exports: [TokenPushsService],
  imports: [
    MongooseModule.forFeature([
      { name: TokenPush.name, schema: TokenPushSchema },
    ]),
  ],
})
export class TokenPushsModule {}
