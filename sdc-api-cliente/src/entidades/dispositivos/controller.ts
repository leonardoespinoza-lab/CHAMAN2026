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
import { DispositivosService } from './service';
import {
  IDispositivo,
  IListado,
  IQueryParam,
  ICreateDispositivo,
  IUpdateDispositivo,
  IUsuario,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';

@ApiTags('Dispositivos')
@Controller('dispositivos')
@UseGuards(PermisoGuard)
export class DispositivosController {
  constructor(private service: DispositivosService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user: IUsuario,
  ): Promise<IListado<IDispositivo>> {
    return await this.service.get(query, user);
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura', 'Lectura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetUser() user: IUsuario,
  ): Promise<IDispositivo> {
    return await this.service.getById(id, user);
  }

  @Post()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async create(@Body() body: ICreateDispositivo): Promise<IDispositivo> {
    return await this.service.create(body);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateDispositivo,
  ): Promise<IDispositivo> {
    return await this.service.update(id, body);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin'] },
    { nivel: 'Distribuidor', roles: ['Admin'] },
    { nivel: 'Productor', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(@Param('id') id: string): Promise<IDispositivo> {
    return await this.service.delete(id);
  }
}
