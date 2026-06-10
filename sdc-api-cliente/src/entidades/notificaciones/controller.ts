import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IQueryParam, IUpdateNotificacion, IUsuario } from 'modelos/src';
import { NotificacionesService } from './service';
import { GetUser } from 'src/auxiliares/authorization/get-token.decorator';

@ApiTags('Notificaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private service: NotificacionesService) {}

  @Get()
  async getFiltered(@Query() query: IQueryParam, @GetUser() user: IUsuario) {
    return await this.service.getFiltered(query, user);
  }

  @Get('/:id')
  async getById(@Param('id') id: string, @GetUser() user: IUsuario) {
    return await this.service.getById(id, user);
  }

  @Put('/marcarLeidos')
  public async marcarLeidos(@GetUser() user: IUsuario) {
    return await this.service.marcarLeidos(user);
  }

  @Put('/:id')
  public async update(
    @Param('id') id: string,
    @Body() body: IUpdateNotificacion,
    @GetUser() user: IUsuario,
  ) {
    return await this.service.update(id, body, user);
  }
}
