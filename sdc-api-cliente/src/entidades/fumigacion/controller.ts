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
import { FumigacionsService } from './service';
import {
  IFumigacion,
  IListado,
  IQueryParam,
  ICreateFumigacion,
  IUpdateFumigacion,
  IUsuario,
  IPermiso,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('Fumigaciones')
@Controller('fumigacions')
@UseGuards(PermisoGuard)
export class FumigacionsController {
  constructor(private service: FumigacionsService) {}

  @Get()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Lectura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFumigacion>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Lectura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFumigacion> {
    return await this.service.getById(id, permiso);
  }

  @Get('idSiembra/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Lectura'] },
  )
  public async getByIdSiembra(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFumigacion>> {
    return await this.service.getByIdSiembra(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async create(
    @Body() body: ICreateFumigacion,
    @GetUser() user: IUsuario,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFumigacion> {
    return await this.service.create(body, user, permiso);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateFumigacion,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFumigacion> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFumigacion> {
    return await this.service.delete(id, permiso);
  }
}
