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
import {
  ICreateTenant,
  IAdministradorInicialTenant,
  IPermiso,
  IQueryParam,
  IUpdateTenant,
  IUsuario,
} from 'modelos/src';
import { GetPermiso } from '../../auxiliares/authorization/get-permiso.decorator';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { TenantsService } from './service';

@Controller('tenants')
@UseGuards(PermisoGuard)
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  get(@Query() query: IQueryParam) {
    return this.service.get(query);
  }

  @Get('actual')
  @Permisos(...PERMISOS_AUTENTICADOS)
  getCurrent(@GetPermiso() permiso: IPermiso) {
    return this.service.getCurrent(permiso);
  }

  @Get(':id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin', 'Lectura', 'Escritura'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  getById(@Param('id') id: string, @GetPermiso() permiso: IPermiso) {
    return this.service.getById(id, permiso);
  }

  @Post()
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  create(
    @Body() data: ICreateTenant,
    @GetPermiso() permiso: IPermiso,
    @GetUser() actor: IUsuario,
  ) {
    return this.service.create(data, permiso, actor);
  }

  @Put(':id')
  @Permisos(
    { nivel: 'Tenant', roles: ['Admin'] },
    { nivel: 'Admin', roles: ['Admin'] },
  )
  update(
    @Param('id') id: string,
    @Body() data: IUpdateTenant,
    @GetPermiso() permiso: IPermiso,
  ) {
    return this.service.update(id, data, permiso);
  }

  @Post(':id/provisionar')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  provisionar(
    @Param('id') id: string,
    @Body() data: IAdministradorInicialTenant,
    @GetPermiso() permiso: IPermiso,
    @GetUser() actor: IUsuario,
  ) {
    return this.service.provisionar(id, data, permiso, actor);
  }

  @Delete(':id')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  archive(@Param('id') id: string, @GetUser() actor: IUsuario) {
    return this.service.archive(id, actor);
  }
}
