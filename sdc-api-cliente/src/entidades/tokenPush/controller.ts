import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TokenPushsService } from './service';
import { ITokenPush, IUsuario, ICreateTokenPush } from 'modelos/src';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';

@ApiTags('TokenPushs')
@Controller('tokenpushs')
@UseGuards(PermisoGuard)
export class TokenPushsController {
  constructor(private service: TokenPushsService) {}

  @Post('upsert')
  @Permisos(...PERMISOS_AUTENTICADOS)
  public async upsert(
    @Body() datos: ICreateTokenPush,
    @GetUser() user: IUsuario,
  ): Promise<ITokenPush> {
    datos.idUsuario = user._id;
    return await this.service.upsert(datos);
  }
}
