import {
  Controller,
  Delete,
  Body,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FotosService } from './service';
import { IListado, IQueryParam, IPermiso, IFoto, IUpdateFoto, IUsuario } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';

@ApiTags('Fotos')
@Controller('fotos')
@UseGuards(PermisoGuard)
export class FotosController {
  constructor(private service: FotosService) {}

  @Get('imagen')
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getImage(
    @Query('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<any> {
    return await this.service.getImagen(id, permiso);
  }

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    return await this.service.get(query, permiso);
  }

  @Get('lote/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async getByLoteId(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    return await this.service.getByIdLote(id, permiso);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.getById(id, permiso);
  }

  @Post('campo/upload')
  @Permisos(
    { nivel: 'Admin', roles: ['Admin'] },
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
  )
  @UseInterceptors(
    FilesInterceptor('images', 8, {
      limits: { fileSize: 12 * 1024 * 1024, files: 8 },
    }),
  )
  public async uploadCampo(
    @UploadedFiles() files: any[],
    @Body() body: Record<string, any>,
    @GetPermiso() permiso: IPermiso,
    @GetUser() user: IUsuario,
  ): Promise<IFoto[]> {
    return await this.service.uploadCampo(files, body, permiso, user);
  }

  @Put('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateFoto,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.update(id, body, permiso);
  }

  @Delete('/:id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Escritura'] },
    { nivel: 'Quimica', roles: ['Admin', 'Escritura'] },
    { nivel: 'Productor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Establecimiento', roles: ['Admin', 'Escritura'] },
    { nivel: 'Asesor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Distribuidor', roles: ['Admin', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.delete(id, permiso);
  }
}
