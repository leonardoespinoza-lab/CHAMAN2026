import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ILicenciaPorEntidad, IListado, IQueryParam, IUsuario } from 'modelos/src';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { LicenciaPorEntidadsService } from './service';

@ApiTags('Licencias por entidad')
@Controller('licenciaporentidads')
@UseGuards(PermisoGuard)
export class LicenciaPorEntidadsController {
  constructor(private service: LicenciaPorEntidadsService) {}

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  public async get(
    @Query() query: IQueryParam,
    @GetUser() user: IUsuario,
  ): Promise<IListado<ILicenciaPorEntidad>> {
    return await this.service.get(query, user);
  }
}
