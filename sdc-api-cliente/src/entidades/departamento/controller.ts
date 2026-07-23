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
import { DepartamentosService } from './service';
import {
  IDepartamento,
  ICreateDepartamento,
  IListado,
  IQueryParam,
  IUpdateDepartamento,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Departamentos')
@Controller('departamentos')
@UseGuards(PermisoGuard)
export class DepartamentosController {
  constructor(private service: DepartamentosService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(
    @Query() query: IQueryParam,
  ): Promise<IListado<IDepartamento>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<IDepartamento> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(
    @Body() body: ICreateDepartamento,
  ): Promise<IDepartamento> {
    return await this.service.create(body);
  }

  @Post('/bulk')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async bulk(@Body() body: ICreateDepartamento[]): Promise<void> {
    return await this.service.bulk(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateDepartamento,
  ): Promise<IDepartamento> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string): Promise<IDepartamento> {
    return await this.service.delete(id);
  }
}
