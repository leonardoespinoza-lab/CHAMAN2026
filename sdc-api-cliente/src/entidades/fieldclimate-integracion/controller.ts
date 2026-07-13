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
  IEstablecimiento,
  IEstacion,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { FieldClimateIntegracionService } from './service';

@ApiTags('FieldClimate Integraciones')
@Controller('fieldclimate-integraciones')
@UseGuards(PermisoGuard)
export class FieldClimateIntegracionController {
  constructor(private service: FieldClimateIntegracionService) {}

  @Post('descubrir')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async descubrir(@Body() body: any): Promise<any[]> {
    return await this.service.descubrir(body);
  }

  @Post('importar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async importar(@Body() body: any): Promise<IEstacion> {
    return await this.service.importar(body);
  }

  @Get('centrales')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async listar(@Query() query: IQueryParam): Promise<IListado<IEstacion>> {
    return await this.service.listar(query);
  }

  @Get('establecimientos')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async listarEstablecimientos(
    @Query() query: IQueryParam,
  ): Promise<IListado<IEstablecimiento>> {
    return await this.service.listarEstablecimientos(query);
  }

  @Put('centrales/:id/asignar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async asignar(
    @Param('id') id: string,
    @Body() body: { idEstablecimiento: string },
  ): Promise<IEstacion> {
    return await this.service.asignar(id, body);
  }

  @Post('centrales/:id/sincronizar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  async sincronizar(@Param('id') id: string): Promise<IEstacion> {
    return await this.service.sincronizar(id);
  }
}
