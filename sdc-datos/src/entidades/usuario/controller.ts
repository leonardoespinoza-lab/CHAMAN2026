import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { UsuariosService } from './service';
import { ICreateUsuario, IQueryParam, ISolicitudArchivado, IUpdateUsuario } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Usuarios')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  async getFilter(@Query() query: IQueryParam) {
    return await this.service.getFilter(query);
  }

  @Get('email/:email')
  async getByEmail(@Param('email') email: string) {
    return await this.service.getByEmail(email);
  }

  @Get('usuario/:usuario')
  async getByUserName(@Param('usuario') usuario: string) {
    return await this.service.getByUsername(usuario);
  }

  @Get('usuario/login/:usuario')
  async getByUserNameForLogin(@Param('usuario') usuario: string) {
    return await this.service.getForLogin(usuario);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }

  @Post()
  async create(@Body() data: ICreateUsuario) {
    return await this.service.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: IUpdateUsuario) {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Query() audit: ISolicitudArchivado) {
    return await this.service.delete(id, audit);
  }
}
