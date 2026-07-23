import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EstablecimientosService } from './service';
import {
  IEstablecimiento,
  IListado,
  IQueryParam,
  ICreateEstablecimiento,
  IUpdateEstablecimiento,
  IPermiso,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Establecimientos')
@Controller('establecimientos')
@UseGuards(PermisoGuard)
export class EstablecimientosController {
  constructor(private service: EstablecimientosService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IEstablecimiento>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async create(
    @Body() body: ICreateEstablecimiento,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    return await this.service.create(body, permiso);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateEstablecimiento,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEstablecimiento> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IEstablecimiento> {
    return await this.service.delete(id, permiso, user);
  }
}
