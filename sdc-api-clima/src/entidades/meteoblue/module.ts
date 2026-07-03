import { Module } from '@nestjs/common';
import { RateLimiterModule } from '../../auxiliares/rate-limiter/rate-limiter.module';
import { MeteoblueController } from './controller';
import { MeteoblueRepository } from './repository';
import { MeteoblueService } from './service';

@Module({
  imports: [RateLimiterModule],
  controllers: [MeteoblueController],
  providers: [MeteoblueRepository, MeteoblueService],
  exports: [MeteoblueService],
})
export class MeteoblueModule {}
