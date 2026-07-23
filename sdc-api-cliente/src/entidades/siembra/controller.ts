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
import { SiembrasService } from './service';
import {
  ISiembra,
  IListado,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
  IPermiso,
  IPrediccion,
  IResultadoPrediccionMalezas,
  IRegistroFenologico,
  IRespuestaAgrometeorologiaSiembra,
} from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';

@ApiTags('Siembras')
@Controller('siembras')
@UseGuards(PermisoGuard)
export class SiembrasController {
  constructor(private service: SiembrasService) {}

  @Get()
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<ISiembra>> {
    return await this.service.get(query, permiso);
  }

  @Get('/:id/huella-hidrica/seguimiento')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async seguimientoHuellaHidrica(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<any> {
    return await this.service.seguimientoHuellaHidrica(id, permiso);
  }

  @Get('/:id/agrometeorologia')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async agrometeorologia(
    @Param('id') id: string,
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    return await this.service.agrometeorologia(id, desde, hasta, permiso);
  }

  @Post('/:id/agrometeorologia/reprocesar')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async reprocesarAgrometeorologia(
    @Param('id') id: string,
    @Body() body: { sincronizarClima?: boolean } | undefined,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    return await this.service.reprocesarAgrometeorologia(
      id,
      body?.sincronizarClima === true,
      permiso,
    );
  }

  @Get('/:id')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
  )
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.getById(id, permiso);
  }

  @Post('/:id/prediccion-enfermedades')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async generarPrediccionEnfermedades(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IPrediccion[]> {
    return await this.service.generarPrediccionEnfermedades(id, permiso);
  }

  @Post('/:id/prediccion-malezas')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async prediccionMalezas(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IResultadoPrediccionMalezas> {
    return await this.service.prediccionMalezas(id, permiso);
  }

  @Put('/:id/registro-fenologico')
  @Permisos(
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
  )
  public async registrarEtapaFenologica(
    @Param('id') id: string,
    @Body() body: IRegistroFenologico,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.registrarEtapaFenologica(id, body, permiso);
  }

  @Post()
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async create(
    @Body() body: ICreateSiembra,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.create(body, permiso);
  }

  @Put('cosechar/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async cosechar(
    @Param('id') id: string,
    @Body() body: IUpdateSiembra,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.cosechar(id, body, permiso);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateSiembra,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<ISiembra> {
    return await this.service.delete(id, permiso);
  }
}
