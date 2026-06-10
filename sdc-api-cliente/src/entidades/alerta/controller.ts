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
import { AlertasService } from './service';
import {
  IAlerta,
  IListado,
  IQueryParam,
  ICreateAlerta,
  IUpdateAlerta,
  IUsuario,
  IPermiso,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('Alertaes')
@Controller('alertas')
@UseGuards(PermisoGuard)
export class AlertasController {
  constructor(private service: AlertasService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IAlerta>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IAlerta> {
    return await this.service.getById(id, permiso);
  }

  @Get('idSiembra/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getByIdSiembra(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IAlerta>> {
    return await this.service.getByIdSiembra(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async create(@Body() body: ICreateAlerta): Promise<IAlerta> {
    return await this.service.create(body);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateAlerta,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IAlerta> {
    return await this.service.update(id, body, permiso);
  }

  @Put('cambiarEstado/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async cambiarEstado(
    @Param('id') id: string,
    @Body() body: { estado: IUpdateAlerta; activa: boolean },
    @GetUser() user: IUsuario,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IAlerta> {
    return await this.service.cambiarEstado(id, body, user, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IAlerta> {
    return await this.service.delete(id, permiso);
  }
}
