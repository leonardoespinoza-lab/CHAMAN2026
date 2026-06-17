import {
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { PrediccionsService } from './service';
import { IPrediccion, IListado, IQueryParam, IPermiso } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Prediccions')
@Controller('prediccions')
@UseGuards(PermisoGuard)
export class PrediccionsController {
  constructor(private service: PrediccionsService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async get(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IListado<IPrediccion>> {
    return await this.service.get(query, permiso);
  }

  @Get('/export')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async export(
    @Query() query: IQueryParam,
    @GetPermiso() permiso: IPermiso,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.service.export(query, permiso));
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async getById(
    @Param('id') id: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<IPrediccion> {
    return await this.service.getById(id, permiso);
  }
}
