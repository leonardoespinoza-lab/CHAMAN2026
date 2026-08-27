import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IChamanMeteoCoverage,
  IChamanMeteoDaily,
  IChamanMeteoGridPoint,
  IChamanMeteoHourlyDerived,
  IChamanMeteoHourlyRaw,
  IChamanMeteoImportJob,
} from 'modelos/src';
import { ChamanMeteoStorageGuard } from './guard';
import { ChamanMeteoService } from './service';

@ApiTags('Chaman-Meteo storage')
@Controller('chaman-meteo-internal')
@UseGuards(ChamanMeteoStorageGuard)
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

  @Get('coverage/:gridPointKey')
  coverage(@Param('gridPointKey') gridPointKey: string) {
    return this.service.coverage(gridPointKey);
  }

  @Post('grid-points/upsert')
  upsertGridPoint(@Body() data: IChamanMeteoGridPoint): Promise<any> {
    return this.service.upsertGridPoint(data);
  }

  @Post('hourly/raw/upsert-many')
  upsertHourlyRaw(@Body() data: IChamanMeteoHourlyRaw[]): Promise<any> {
    return this.service.upsertHourlyRaw(data);
  }

  @Post('hourly/derived/upsert-many')
  upsertHourlyDerived(@Body() data: IChamanMeteoHourlyDerived[]): Promise<any> {
    return this.service.upsertHourlyDerived(data);
  }

  @Post('daily/upsert-many')
  upsertDaily(@Body() data: IChamanMeteoDaily[]): Promise<any> {
    return this.service.upsertDaily(data);
  }

  @Post('jobs/upsert')
  upsertJob(@Body() data: IChamanMeteoImportJob): Promise<any> {
    return this.service.upsertJob(data);
  }

  @Put('coverage/:gridPointKey')
  upsertCoverage(
    @Param('gridPointKey') gridPointKey: string,
    @Body() data: Partial<IChamanMeteoCoverage>,
  ): Promise<any> {
    return this.service.upsertCoverage(gridPointKey, data);
  }

  @Post('coverage/:gridPointKey/recalculate')
  recalculateCoverage(
    @Param('gridPointKey') gridPointKey: string,
  ): Promise<any> {
    return this.service.recalculateCoverage(gridPointKey);
  }
}
