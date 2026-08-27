import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChamanMeteoInternalGuard } from './guard';
import { ChamanMeteoService } from './service';

@ApiTags('Chaman-Meteo')
@Controller('chaman-meteo')
@UseGuards(ChamanMeteoInternalGuard)
export class ChamanMeteoController {
  constructor(private readonly service: ChamanMeteoService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('grid-points')
  gridPoints(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.gridPoints(limit, offset);
  }

  @Get('jobs')
  jobs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.jobs(limit, offset);
  }

  @Get('hourly')
  hourly(
    @Query('gridPointKey') gridPointKey?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.hourly(gridPointKey, limit, offset);
  }

  @Get('daily')
  daily(
    @Query('gridPointKey') gridPointKey?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.daily(gridPointKey, limit, offset);
  }
}
