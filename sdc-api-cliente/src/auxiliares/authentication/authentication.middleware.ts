import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticationService } from './authentication.service';
import { LicenciaPorEntidadsService } from 'src/entidades/licenciaPorEntidad/service';
import { AdvisorScopeService } from '../authorization/advisor-scope.service';

@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(
    private service: AuthenticationService,
    private licenciasPorEntidadService: LicenciaPorEntidadsService,
    private advisorScope: AdvisorScopeService,
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
      await this.advisorScope.enrichPermission(permiso, token.user?._id);
      res.locals.token = token;
      res.locals.permiso = permiso;
      res.locals.licencia =
        await this.licenciasPorEntidadService.getLicenciaEfectivaPorPermiso(
          permiso,
        );

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
}
