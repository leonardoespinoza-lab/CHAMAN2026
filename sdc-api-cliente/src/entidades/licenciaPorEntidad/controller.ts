import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IAsignarLicenciaEntidad,
  IEstadoLicenciaEntidad,
  ILicenciaPorEntidad,
  IListado,
  IPermiso,
  IQueryParam,
  IUsuario,
  TipoEntidadLicencia,
} from 'modelos/src';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { LicenciaPorEntidadsService } from './service';

@ApiTags('Licencias por entidad')
@Controller('licenciaporentidads')
@UseGuards(PermisoGuard)
export class LicenciaPorEntidadsController {
  constructor(private service: LicenciaPorEntidadsService) {}

  @Get('/actual')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async actual(
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEstadoLicenciaEntidad> {
    return await this.service.getEstadoActualPorPermiso(permiso);
  }

  @Get('/entidad/:tipo/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getEstadoEntidad(
    @Param('tipo') tipo: TipoEntidadLicencia,
    @Param('id') id: string,
  ): Promise<IEstadoLicenciaEntidad> {
    return await this.service.getEstadoPorEntidad(tipo, id);
  }

  @Put('/entidad/:tipo/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async asignar(
    @Param('tipo') tipo: TipoEntidadLicencia,
    @Param('id') id: string,
    @Body() body: IAsignarLicenciaEntidad,
    @GetUser() user: IUsuario,
  ): Promise<IEstadoLicenciaEntidad> {
    return await this.service.asignar(id, { ...body, tipoEntidad: tipo }, user);
  }

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user: IUsuario,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    return await this.service.get(query, user);
  }
}
