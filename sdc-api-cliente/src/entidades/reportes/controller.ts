import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './service';
import { IReporte, IListado, IQueryParam, IUsuario } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Reportes')
@Controller('reportes')
@UseGuards(PermisoGuard)
export class ReportesController {
  constructor(private service: ReportesService) {}

  @Get()
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user?: IUsuario,
  ): Promise<IListado<IReporte>> {
    return await this.service.get(query, user);
  }

  @Get('historico/:idDispositivo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  )
  public async historico(
    @Param('idDispositivo') idDispositivo: string,
    @Query('dias') dias?: number,
    @Query('limit') limit?: number,
    @GetUser() user?: IUsuario,
  ): Promise<IListado<IReporte>> {
    return await this.service.historico(idDispositivo, dias, limit, user);
  }

  @Get('diario/:idDispositivo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  )
  public async diario(
    @Param('idDispositivo') idDispositivo: string,
    @Query('dias') dias?: number,
    @GetUser() user?: IUsuario,
  ): Promise<IListado<IReporte>> {
    return await this.service.diario(dias, idDispositivo, user);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura', 'Lectura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetUser() user?: IUsuario,
  ): Promise<IReporte> {
    return await this.service.getById(id, user);
  }
}
