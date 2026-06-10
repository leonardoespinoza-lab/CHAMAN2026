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
import { QuimicasService } from './service';
import {
  IQuimica,
  IListado,
  IQueryParam,
  ICreateQuimica,
  IUpdateQuimica,
  IPermiso,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('Quimicas')
@Controller('quimicas')
@UseGuards(PermisoGuard)
export class QuimicasController {
  constructor(private service: QuimicasService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IQuimica>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IQuimica> {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async create(@Body() body: ICreateQuimica): Promise<IQuimica> {
    return await this.service.create(body);
  }

  @Put('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateQuimica,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IQuimica> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IQuimica> {
    return await this.service.delete(id, permiso);
  }
}
