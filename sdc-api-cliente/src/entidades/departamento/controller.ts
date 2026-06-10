import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DepartamentosService } from './service';
import { IDepartamento, IListado, IQueryParam } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';

@ApiTags('Departamentos')
@Controller('departamentos')
@UseGuards(PermisoGuard)
export class DepartamentosController {
  constructor(private service: DepartamentosService) {}

  @Get()
  public async get(
    @Query() query: IQueryParam,
  ): Promise<IListado<IDepartamento>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<IDepartamento> {
    return await this.service.getById(id);
  }
}
