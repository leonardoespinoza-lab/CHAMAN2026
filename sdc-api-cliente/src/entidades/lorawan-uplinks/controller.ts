import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IUsuario } from 'modelos/src';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
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
    return await this.service.latest({
      devEUI,
      applicationID,
      gatewayID,
      limit,
    });
  }

  @Get('latest-devices')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async latestByDevice(@Query('limit') limit?: string) {
    return await this.service.latestByDevice(limit);
  }

  @Get('raw-history/:devEUI')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  )
  async rawHistory(
    @Param('devEUI') devEUI: string,
    @Query('days') days: string | undefined,
    @Query('limit') limit: string | undefined,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.rawHistory(devEUI, days, limit, user);
  }

  @Post('reprocess')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async reprocess(
    @Query('devEUI') devEUI?: string,
    @Query('limit') limit?: string,
    @Query('replace') replace?: string,
    @Body()
    body?: {
      devEUI?: string;
      limit?: string | number;
      replace?: string | boolean;
    },
  ) {
    return await this.service.reprocess({
      devEUI: devEUI || body?.devEUI,
      limit: limit || body?.limit,
      replace: replace || body?.replace,
    });
  }
}
