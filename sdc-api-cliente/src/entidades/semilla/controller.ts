import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SemillasService } from './service';
import { ISemilla, IListado, IQueryParam, ICreateSemilla, IUpdateSemilla } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Semillas')
@Controller('semillas')
@UseGuards(PermisoGuard)
export class SemillasController {
  constructor(private service: SemillasService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(@Query() query: IQueryParam): Promise<IListado<ISemilla>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(@Param('id') id: string): Promise<ISemilla> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(@Body() body: ICreateSemilla): Promise<ISemilla> {
    return await this.service.create(body);
  }

  @Post('/bulk')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async bulk(@Body() body: ICreateSemilla[]): Promise<void> {
    return await this.service.bulk(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateSemilla,
  ): Promise<ISemilla> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string): Promise<ISemilla> {
    return await this.service.delete(id);
  }
}
