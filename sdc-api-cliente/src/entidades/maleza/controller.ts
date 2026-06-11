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
import { ApiTags } from '@nestjs/swagger';
import {
  ICreateMaleza,
  IListado,
  IMaleza,
  IQueryParam,
  IUpdateMaleza,
} from 'modelos/src';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { MalezasService } from './service';

@ApiTags('Malezas')
@Controller('malezas')
@UseGuards(PermisoGuard)
export class MalezasController {
  constructor(private service: MalezasService) {}

  @Get()
  public async get(@Query() query: IQueryParam): Promise<IListado<IMaleza>> {
    return await this.service.get(query);
  }

  @Get('/:id')
  public async getById(@Param('id') id: string): Promise<IMaleza> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(@Body() body: ICreateMaleza): Promise<IMaleza> {
    return await this.service.create(body);
  }

  @Post('/bulk')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async bulk(@Body() body: ICreateMaleza[]): Promise<void> {
    return await this.service.bulk(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateMaleza,
  ): Promise<IMaleza> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(@Param('id') id: string): Promise<IMaleza> {
    return await this.service.delete(id);
  }
}
