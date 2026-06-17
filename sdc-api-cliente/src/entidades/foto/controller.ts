import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FotosService } from './service';
import { IListado, IQueryParam, IPermiso, IFoto } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Fotos')
@Controller('fotos')
@UseGuards(PermisoGuard)
export class FotosController {
  constructor(private service: FotosService) {}

  @Get('imagen')
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getImage(@Query('url') url: string): Promise<any> {
    return await this.service.getImagen(url);
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
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getByLoteId(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    return await this.service.getByIdLote(id, permiso);
  }

  @Get('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.getById(id, permiso);
  }

  @Delete('/:id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async delete(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IFoto> {
    return await this.service.delete(id, permiso);
  }
}
