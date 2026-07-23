import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EstacionsService } from './service';
import { IEstacion, IListado, IPermiso, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('Estacions')
@Controller('estacions')
@UseGuards(PermisoGuard)
export class EstacionsController {
  constructor(private service: EstacionsService) {}

  @Get()
  @Permisos(
    { nivel: 'Admin', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getFiltered(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IEstacion>> {
    return this.sanitizeListado(await this.service.getFiltered(query, permiso));
  }

  @Get('suelo')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getSueloFiltered(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IEstacion>> {
    return this.sanitizeListado(
      await this.service.getSueloFiltered(query, permiso),
    );
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IEstacion> {
    return this.sanitize(await this.service.getById(id, permiso));
  }

  private sanitizeListado(data: IListado<IEstacion>): IListado<IEstacion> {
    return {
      ...data,
      datos: (data?.datos || []).map((item) => this.sanitize(item)),
    };
  }

  private sanitize(data: IEstacion): IEstacion {
    if (!data) return data;
    return {
      ...data,
      user: undefined,
      pass: undefined,
      apikey: undefined,
    };
  }
}
