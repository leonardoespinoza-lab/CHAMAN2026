import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IApikey, NivelPermiso, Rol } from 'modelos/src';

@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permisosValidos = this.reflector.get<
      { nivel: NivelPermiso; roles: Rol[] }[]
    >('permisos', context.getHandler());

    // Si no se especifica ningún nivel de permiso, se permite el acceso
    if (!permisosValidos?.length) {
      return true;
    }

    // Si se especifica un nivel de permiso, se verifica que el apikey lo tenga
    const res = context.switchToHttp().getResponse();
    const apikey: IApikey = res.locals?.apikey;

    if (!apikey) {
      return false;
    }

    const permisoValido = permisosValidos.some(
      (permiso) =>
        permiso.nivel === apikey.permiso.nivel &&
        permiso.roles.includes(apikey.permiso.rol),
    );

    return permisoValido;
  }
}
