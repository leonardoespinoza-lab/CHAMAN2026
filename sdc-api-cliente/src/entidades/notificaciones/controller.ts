import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IQueryParam, IUpdateNotificacion, IUsuario } from 'modelos/src';
import { NotificacionesService } from './service';
import { GetUser } from 'src/auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('Notificaciones')
@Controller('notificaciones')
@UseGuards(PermisoGuard)
export class NotificacionesController {
  constructor(private service: NotificacionesService) {}

  @Get()
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getFiltered(@Query() query: IQueryParam, @GetUser() user: IUsuario) {
    return await this.service.getFiltered(query, user);
  }

  @Get('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  async getById(@Param('id') id: string, @GetUser() user: IUsuario) {
    return await this.service.getById(id, user);
  }

  @Put('/marcarLeidos')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async marcarLeidos(@GetUser() user: IUsuario) {
    return await this.service.marcarLeidos(user);
  }

  @Put('/:id')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateNotificacion,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.update(id, body, user);
  }
}
