import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EstacionsService } from './service';
import { IEstacion, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';

@ApiTags('Estacions')
@Controller('estacions')
@UseGuards(PermisoGuard)
export class EstacionsController {
  constructor(private service: EstacionsService) {}

  @Get()
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getFiltered(
    @Query() query: IQueryParam,
  ): Promise<IListado<IEstacion>> {
    return this.sanitizeListado(await this.service.getFiltered(query));
  }

  @Get('suelo')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getSueloFiltered(
    @Query() query: IQueryParam,
  ): Promise<IListado<IEstacion>> {
    return this.sanitizeListado(await this.service.getSueloFiltered(query));
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(@Param('id') id: string): Promise<IEstacion> {
    return this.sanitize(await this.service.getById(id));
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
