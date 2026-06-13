import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LorawanUplinksService } from './service';

@ApiTags('Lorawan Uplinks')
@Controller('lorawan/uplinks')
export class LorawanUplinksController {
  constructor(private readonly service: LorawanUplinksService) {}

  @Get('latest')
  async latest(
    @Query('devEUI') devEUI?: string,
    @Query('applicationID') applicationID?: string,
    @Query('gatewayID') gatewayID?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.service.latest({ devEUI, applicationID, gatewayID, limit });
  }
}
