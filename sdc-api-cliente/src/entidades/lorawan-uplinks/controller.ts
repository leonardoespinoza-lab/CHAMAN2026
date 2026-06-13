import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { LorawanUplinksService } from './service';

@ApiTags('Lorawan Uplinks')
@Controller('lorawan/uplinks')
@UseGuards(PermisoGuard)
export class LorawanUplinksController {
  constructor(private readonly service: LorawanUplinksService) {}

  @Get('latest')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async latest(
    @Query('devEUI') devEUI?: string,
    @Query('applicationID') applicationID?: string,
    @Query('gatewayID') gatewayID?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.service.latest({ devEUI, applicationID, gatewayID, limit });
  }
}
