import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IPermiso, IUsuario } from 'modelos/src';
import { GetPermiso } from '../auxiliares/authorization/get-permiso.decorator';
import { GetUser } from '../auxiliares/authorization/get-token.decorator';
import { Permisos } from '../auxiliares/authorization/permiso.decorator';
import { PermisoGuard } from '../auxiliares/authorization/permiso.guard';
import { IntegrationAdminService } from './admin.service';

@Controller('admin/integraciones')
@UseGuards(PermisoGuard)
export class IntegrationAdminController {
  constructor(private readonly service: IntegrationAdminService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  list(@GetPermiso() p: IPermiso, @GetUser() u: IUsuario) {
    this.service.assertAdmin(p, u);
    return this.service.list();
  }
  @Get('operador')
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  operator(
    @Query('username') name: string,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.operator(name);
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  create(
    @Body() b: unknown,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.create(b, u._id);
  }
  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  update(
    @Param('id') id: string,
    @Body() b: unknown,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.update(id, b, u._id);
  }
  @Post(':id/claves')
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  issue(
    @Param('id') id: string,
    @Body('revision') revision: number,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.issueKey(id, revision, u._id);
  }
  @Post(':id/claves/:keyId/revocar')
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  revoke(
    @Param('id') id: string,
    @Param('keyId') keyId: string,
    @Body('revision') revision: number,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.revokeKey(id, keyId, revision, u._id);
  }
  @Get(':id/consumo')
  @Header('Cache-Control', 'no-store')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  usage(
    @Param('id') id: string,
    @Query('days') days: string,
    @GetPermiso() p: IPermiso,
    @GetUser() u: IUsuario,
  ) {
    this.service.assertAdmin(p, u);
    return this.service.usage(id, days || '30');
  }
}
