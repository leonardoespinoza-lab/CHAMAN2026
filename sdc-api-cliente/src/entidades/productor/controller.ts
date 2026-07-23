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
import { ProductorsService } from './service';
import {
  IProductor,
  IListado,
  IQueryParam,
  ICreateProductor,
  IUpdateProductor,
  IPermiso,
  ILicencia,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { GetLicencia } from '../../auxiliares/authorization/get-licencia.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Productors')
@Controller('productors')
@UseGuards(PermisoGuard)
export class ProductorsController {
  constructor(private service: ProductorsService) {}

  @Get()
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IProductor>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IProductor> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async create(
    @Body() body: ICreateProductor,
    @GetPermiso() permiso: IPermiso,
    @GetLicencia() licencia: ILicencia,
  ): Promise<IProductor> {
    return await this.service.create(body, permiso, licencia);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateProductor,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IProductor> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IProductor> {
    return await this.service.delete(id, permiso, user);
  }
}
