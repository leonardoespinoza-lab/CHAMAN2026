import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ICreateLorawanUplink, IQueryParam } from 'modelos/src';
import { LorawanUplinksService } from './service';

@ApiTags('Lorawan Uplinks')
@Controller('lorawan/uplinks')
export class LorawanUplinksController {
  constructor(private readonly service: LorawanUplinksService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get('latest')
  async latest(
    @Query('devEUI') devEUI?: string,
    @Query('applicationID') applicationID?: string,
    @Query('gatewayID') gatewayID?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.service.latest({
      devEUI,
      applicationID,
      gatewayID,
      limit,
    });
  }

  @Get('latest-devices')
  async latestByDevice(@Query('limit') limit?: string) {
    return await this.service.latestByDevice(limit);
  }

  @Post('reprocess')
  async reprocess(
    @Body()
    body: {
      devEUI?: string;
      limit?: string | number;
      replace?: boolean | string;
    },
    @Query('devEUI') devEUI?: string,
    @Query('limit') limit?: string,
    @Query('replace') replace?: string,
  ) {
    return await this.service.reprocess({
      devEUI: devEUI || body?.devEUI,
      limit: limit || body?.limit,
      replace: replace || body?.replace,
    });
  }

  @Post()
  async create(@Body() data: ICreateLorawanUplink) {
    return await this.service.create(data);
  }
}
