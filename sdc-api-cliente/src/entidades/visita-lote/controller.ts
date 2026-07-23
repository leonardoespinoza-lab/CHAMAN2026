import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ICreateVisitaLote,
  IListado,
  IPermiso,
  IUpdateVisitaLote,
  IUsuario,
  IVisitaLote,
} from 'modelos/src';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { VisitasLoteService } from './service';

const LECTURA = [
  { nivel: 'Admin', roles: ['Admin'] },
  { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
  { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
  { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
  { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
  { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
] as any;
const ESCRITURA = [
  { nivel: 'Admin', roles: ['Admin'] },
  { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
  { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
  { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
  { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
  { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
] as any;

@ApiTags('Visitas de lote')
@Controller('visitas-lote')
@UseGuards(PermisoGuard)
export class VisitasLoteController {
  constructor(private service: VisitasLoteService) {}

  @Get('lote/:idLote')
  @Permisos(...LECTURA)
  async getByLote(
    @Param('idLote') idLote: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IVisitaLote>> {
    return await this.service.getByLote(idLote, permiso);
  }

  @Get(':id')
  @Permisos(...LECTURA)
  async getById(@Param('id') id: string, @GetPermiso() permiso: IPermiso) {
    return await this.service.getById(id, permiso);
  }

  @Post()
  @Permisos(...ESCRITURA)
  async create(
    @Body() data: ICreateVisitaLote,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.create(data, permiso, user);
  }

  @Put(':id')
  @Permisos(...ESCRITURA)
  async update(
    @Param('id') id: string,
    @Body() data: IUpdateVisitaLote,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.update(id, data, permiso, user);
  }

  @Delete(':id')
  @Permisos(...ESCRITURA)
  async archive(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.archive(id, permiso, user);
  }
}
