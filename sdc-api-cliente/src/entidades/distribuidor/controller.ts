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
import { DistribuidorsService } from './service';
import {
  IDistribuidor,
  IListado,
  IQueryParam,
  ICreateDistribuidor,
  IUpdateDistribuidor,
  IPermiso,
  IUsuario,
  ILicencia,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { GetLicencia } from 'src/auxiliares/authorization/get-licencia.decorator';

@ApiTags('Distribuidors')
@Controller('distribuidors')
@UseGuards(PermisoGuard)
export class DistribuidorsController {
  constructor(private service: DistribuidorsService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IDistribuidor>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IDistribuidor> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async create(
    @Body() body: ICreateDistribuidor,
    @GetPermiso() permiso: IPermiso,
    @GetLicencia() licencia: ILicencia,
  ): Promise<IDistribuidor> {
    return await this.service.create(body, permiso, licencia);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateDistribuidor,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IDistribuidor> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IDistribuidor> {
    return await this.service.delete(id, permiso, user);
  }
}
