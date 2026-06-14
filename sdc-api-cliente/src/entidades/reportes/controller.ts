import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './service';
import { IReporte, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';

@ApiTags('Reportes')
@Controller('reportes')
@UseGuards(PermisoGuard)
export class ReportesController {
  constructor(private service: ReportesService) {}

  @Get()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async get(@Query() query: IQueryParam): Promise<IListado<IReporte>> {
    return await this.service.get(query);
  }

  @Get('historico/:idDispositivo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async historico(
    @Param('idDispositivo') idDispositivo: string,
    @Query('dias') dias?: number,
    @Query('limit') limit?: number,
  ): Promise<IListado<IReporte>> {
    return await this.service.historico(idDispositivo, dias, limit);
  }

  @Get('diario/:idDispositivo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async diario(
    @Param('idDispositivo') idDispositivo: string,
    @Query('dias') dias?: number,
  ): Promise<IListado<IReporte>> {
    return await this.service.diario(dias, idDispositivo);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async getById(@Param('id') id: string): Promise<IReporte> {
    return await this.service.getById(id);
  }
}
