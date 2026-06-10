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
import { ApikeysService } from './service';
import {
  IApikey,
  IListado,
  IQueryParam,
  ICreateApikey,
  IUpdateApikey,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';

@ApiTags('Apikeys')
@Controller('apikeys')
@UseGuards(PermisoGuard)
export class ApikeysController {
  constructor(private service: ApikeysService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user: IUsuario,
  ): Promise<IListado<IApikey>> {
    return await this.service.get(query, user);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Establecimiento', roles: ['Admin'] },
  )
  public async getById(@Param('id') id: string): Promise<IApikey> {
    return await this.service.getById(id);
  }

  @Post()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
  )
  public async create(@Body() body: ICreateApikey): Promise<IApikey> {
    return await this.service.create(body);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateApikey,
  ): Promise<IApikey> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
  )
  public async delete(@Param('id') id: string): Promise<IApikey> {
    return await this.service.delete(id);
  }
}
