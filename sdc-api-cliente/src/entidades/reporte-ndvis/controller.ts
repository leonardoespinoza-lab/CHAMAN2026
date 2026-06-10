import {
  Controller,
  Delete,
  Get,
  Body,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReporteNDVIsService } from './service';
import {
  IReporteNDVI,
  IListado,
  IQueryParam,
  IPermiso,
  ICreateReporteNDVI,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('ReporteNDVIs')
@Controller('reportendvis')
@UseGuards(PermisoGuard)
export class ReporteNDVIsController {
  constructor(private service: ReporteNDVIsService) {}

  @Get()
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IReporteNDVI>> {
    return await this.service.get(query, permiso);
  }

  @Get('lastByLote')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getLastByLote(
    @GetPermiso() permiso: IPermiso,
  ): Promise<IReporteNDVI[]> {
    return await this.service.getLastByLote(permiso);
  }

  @Get('lastByLoteByDistribuidor')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getLastByLoteByDistribuidor(
    @GetPermiso() permiso: IPermiso,
  ): Promise<IReporteNDVI[]> {
    return await this.service.getLastByLoteByIdDistribuidor(permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IReporteNDVI> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
  )
  public async create(@Body() body: ICreateReporteNDVI): Promise<IReporteNDVI> {
    return await this.service.create(body);
  }

  // @Put('/:id')
  // @Permisos(
  //   { nivel: 'Quimica', roles: ['Admin'] },
  //   { nivel: 'Distribuidor', roles: ['Admin'] },
  //   { nivel: 'Productor', roles: ['Admin'] },
  // )
  // public async update(
  //   @Param('id') id: string,
  //   @Body() body: IUpdateReporteNDVI,
  // ): Promise<IReporteNDVI> {
  //   return await this.service.update(id, body);
  // }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IReporteNDVI> {
    return await this.service.delete(id, permiso);
  }
}
