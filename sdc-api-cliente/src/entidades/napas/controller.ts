import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  INapaReferenciaLote,
  INapaSeguimientoLote,
  IPermiso,
} from 'modelos/src';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { NapasService } from './service';

@ApiTags('Napas')
@Controller('napas')
@UseGuards(PermisoGuard)
export class NapasController {
  constructor(private service: NapasService) {}

  @Get('lotes/:idLote')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async seguimientoLote(
    @Param('idLote') idLote: string,
    @GetPermiso() permiso: IPermiso,
  ): Promise<INapaSeguimientoLote> {
    return await this.service.seguimientoLote(idLote, permiso);
  }

  @Get('referencia')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async referenciaTerritorial(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radioKm') radioKm = '80',
  ): Promise<INapaReferenciaLote> {
    const latitud = Number(lat);
    const longitud = Number(lng);
    const radio = Number(radioKm);

    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
      throw new BadRequestException('Coordenadas invalidas');
    }

    return await this.service.referenciaTerritorial(latitud, longitud, radio);
  }
}
