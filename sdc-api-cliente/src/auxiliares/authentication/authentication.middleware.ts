import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticationService } from './authentication.service';
import { LicenciaPorEntidadsService } from 'src/entidades/licenciaPorEntidad/service';
import { IPermiso } from 'modelos/src';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(
    private service: AuthenticationService,
    private licenciasPorEntidadService: LicenciaPorEntidadsService,
  ) {}

  async use(req: Request, res: Response, next: () => void) {
    // X-Permiso
    const authorization = req?.headers?.authorization;
    const nroPermiso =
      req?.headers?.['x-permiso'] && req?.headers?.['x-permiso'] !== '-1'
        ? +req.headers?.['x-permiso']
        : 0;

    if (authorization) {
      const token = await this.service.authorization(authorization);
      const permiso = token.user?.permisos?.[nroPermiso];
      const idEntidad = this.getIdEntidad(permiso);
      res.locals.token = token;
      res.locals.permiso = permiso;
      res.locals.licencia = idEntidad
        ? await this.licenciasPorEntidadService.getLicenciaValidaByIdEntidad(
            idEntidad,
          )
        : null; // Null es admin.

      if (!res.locals.permiso) {
        throw new UnauthorizedException({
          message: 'No tiene permiso para acceder a este recurso',
        });
      }
      next();
    } else {
      throw new UnauthorizedException({
        message: 'No se ha encontrado el token de autenticacion',
      });
    }
  }

  private getIdEntidad(permiso: IPermiso): string {
    if (permiso?.nivel === 'Quimica') {
      return permiso.idQuimica;
    } else if (permiso?.nivel === 'Distribuidor') {
      return permiso.idDistribuidor;
    } else if (permiso?.nivel === 'Productor') {
      return permiso.idProductor;
    } else if (permiso?.nivel === 'Establecimiento') {
      return permiso.idProductor;
    }
    return null;
  }
}
