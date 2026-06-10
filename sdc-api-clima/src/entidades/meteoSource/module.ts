import { Module } from '@nestjs/common';
import { MeteoSourceService } from './service';
import { MeteoSourceController } from './controller';
import { AxiosModule } from '../../auxiliares/axios/axios.module';
import { MeteoSourceRepository } from './repository';
import { RateLimiterModule } from '../../auxiliares/rate-limiter/rate-limiter.module';

@Module({
  imports: [AxiosModule, RateLimiterModule],
  controllers: [MeteoSourceController],
  providers: [MeteoSourceService, MeteoSourceRepository],
  exports: [MeteoSourceService],
})
export class MeteoSourceModule {}
