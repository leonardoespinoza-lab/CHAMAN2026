import { Module } from '@nestjs/common';
import { RateLimiterModule } from '../../auxiliares/rate-limiter/rate-limiter.module';
import { MeteoblueController } from './controller';
import { MeteoblueRepository } from './repository';
import { MeteoblueService } from './service';
import { OpenMeteoModule } from '../../auxiliares/open-meteo/open-meteo.module';

@Module({
  imports: [RateLimiterModule, OpenMeteoModule],
  controllers: [MeteoblueController],
  providers: [MeteoblueRepository, MeteoblueService],
  exports: [MeteoblueService],
})
export class MeteoblueModule {}
