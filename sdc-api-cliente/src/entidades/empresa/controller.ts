import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EmpresasService } from './service';
import { IEmpresa, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Empresaes')
@Controller('empresas')
@UseGuards(PermisoGuard)
export class EmpresasController {
  constructor(private service: EmpresasService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(@Query() query: IQueryParam): Promise<IListado<IEmpresa>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<IEmpresa> {
    return await this.service.getById(id);
  }

  @Get('/nombre/:nombre')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getByNombre(@Param('nombre') nombre: string): Promise<IEmpresa> {
    return await this.service.getByNombre(nombre);
  }
}
