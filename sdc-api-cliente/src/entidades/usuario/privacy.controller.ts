import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IUsuario } from 'modelos/src';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { GetUser } from '../../auxiliares/authorization/get-token.decorator';
import { PermisoGuard } from '../../auxiliares/authorization/permiso.guard';
import { Permisos } from '../../auxiliares/authorization/permiso.decorator';
import { PERMISOS_AUTENTICADOS } from '../../auxiliares/authorization/permisos-authenticados';
import { API_DATOS } from '../../env';

@Controller('cuenta/privacidad')
@UseGuards(PermisoGuard)
export class PrivacyController {
  constructor(private readonly http: AxiosService) {}

  private options() {
    const token = (process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN || '').trim();
    if (token.length < 32)
      throw new ServiceUnavailableException(
        'Las solicitudes de eliminación aún no están habilitadas.',
      );
    return { headers: { 'X-Privacy-Internal-Token': token } };
  }

  private ownId(user: IUsuario) {
    const id = String(user?._id || '');
    if (!/^[a-f\d]{24}$/i.test(id)) throw new UnauthorizedException();
    return id;
  }

  @Get('eliminacion')
  @Permisos(...PERMISOS_AUTENTICADOS)
  status(@GetUser() user: IUsuario) {
    return this.http.GET(
      `${API_DATOS}/privacy-requests/${this.ownId(user)}`,
      this.options(),
    );
  }

  @Post('eliminacion')
  @Permisos(...PERMISOS_AUTENTICADOS)
  request(@GetUser() user: IUsuario, @Body() body: unknown) {
    const id = this.ownId(user);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (body as any).confirmacion !== 'ELIMINAR MI CUENTA'
    ) {
      throw new BadRequestException(
        'Confirmá la eliminación de tu cuenta. No se admite seleccionar otra cuenta.',
      );
    }
    // The ID comes exclusively from the validated session, never from the body.
    return this.http.POST(
      `${API_DATOS}/privacy-requests/${id}`,
      {},
      this.options(),
    );
  }

  @Get('solicitudes')
  @Permisos({ nivel: 'Admin', roles: ['Admin'] })
  list(@Query('page') page = '0') {
    if (!/^\d{1,5}$/.test(page))
      throw new BadRequestException('Página inválida');
    return this.http.GET(
      `${API_DATOS}/privacy-requests?page=${Number(page)}`,
      this.options(),
    );
  }
}
